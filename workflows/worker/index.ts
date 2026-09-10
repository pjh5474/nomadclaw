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
}

export default {
	async fetch(request, env) {
		return (
			(await routeAgentRequest(request, env)) ??
			new Response("Not found", { status: 404 })
		);
	},
} satisfies ExportedHandler<Env>;
