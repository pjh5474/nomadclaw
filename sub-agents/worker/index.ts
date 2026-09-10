import { AIChatAgent } from "@cloudflare/ai-chat";
import { Agent, callable, routeAgentRequest } from "agents";
import { generateText, stepCountIs, Output, tool } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import z from "zod";
import Cloudflare from "cloudflare";
import { RpcTarget } from "cloudflare:workers";

const FindingSchema = z.object({
	topic: z.string().meta({
		description: "Short title summarizing what this set of findings is about.",
	}),
	keyFindings: z
		.array(
			z.string().meta({
				description: "A single concise factual statement from the research.",
			}),
		)
		.max(5)
		.meta({
			description:
				"3 to 5 distinct key facts extracted from the research text.",
		}),
});

export type Finding = z.infer<typeof FindingSchema>;

export class Researcher extends Agent<Env> {
	makeCloudflare() {
		return new Cloudflare({
			apiToken: this.env.API_TOKEN,
		});
	}
	async research(query: string, progressReporter: ProgressReporter) {
		const workersAi = createWorkersAI({
			binding: this.env.AI,
		});

		const { text } = await generateText({
			model: workersAi("@cf/zai-org/glm-4.7-flash"),
			prompt: `Research this query and gather facts: ${query}`,
			tools: {
				searchWeb: tool({
					description:
						"Search the web via DuckDuckGo. Return the SERP as markdown.",
					inputSchema: z.object({ searchQuery: z.string() }),
					execute: async ({ searchQuery }) => {
						progressReporter.report(`Searching for ${searchQuery}`);
						const markdown =
							await this.makeCloudflare().browserRendering.markdown.create({
								account_id: this.env.ACCOUNT_ID,
								url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`,
							});
						return {
							ok: true,
							results: markdown,
						};
					},
				}),
				readPage: tool({
					description: "Fetch a URL and return clean markdown via Browser Run.",
					inputSchema: z.object({ url: z.url() }),
					execute: async ({ url }) => {
						progressReporter.report(`Reading ${url}`);
						const markdown =
							await this.makeCloudflare().browserRendering.markdown.create({
								account_id: this.env.ACCOUNT_ID,
								url,
							});
						return {
							ok: true,
							markdown,
						};
					},
				}),
			},
			stopWhen: stepCountIs(5),
		});

		const { output } = await generateText({
			model: workersAi("@cf/zai-org/glm-4.7-flash"),
			prompt: `Read the following research and give me relevant 3 to 5 facts. \n\nResearch: ${text}`,
			stopWhen: stepCountIs(5),
			output: Output.object({
				schema: FindingSchema,
			}),
		});
		return output;
	}
}

export type OrchestratorState = {
	status: "idle" | "planning";
	plan?: string[];
	findings?: Finding[];
	activity?: Record<string, string>;
};

class ProgressReporter extends RpcTarget {
	father: Orchestrator;
	childName: string;

	constructor(father: Orchestrator, childName: string) {
		super();
		this.father = father;
		this.childName = childName;
	}

	report(activity: string) {
		this.father.setState({
			...this.father.state,
			activity: {
				...this.father.state.activity,
				[this.childName]: activity,
			},
		});
	}
}

export class Orchestrator extends AIChatAgent<Env, OrchestratorState> {
	initialState: OrchestratorState = {
		status: "idle",
	};

	@callable()
	async research(query: string) {
		this.setState({
			status: "planning",
		});
		const workersAi = createWorkersAI({
			binding: this.env.AI,
		});
		const {
			output: { queries },
		} = await generateText({
			model: workersAi("@cf/zai-org/glm-4.7-flash"),
			output: Output.object({
				schema: z.object({
					queries: z
						.array(
							z.string().meta({
								description:
									"A query for a search engine, exploring an angle of research",
							}),
						)
						.max(3)
						.min(3)
						.meta({
							description:
								"Three distinct research angles. Phrased as search queries",
						}),
				}),
			}),
			prompt: `Break this topic into 3 different research angles: ${query}.\n Each has to be phrased as a research query`,
		});

		this.setState({
			...this.state,
			plan: queries,
		});

		const outputs = await Promise.all(
			queries.map(async (query, index) => {
				const stubAgent = await this.subAgent(
					Researcher,
					`researcher-${index}`,
				);
				const reporter = new ProgressReporter(this, `researcher-${index}`);
				const result = await stubAgent.research(query, reporter);
				return result;
			}),
		);

		this.setState({
			...this.state,
			findings: outputs,
		});
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
