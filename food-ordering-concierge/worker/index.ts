import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import {
	addToCart,
	placeOrder,
	viewCart,
	getLocation,
	getMenu,
	getStore,
	type CartLine,
} from "./tools.ts";
import {
	convertToModelMessages,
	createUIMessageStreamResponse,
	isLoopFinished,
	streamText,
	toUIMessageStream,
	type UIMessage,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { CARD_NUMBER_PATTERN } from "./constants.ts";

export type { CartLine };

export type FoodOrderingState = {
	cart: CartLine[];
};

export class FoodOrderingConciergeAgent extends AIChatAgent<
	Env,
	FoodOrderingState
> {
	initialState: FoodOrderingState = { cart: [] };

	private updatePublicState(partial: Partial<FoodOrderingState>) {
		const nextState = { ...this.state, ...partial };
		(
			this as unknown as {
				_setStateInternal: (state: FoodOrderingState, source: "server") => void;
			}
		)._setStateInternal(nextState, "server");
	}

	private cartAccess() {
		return {
			getCart: () => this.state.cart,
			setCart: (cart: CartLine[]) => this.updatePublicState({ cart }),
		};
	}

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
		const cart = this.cartAccess();

		const result = streamText({
			model: workersAi("@cf/zai-org/glm-4.7-flash"),
			messages: convertedMessages,
			tools: {
				getMenu,
				getLocation,
				getStore,
				addToCart: addToCart(cart),
				viewCart: viewCart(cart),
				placeOrder: placeOrder(cart),
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

	protected sanitizeMessageForPersistence(message: UIMessage): UIMessage {
		return {
			...message,
			parts: message.parts.map((part) => {
				if (part.type === "text") {
					return {
						...part,
						text: part.text.replace(CARD_NUMBER_PATTERN, "[REDACTED]"),
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
