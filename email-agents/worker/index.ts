import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import { createUIMessageStreamResponse, toUIMessageStream, convertToModelMessages, isLoopFinished, streamText } from "ai";


export class EmailAgent extends AIChatAgent<Env> {
  async onChatMessage(
		_onFinish: unknown,
		options?: {
			abortSignal?: AbortSignal;
		},
	) {
		const workersAi = createWorkersAI({ binding: this.env.AI });

		const result = streamText({
			model: workersAi("@cf/zai-org/glm-4.7-flash"),
			messages: await convertToModelMessages(this.messages),
			tools: {},
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
		// const url = new URL(request.url);
		// if (url.pathname.startsWith("/seo")) {
		// 	const key = url.pathname.slice(1);
		// 	const file = await env.FILES.get(key);
		// 	if (file) {
		// 		return new Response(file.body, {
		// 			headers: {
		// 				"Content-Type": file.httpMetadata?.contentType ?? "image/jpeg",
		// 			},
		// 		});
		// 	}
		// }
		return (
			(await routeAgentRequest(request, env)) ??
			new Response(null, { status: 404 })
		);
	},
} satisfies ExportedHandler<Env>;
