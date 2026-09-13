import { Agent, callable, routeAgentRequest } from "agents";
import {
	AgentWorkflow,
	type AgentWorkflowEvent,
	type AgentWorkflowStep,
} from "agents/workflows";

import type { Order, State } from "./types";

type Params = {
	// orderId: string;
	agentName: string;
};

type ApprovalMetadata = {
	note: string;
	eta: number;
	approved: boolean;
};

type WorkflowProgress = {
	chargeAttempts: number;
};

export class PizzaWorkflow extends AgentWorkflow<
	RestaurantAgent,
	Params,
	WorkflowProgress
> {
	async run(_event: AgentWorkflowEvent<Params>, step: AgentWorkflowStep) {
		// const reportProgress = async (patch: Partial<Order>) => {
		// 	const agent = await getAgentByName(
		// 		this.env.RestaurantAgent,
		// 		event.payload.agentName,
		// 	);
		// 	await agent.updateOrder(event.instanceId, patch);
		// };

		const updateState = async (patch: Partial<Order>) => {
			const orders = await this.agent.getOrders();
			const order = orders[this.workflowId];
			await step.updateAgentState({
				orders: {
					...orders,
					[this.workflowId]: {
						...order,
						...patch,
					},
				},
			});
		};

		await updateState({
			stage: "awaiting-approval",
		});

		// let decision;
		let attempt = 0;
		try {
			// decision = await step.waitForEvent<ApprovalMetadata>("decide-approval", {
			// 	timeout: "30 seconds",
			// 	type: "potato-approval",
			// });
			const decision = await this.waitForApproval<ApprovalMetadata>(step, {
				timeout: "30 seconds",
			});
			await updateState({
				etaMinutes: decision.eta,
				note: decision.note,
				stage: "paying",
			});

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
					attempt++;
					this.reportProgress({
						chargeAttempts: attempt,
					});
					if (Math.random() < 0.8) throw new Error("Card declined");

					return {
						chargedAt: Date.now(),
					};
				},
			);

			await updateState({
				stage: "preparing",
			});

			await step.sleep("preparing sleep", "5 seconds");

			await updateState({
				stage: "baking",
			});

			await step.sleep("baking sleep", "5 seconds");

			await updateState({
				stage: "delivering",
			});

			await step.sleep("delivering sleep", "5 seconds");

			await updateState({
				stage: "delivered",
			});
		} catch (e) {
			console.error(e);
			await updateState({
				stage: "rejected",
			});
			return;
		}

		await step.reportComplete({
			something: "hello",
		});

		// if (!decision?.payload.approved) {
		// 	await updateState({
		// 		stage: "rejected",
		// 	});
		// 	return;
		// }

		// await updateState({
		// 	etaMinutes: decision?.payload.eta,
		// 	note: decision?.payload.note,
		// 	stage: "paying",
		// });

		// let attempt = 0;
		// try {
		// 	await step.do(
		// 		"charge",
		// 		{
		// 			retries: {
		// 				limit: 10,
		// 				delay: "5 seconds",
		// 				backoff: "constant",
		// 			},
		// 		},
		// 		async () => {
		// 			await updateState({
		// 				chargeAttempts: attempt,
		// 			});
		// 			attempt++;
		// 			if (Math.random() < 0.8) throw new Error("Card declined");

		// 			return {
		// 				chargedAt: Date.now(),
		// 			};
		// 		},
		// 	);
		// } catch (e) {
		// 	console.log(e);
		// 	await updateState({
		// 		stage: "rejected",
		// 	});
		// 	return;
		// }
	}
}

export class RestaurantAgent extends Agent<Env, State> {
	initialState: State = { orders: {} };

	async onWorkflowComplete(
		workflowName: string,
		workflowId: string,
		result?: unknown,
	) {
		console.log("workflow complete", workflowName, workflowId, result);
	}

	@callable()
	async placeOrder() {
		// const { id } = await this.env.PIZZA_WORKFLOW.create({
		// 	params: {
		// 		agentName: this.name,
		// 	},
		// });
		// this.setState({
		// 	orders: {
		// 		...this.state.orders,
		// 		[id]: {
		// 			orderId: id,
		// 			stage: "pending",
		// 		},
		// 	},
		// });
		const orderId = await this.runWorkflow("PIZZA_WORKFLOW", {});
		this.setState({
			orders: {
				...this.state.orders,
				[orderId]: {
					orderId,
					stage: "pending",
				},
			},
		});
	}

	getOrders() {
		return this.state.orders;
	}

	// @callable()
	// async updateOrder(orderId: string, patch: Partial<Order>) {
	// 	this.setState({
	// 		orders: {
	// 			...this.state.orders,
	// 			[orderId]: {
	// 				...this.state.orders[orderId],
	// 				...patch,
	// 			},
	// 		},
	// 	});
	// }

	@callable()
	async approveOrder(orderId: string, eta: number, note: string) {
		// const instance = await this.env.PIZZA_WORKFLOW.get(orderId);
		// await instance.sendEvent({
		// 	type: "potato-approval",
		// 	payload: {
		// 		note,
		// 		eta,
		// 		approved: true,
		// 	},
		// });
		await this.approveWorkflow(orderId, {
			reason: "Approved by the kitchen",
			metadata: {
				eta,
				note,
			},
		});
	}

	@callable()
	async rejectOrder(orderId: string) {
		// const instance = await this.env.PIZZA_WORKFLOW.get(orderId);
		// await instance.sendEvent({
		// 	type: "potato-approval",
		// 	payload: {
		// 		approved: false,
		// 	},
		// });
		await this.rejectWorkflow(orderId, {
			reason: "Rejected by the kitchen",
		});
	}

	// onWorkflowProgress(workflowName: string, workflowId: string, progress: DefaultProgress) {

	// }
}

export default {
	async fetch(request, env) {
		return (
			(await routeAgentRequest(request, env)) ??
			new Response("Not found", { status: 404 })
		);
	},
} satisfies ExportedHandler<Env>;
