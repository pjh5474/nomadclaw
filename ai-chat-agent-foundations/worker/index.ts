import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import {
	convertToModelMessages,
	createUIMessageStreamResponse,
	stepCountIs,
	streamText,
	toUIMessageStream,
	type UIMessage,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import {
	buyPlaneTicket,
	getLocation,
	getTickets,
	getWeather,
} from "./tools.ts";

export class PotatoChatAgent extends AIChatAgent<Env> {
	async onChatMessage(
		_onFinish: unknown,
		options?: {
			abortSignal?: AbortSignal;
		},
	) {
		const workersAi = createWorkersAI({
			binding: this.env.AI,
		});
		const convertedMessages = await convertToModelMessages(this.messages);
		const result = streamText({
			model: workersAi("@cf/zai-org/glm-4.7-flash"),
			messages: convertedMessages,
			tools: {
				getWeather,
				getLocation,
				getTickets,
				buyPlaneTicket,
			},
			abortSignal: options?.abortSignal,
			stopWhen: stepCountIs(10),
		});

		return createUIMessageStreamResponse({
			stream: toUIMessageStream({
				stream: result.stream,
				originalMessages: this.messages,
			}),
		});
	}

	// change or sensitive data from the message before it is saved in memory
	protected sanitizeMessageForPersistence(message: UIMessage): UIMessage {
		return {
			...message,
			parts: message.parts.map((part) => {
				if (part.type === "text") {
					return {
						...part,
						text: part.text.replace("food", "🥕 stop eating u fat 🥕"),
					};
				}
				return part;
			}),
		};
	}
}

export default {
	async fetch(request, env) {
		return (
			(await routeAgentRequest(request, env)) ??
			new Response(null, { status: 404 })
		);
	},
} satisfies ExportedHandler<Env>;
