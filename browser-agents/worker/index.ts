import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
export { CodemodeRuntime } from "@cloudflare/codemode";
import {
	convertToModelMessages,
	createUIMessageStreamResponse,
	isLoopFinished,
	streamText,
	tool,
	toUIMessageStream,
} from "ai";
import puppeteer, { type Browser, type Page } from "@cloudflare/puppeteer";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";
import { createAuditSeoTool } from "./tools.ts";

const SEO_SYSTEM_PROMPT = `You are an expert SEO auditor. When a user provides a URL, use the auditSeo tool to audit it.

After receiving the audit results, present a clear report in this format:

## SEO Audit Result — [URL]

**Score: X / 100**

### Passed Checks
- List passed checks with their values

### Failed Checks
For each failed check:
- What failed and what was found
- **Fix:** Concrete, actionable fix

### Screenshot
The screenshot is already shown in the chat UI from the tool result. Mention that a page screenshot was captured; do not paste base64.`;

export class BrowserAgent extends AIChatAgent<Env> {
	browser?: Browser;
	page?: Page;

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
		},
	) {
		const workersAi = createWorkersAI({ binding: this.env.AI });

		const result = streamText({
			model: workersAi("@cf/zai-org/glm-4.7-flash"),
			system: SEO_SYSTEM_PROMPT,
			messages: await convertToModelMessages(this.messages),
			tools: {
				navigate: tool({
					description: "Navigate to a website",
					inputSchema: z.object({
						url: z.url().meta({
							description: "The url of the page to visit (https://)",
						}),
					}),
					execute: async ({ url }) => {
						const page = await this.getPage();
						await page.goto(url);
						return { ok: true, title: await page.title() };
					},
				}),
				closeBrowser: tool({
					description: "Close the browser session",
					inputSchema: z.object({}),
					execute: async () => {
						await this.closeBrowser();
						return { ok: true, message: "Browser closed" };
					},
				}),
				takeScreenshot: tool({
					description: "Take a screenshot of the page",
					inputSchema: z.object({}),
					execute: async () => {
						const page = await this.getPage();
						const buffer = await page.screenshot({
							type: "jpeg",
						});
						const key = `seo/${Date.now()}.jpeg`;
						await this.env.FILES.put(key, buffer, {
							httpMetadata: {
								contentType: "image/jpeg",
							},
						});
						return { ok: true, filename: key };
					},
				}),

				auditSeo: createAuditSeoTool(this.env.BROWSER, this.env.FILES),
			},
			abortSignal: options?.abortSignal,
			stopWhen: isLoopFinished(),
		});

		return createUIMessageStreamResponse({
			stream: toUIMessageStream({
				stream: result.stream,
				originalMessages: this.messages,
			}),
		});
	}
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname.startsWith("/seo")) {
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
