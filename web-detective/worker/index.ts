import { createWorkersAI } from "workers-ai-provider"
import { AIChatAgent } from "@cloudflare/ai-chat";
import { callable, routeAgentRequest } from "agents";
import puppeteer, { type Browser, type Page } from "@cloudflare/puppeteer";
import { z } from "zod";
import { convertToModelMessages, createUIMessageStreamResponse, isLoopFinished, streamText, tool, toUIMessageStream } from "ai";
import { WEB_DETECTIVE_SYSTEM_PROMPT } from "./prompt.ts";

export type WebDetectiveState = {
	evidenceKeys: string[];
	lastVisitedUrl: string | null;
	urlVisitedHistory: string[];
}


export class WebDetectiveAgent extends AIChatAgent<Env, WebDetectiveState> {
	initialState: WebDetectiveState = {
		evidenceKeys: [],
		lastVisitedUrl: null,
		urlVisitedHistory: [],
	}

	browser?: Browser;
	page?: Page;

	onStart() {
		void this.sql`
			CREATE TABLE IF NOT EXISTS web_detective_actions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				url TEXT NOT NULL,
				created_at INTEGER NOT NULL
			)
		`;

		void this.sql`
			CREATE TABLE IF NOT EXISTS web_detective_evidences (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				web_detective_action_id INTEGER NOT NULL REFERENCES web_detective_actions(id) ON DELETE CASCADE,
				key TEXT NOT NULL,
				created_at INTEGER NOT NULL
			)
		`;
	}


	async getPage() {
		if (this.page && this.browser?.connected) return this.page;
		this.browser = await puppeteer.launch(this.env.BROWSER);
		this.page = await this.browser.newPage();

		await this.page.setViewport({ width: 1280, height: 720 });
		return this.page;
	}

	async closeBrowser() {
		await this.browser?.close();
		this.browser = undefined;
		this.page = undefined;
	}

	async onChatMessage(
		_onFinish: unknown,
		options?: {
			abortSignal?: AbortSignal;
		}
	) {
		const workersAi = createWorkersAI({ binding: this.env.AI });

		const result = streamText({
			model: workersAi("@cf/zai-org/glm-4.7-flash"),
			system: WEB_DETECTIVE_SYSTEM_PROMPT,
			messages: await convertToModelMessages(this.messages),
			tools: {
				navigate: tool({
					description: "Navigate to a website",
					inputSchema: z.object({
						url: z.url().meta({
							description: "The url of the page to visit (https://)",
						}),
					}),
					execute: async ({url}) => {
						const page = await this.getPage();
						await page.goto(url);
						return { ok: true, title: await page.title() };
					}
				}),
				closeBrowser: tool({
					description: "Close the browser session",
					inputSchema: z.object({}),
					execute: async () => {
						await this.closeBrowser();
						return { ok: true, message: "Browser closed" };
					}
				}),
				takeScreenshot: tool({
					description: "Take a screenshot of the page",
					inputSchema: z.object({}),
					execute: async () => {
						const page = await this.getPage();
						const buffer = await page.screenshot({
							type: "jpeg",
						});
						const key = `evidence/${Date.now()}.jpeg`;
						await this.env.FILES.put(key, buffer, {
							httpMetadata: {
								contentType: "image/jpeg",
							},
						});
						return { ok: true, filename: key }
					}
				})
					
				
			},
			abortSignal: options?.abortSignal,
			stopWhen: isLoopFinished(),
		})
		return createUIMessageStreamResponse({
			stream: toUIMessageStream({
				stream: result.stream,
				originalMessages: this.messages,
			})
		})
	}

	@callable()
	resetWebDetectiveState() {
		this.initialState = {
			evidenceKeys: [],
			lastVisitedUrl: null,
			urlVisitedHistory: [],
		}
	}

	@callable()
	readWebDetectiveActions() {
		const actions = this.sql`
			SELECT id, url, created_at FROM web_detective_actions
			ORDER BY created_at DESC
			LIMIT 10
		`;
		return actions.map((action) => ({
			url: action.url,
			createdAt: action.created_at,
		}));
	}

	@callable()
	readWebDetectiveEvidences(actionId: number) {
		const evidences = this.sql`
			SELECT id, key, created_at FROM web_detective_evidences
			WHERE web_detective_action_id = ${actionId}
			ORDER BY created_at DESC
		`;
		return evidences.map((evidence) => ({
			key: evidence.key,
			createdAt: evidence.created_at,
		}));
	}
}



export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname.startsWith("/evidence")) {
			const key = url.pathname.slice(1);
			const file = await env.FILES.get(key);
			if (file) {
				return new Response(file.body, {
					headers: {
						"Content-Type": file.httpMetadata?.contentType ?? "image/jpeg",
					},
				});
			}
		}
		return (
			(await routeAgentRequest(request, env)) ??
			new Response(null, { status: 404 })
		);
	},
} satisfies ExportedHandler<Env>;
