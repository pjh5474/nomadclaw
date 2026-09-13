import { Think, type ChatResponseResult } from "@cloudflare/think";
import { callable, routeAgentRequest } from "agents";
import { tool, type LanguageModel, type ToolSet } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";

type ThinkAgentState = {
	files: {
		path: string;
		type: "file" | "directory";
		size: number;
		updatedAt: number;
	}[];
};

export class ThinkAgent extends Think<Env> {
	initialState: ThinkAgentState = {
		files: [],
	};

	async refreshFiles() {
		const all = await this.workspace.glob("**/*");
		this.setState({
			files: all.map((file) => ({
				path: file.path,
				type: file.type === "file" ? "file" : "directory",
				size: file.size,
				updatedAt: file.updatedAt,
			})),
		});
	}

	async onStart() {
		await this.refreshFiles();
	}

	async onChatResponse() {
		await this.refreshFiles();
	}

	getModel(): LanguageModel {
		const workersAI = createWorkersAI({ binding: this.env.AI });
		return workersAI("@cf/zai-org/glm-4.7-flash");
	}

	getTools(): ToolSet {
		return {
			getWeather: tool({
				description: "Get Weather",
				inputSchema: z.object({
					city: z.string().meta({
						description: "The city to get the weather for",
					}),
				}),
				execute: async ({ city }) => {
					return `The weather in ${city} is sunny`;
				},
			}),
		};
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
