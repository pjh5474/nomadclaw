import { Think, skills } from "@cloudflare/think";
import { createExtensionTools } from "@cloudflare/think/tools/extensions";
import { callable, routeAgentRequest } from "agents";
import type { ContextConfig } from "agents/context";
import type { SkillSource } from "agents/skills";
import { tool, type ToolSet } from "ai";
import { z } from "zod";

const logDateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD (e.g. 2026-09-14)");

type CoachAgentState = {
	files: {
		path: string;
		type: "file" | "directory";
		size: number;
		updatedAt: number;
	}[];
	skills: {
		name: string;
		description: string;
	}[];
	extensions: {
		name: string;
		version: string;
		description?: string;
		tools: string[];
	}[];
};

export class CoachAgent extends Think<Env> {
	extensionLoader = this.env.LOADER;

	initialState: CoachAgentState = {
		files: [],
		skills: [],
		extensions: [],
	};

	private currentState(): CoachAgentState {
		const state = this.state as Partial<CoachAgentState>;
		return {
			files: state.files ?? [],
			skills: state.skills ?? [],
			extensions: state.extensions ?? [],
		};
	}

	private patchState(patch: Partial<CoachAgentState>) {
		this.setState({
			...this.currentState(),
			...patch,
		});
	}

	async refreshFiles() {
		const all = await this.workspace.glob("**/*");
		this.patchState({
			files: all.map((file) => ({
				path: file.path,
				type: file.type === "file" ? "file" : "directory",
				size: file.size,
				updatedAt: file.updatedAt,
			})),
		});
	}

	async refreshSkills() {
		const sources = await this.getSkills();
		const catalog: CoachAgentState["skills"] = [];
		for (const source of sources) {
			const listed = await source.list();
			for (const skill of listed) {
				catalog.push({
					name: skill.name,
					description: skill.description,
				});
			}
		}
		this.patchState({ skills: catalog });
	}

	async refreshExtensions() {
		const listed = this.extensionManager?.list() ?? [];
		this.patchState({
			extensions: listed.map((ext) => ({
				name: ext.name,
				version: ext.version,
				description: ext.description,
				tools: ext.tools,
			})),
		});
	}

	async onStart() {
		await this.refreshFiles();
		await this.refreshSkills();
		await this.refreshExtensions();
	}

	async onChatResponse() {
		await this.refreshFiles();
		await this.refreshExtensions();
		await this.context.refreshSystemPrompt();
	}

	/** Workers AI model — chat, persistence, streaming, workspace tools come free from Think. */
	getModel() {
		return "@cf/moonshotai/kimi-k2.5";
	}

	getTools(): ToolSet {
		return {
			saveTrainingLog: tool({
				description:
					"Save today's training log. The storage path is fixed internally to logs/YYYY-MM-DD.md. Do not provide a path.",
				inputSchema: z.object({
					date: logDateSchema.describe("Training date as YYYY-MM-DD"),
					content: z
						.string()
						.describe(
							"Markdown log body: exercises, weight, sets, reps, notes",
						),
				}),
				execute: async ({ date, content }) => {
					const path = `logs/${date}.md`;
					await this.workspace.writeFile(path, content);
					await this.refreshFiles();
					return { ok: true, path };
				},
			}),
			readTrainingLog: tool({
				description:
					"Read a training log by date. Logs are always stored under logs/YYYY-MM-DD.md.",
				inputSchema: z.object({
					date: logDateSchema.describe("Training date as YYYY-MM-DD"),
				}),
				execute: async ({ date }) => {
					const path = `logs/${date}.md`;
					const content = await this.workspace.readFile(path);
					return { path, content };
				},
			}),
			...createExtensionTools({ manager: this.extensionManager! }),
		};
	}

	configureContext(): ContextConfig[] | Promise<ContextConfig[]> {
		return [
			{
				label: "soul",
				provider: {
					get: async () =>
						[
							"You are a personal fitness coach.",
							"Encourage the user, but never accept excuses — push for accountability and follow-through.",
							"In every conversation, ask how their training went (or how they feel about today's session).",
							"Always close by naming one clear focus for tomorrow's workout so they leave with a next step.",
							"Reply in the user's language (Korean when they write Korean).",
							"",
							"## Training logs",
							"When the user reports a workout, call `saveTrainingLog` with date (YYYY-MM-DD) and markdown content only.",
							"Never invent or pass a file path — the server always writes to `logs/YYYY-MM-DD.md`.",
							"Do not use generic workspace write tools for training logs.",
							"When asked what they did on a day or this week, call `readTrainingLog` for each relevant date (and read `plan.md` with workspace tools if needed). Do not guess.",
							"Keep `plan.md` up to date for this week's schedule using workspace file tools.",
							"",
							"## Memory",
							"Persist body stats, injuries, and goals with `set_context` on the `memory` block (replace or append as needed).",
							"Always consult memory when planning workouts (especially injuries).",
							"",
							"## Skills",
							"Exercise guides live in Agent Skills. When the user asks about form, programming, or stretching,",
							"call `activate_skill` for the matching skill (e.g. squat-form, running-program, stretching), answer from it,",
							"and do not keep the guide loaded afterward — activate only when needed for that answer.",
							"",
							"## Runtime extensions",
							"If you need a calculator or helper that does not exist yet (e.g. 1RM), create it with `load_extension`",
							"using JavaScript source. On later turns, call the loaded tool by its prefixed name (e.g. `onerm_estimate`).",
							"Prefer Epley for 1RM: weight * (1 + reps/30).",
						].join("\n"),
				},
			},
			{
				label: "memory",
				description:
					"Durable profile: body metrics (weight, height), injuries/limitations, and fitness goals. Use set_context whenever the user shares or updates these.",
				maxTokens: 10_000,
			},
		];
	}

	/** R2 exercise guides — Think adds the skills catalog + activate_skill automatically. */
	getSkills(): SkillSource[] {
		return [
			skills.r2(this.env.SKILLS, { prefix: "skills/", refreshIntervalMs: 0 }),
		];
	}

	@callable()
	async readWorkspaceFile(path: string) {
		return await this.workspace.readFile(path);
	}
}

export default {
	async fetch(request, env) {
		return (
			(await routeAgentRequest(request, env)) ??
			new Response("Not found", { status: 404 })
		);
	},
} satisfies ExportedHandler<Env>;
