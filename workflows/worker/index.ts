import { Agent, callable, getAgentByName, routeAgentRequest } from "agents";
import {
	WorkflowEntrypoint,
	WorkflowStep,
	type WorkflowEvent,
} from "cloudflare:workers";
import type { Order, State } from "./types";

type Params = {
	// orderId: string;
	agentName: string;
};

type EventPayload = {
	note: string;
	eta: number;
	approved: boolean;
};

export class PizzaWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		const reportProgress = async (patch: Partial<Order>) => {
			const agent = await getAgentByName(
				this.env.RestaurantAgent,
				event.payload.agentName,
			);
			await agent.updateOrder(event.instanceId, patch);
		};

		await reportProgress({
			stage: "awaiting-approval",
		});

		let decision;
		try {
			decision = await step.waitForEvent<EventPayload>("decide-approval", {
				timeout: "30 seconds",
				type: "potato-approval",
			});
		} catch (e) {
			console.error(e);
			await reportProgress({
				stage: "rejected",
			});
			return;
		}

		if (!decision?.payload.approved) {
			await reportProgress({
				stage: "rejected",
			});
			return;
		}

		await reportProgress({
			etaMinutes: decision?.payload.eta,
			note: decision?.payload.note,
			stage: "paying",
		});

		let attempt = 0;
		try {
			await step.do(
				"charge",
				{
					retries: {
						limit: 10,
						delay: "5 seconds",
						backoff: "constant",
					},
				},
				async () => {
					await reportProgress({
						chargeAttempts: attempt,
					});
					attempt++;
					if (Math.random() < 0.8) throw new Error("Card declined");

					return {
						chargedAt: Date.now(),
					};
				},
			);
		} catch (e) {
			console.log(e);
			await reportProgress({
				stage: "rejected",
			});
			return;
		}

		await reportProgress({
			stage: "preparing",
		});

		await step.sleep("preparing sleep", "10 seconds");

		await reportProgress({
			stage: "baking",
		});

		await step.sleep("baking sleep", "10 seconds");

		await reportProgress({
			stage: "delivering",
		});

		await step.sleep("delivering sleep", "10 seconds");

		await reportProgress({
			stage: "delivered",
		});
	}
}

export class RestaurantAgent extends Agent<Env, State> {
	initialState: State = { orders: {} };

	@callable()
	async placeOrder() {
		const { id } = await this.env.PIZZA_WORKFLOW.create({
			params: {
				agentName: this.name,
			},
		});
		this.setState({
			orders: {
				...this.state.orders,
				[id]: {
					orderId: id,
					stage: "pending",
				},
			},
		});
	}

	@callable()
	async updateOrder(orderId: string, patch: Partial<Order>) {
		this.setState({
			orders: {
				...this.state.orders,
				[orderId]: {
					...this.state.orders[orderId],
					...patch,
				},
			},
		});
	}

	@callable()
	async approveOrder(orderId: string, eta: number, note: string) {
		const instance = await this.env.PIZZA_WORKFLOW.get(orderId);
		await instance.sendEvent({
			type: "potato-approval",
			payload: {
				note,
				eta,
				approved: true,
			},
		});
	}

	@callable()
	async rejectOrder(orderId: string) {
		const instance = await this.env.PIZZA_WORKFLOW.get(orderId);
		await instance.sendEvent({
			type: "potato-approval",
			payload: {
				approved: false,
			},
		});
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
