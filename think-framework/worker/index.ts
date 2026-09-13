import { Think } from "@cloudflare/think";
import { routeAgentRequest } from "agents";
import type { LanguageModel } from "ai";
import { createWorkersAI } from "workers-ai-provider";

export class ThinkAgent extends Think<Env> {
	getModel(): LanguageModel {
		const workersAI = createWorkersAI({ binding: this.env.AI });
		return workersAI("@cf/zai-org/glm-4.7-flash");
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
