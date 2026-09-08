import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentEmail, routeAgentRequest } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import {
	createUIMessageStreamResponse,
	toUIMessageStream,
	convertToModelMessages,
	isLoopFinished,
	streamText,
} from "ai";
import { createAddressBasedEmailResolver, type AgentEmail } from "agents/email";
import PostalMime from "postal-mime";

export class EmailAgent extends AIChatAgent<Env> {
	async onEmail(email: AgentEmail) {
		const raw = await email.getRaw();
		const parsed = await PostalMime.parse(raw);
		console.log(parsed.to, parsed.from, parsed.text);
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
	async email(message, env, ctx) {
		await routeAgentEmail(message, env, {
			resolver: createAddressBasedEmailResolver("EmailAgent"),
		});
	},
} satisfies ExportedHandler<Env>;
