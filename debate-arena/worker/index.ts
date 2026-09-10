import { AIChatAgent } from "@cloudflare/ai-chat";
import { Agent, callable, routeAgentRequest } from "agents";
import {
	convertToModelMessages,
	createUIMessageStreamResponse,
	generateText,
	Output,
	streamText,
	toUIMessageStream,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { RpcTarget } from "cloudflare:workers";
import z from "zod";

const ClaimSchema = z.object({
	stance: z.string().meta({
		description: "The side this advocate is arguing for.",
	}),
	opening: z.string().meta({
		description: "Opening statement that frames the stance.",
	}),
	arguments: z
		.array(
			z.object({
				point: z.string().meta({
					description: "Short title of this argument.",
				}),
				reasoning: z.string().meta({
					description: "Supporting reasoning for the point.",
				}),
			}),
		)
		.length(3)
		.meta({
			description: "Exactly three supporting arguments.",
		}),
	closing: z.string().meta({
		description: "Closing statement that reinforces the stance.",
	}),
});

export type Claim = z.infer<typeof ClaimSchema>;

const StancesSchema = z.object({
	topic: z.string().meta({
		description: "Normalized debate topic in one short phrase.",
	}),
	sideA: z.string().meta({
		description: "First opposing stance extracted from the question.",
	}),
	sideB: z.string().meta({
		description: "Second opposing stance extracted from the question.",
	}),
});

export type DebateArenaState = {
	status:
		| "idle"
		| "extracting"
		| "debating"
		| "judging"
		| "done"
		| "cancelled"
		| "error";
	topic?: string;
	sideA?: string;
	sideB?: string;
	activity?: Record<string, string>;
	errors?: Record<string, string>;
	claims?: {
		a?: Claim;
		b?: Claim;
	};
};

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		const cause =
			"cause" in error && error.cause != null
				? ` (${errorMessage(error.cause)})`
				: "";
		return `${error.message}${cause}`;
	}
	if (typeof error === "string") return error;
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

function isAbortError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const name = "name" in error ? String(error.name) : "";
	const message = "message" in error ? String(error.message) : "";
	return (
		name === "AbortError" ||
		message.toLowerCase().includes("abort") ||
		message.toLowerCase().includes("cancel")
	);
}

class ProgressReporter extends RpcTarget {
	father: DebateArena;
	childName: string;

	constructor(father: DebateArena, childName: string) {
		super();
		this.father = father;
		this.childName = childName;
	}

	report(activity: string) {
		if (
			this.father.state.status === "cancelled" ||
			this.father.state.status === "idle"
		) {
			return;
		}
		this.father.setState({
			...this.father.state,
			activity: {
				...this.father.state.activity,
				[this.childName]: activity,
			},
		});
	}
}

export class Advocate extends Agent<Env> {
	async prepareClaim(
		topic: string,
		stance: string,
		progressReporter: ProgressReporter,
	): Promise<Claim> {
		const workersAi = createWorkersAI({ binding: this.env.AI });
		const stages = [
			"모두발언 작성 중...",
			"논거 1/3 준비 중...",
			"논거 2/3 준비 중...",
			"논거 3/3 준비 중...",
			"마무리 발언 작성 중...",
		];

		let stageIndex = 0;
		progressReporter.report(stages[stageIndex]!);
		const timer = setInterval(() => {
			stageIndex = Math.min(stageIndex + 1, stages.length - 1);
			progressReporter.report(stages[stageIndex]!);
		}, 1200);

		try {
			const { output } = await generateText({
				model: workersAi("@cf/zai-org/glm-4.7-flash"),
				prompt: `You are a debate advocate. Argue ONLY for this stance, without acknowledging the opposing side's case.

Topic: ${topic}
Your stance: ${stance}

Write a persuasive case with:
- an opening statement
- exactly 3 arguments (each with point + reasoning)
- a closing statement

Stay strictly inside your own position. Do not mention or rebut the other side.`,
				output: Output.object({
					schema: ClaimSchema,
				}),
			});

			progressReporter.report("주장 준비 완료");
			return {
				...output,
				stance,
			};
		} catch (error) {
			if (!isAbortError(error)) {
				progressReporter.report(`오류: ${errorMessage(error)}`);
			}
			throw error;
		} finally {
			clearInterval(timer);
		}
	}
}

export class DebateArena extends AIChatAgent<Env, DebateArenaState> {
	initialState: DebateArenaState = {
		status: "idle",
	};

	#debateAbort?: AbortController;
	#activeAdvocates: string[] = ["advocate-a", "advocate-b"];

	async #runAdvocate(
		name: "advocate-a" | "advocate-b",
		topic: string,
		stance: string,
	): Promise<Claim> {
		const reporter = new ProgressReporter(this, name);
		reporter.report("대변인 소환 중...");

		try {
			await this.deleteSubAgent(Advocate, name);
		} catch {
			// First run / already deleted.
		}

		const advocate = await this.subAgent(Advocate, name);
		if (this.#debateAbort?.signal.aborted) {
			throw new DOMException("Debate cancelled", "AbortError");
		}

		reporter.report("주장 생성 시작...");
		// Do NOT pass AbortSignal over subAgent RPC — it is not reliably
		// serializable and can hang the call before prepareClaim starts.
		return advocate.prepareClaim(topic, stance, reporter);
	}

	@callable()
	async cancelDebate() {
		this.#debateAbort?.abort(
			new DOMException("Debate cancelled", "AbortError"),
		);
		for (const name of this.#activeAdvocates) {
			try {
				this.abortSubAgent(
					Advocate,
					name,
					new DOMException("Debate cancelled", "AbortError"),
				);
			} catch {
				// Sub-agent may not exist yet.
			}
		}

		this.setState({
			...this.state,
			status: "cancelled",
			activity: {
				"advocate-a": "중단됨",
				"advocate-b": "중단됨",
			},
		});
	}

	@callable()
	async debate(topic: string) {
		const trimmed = topic.trim();
		if (!trimmed) return;

		this.#debateAbort?.abort(
			new DOMException("Superseded by a new debate", "AbortError"),
		);
		const abort = new AbortController();
		this.#debateAbort = abort;
		const { signal } = abort;

		this.setState({
			status: "extracting",
			topic: trimmed,
			sideA: undefined,
			sideB: undefined,
			activity: {},
			errors: undefined,
			claims: undefined,
		});

		try {
			const workersAi = createWorkersAI({ binding: this.env.AI });
			const {
				output: { topic: normalizedTopic, sideA, sideB },
			} = await generateText({
				model: workersAi("@cf/zai-org/glm-4.7-flash"),
				prompt: `Extract two opposing sides from this debate question.
Return a short normalized topic and the two stances as concise labels.

Question: ${trimmed}

Examples:
- "민초, 찬성인가 반대인가?" → topic "민트초코", sideA "찬성", sideB "반대"
- "탕수육 부먹 대 찍먹?" → topic "탕수육", sideA "부먹", sideB "찍먹"
- "깻잎논쟁?" → topic "깻잎 논쟁", sideA "떼어줘야 한다", sideB "떼면 안 된다"`,
				output: Output.object({
					schema: StancesSchema,
				}),
				abortSignal: signal,
			});

			if (signal.aborted) return;

			this.setState({
				...this.state,
				status: "debating",
				topic: normalizedTopic,
				sideA,
				sideB,
				errors: undefined,
				activity: {
					"advocate-a": "대변인 소환 중...",
					"advocate-b": "대변인 소환 중...",
				},
			});

			const settled = await Promise.allSettled([
				this.#runAdvocate("advocate-a", normalizedTopic, sideA),
				this.#runAdvocate("advocate-b", normalizedTopic, sideB),
			]);

			if (signal.aborted) return;

			const errors: Record<string, string> = {};
			const claimA =
				settled[0].status === "fulfilled" ? settled[0].value : undefined;
			const claimB =
				settled[1].status === "fulfilled" ? settled[1].value : undefined;

			if (settled[0].status === "rejected") {
				if (isAbortError(settled[0].reason)) return;
				errors["advocate-a"] = errorMessage(settled[0].reason);
			}
			if (settled[1].status === "rejected") {
				if (isAbortError(settled[1].reason)) return;
				errors["advocate-b"] = errorMessage(settled[1].reason);
			}

			if (Object.keys(errors).length > 0) {
				this.setState({
					...this.state,
					status: "error",
					claims: { a: claimA, b: claimB },
					errors,
					activity: {
						"advocate-a": errors["advocate-a"]
							? `오류: ${errors["advocate-a"]}`
							: (this.state.activity?.["advocate-a"] ?? "완료"),
						"advocate-b": errors["advocate-b"]
							? `오류: ${errors["advocate-b"]}`
							: (this.state.activity?.["advocate-b"] ?? "완료"),
					},
				});
				return;
			}

			if (!claimA || !claimB) {
				this.setState({
					...this.state,
					status: "error",
					errors: {
						parent: "양쪽 대변인 주장을 모두 받지 못했습니다.",
					},
				});
				return;
			}

			this.setState({
				...this.state,
				status: "judging",
				claims: { a: claimA, b: claimB },
				errors: undefined,
				activity: {
					"advocate-a": "주장 제출 완료",
					"advocate-b": "주장 제출 완료",
				},
			});

			// Persist the user topic and stream the judge verdict through onChatMessage.
			await this.saveMessages((messages) => [
				...messages,
				{
					id: crypto.randomUUID(),
					role: "user",
					parts: [{ type: "text", text: trimmed }],
				},
			]);
		} catch (error) {
			if (signal.aborted || isAbortError(error)) {
				if (this.state.status !== "cancelled") {
					this.setState({
						...this.state,
						status: "cancelled",
						activity: {
							"advocate-a": "중단됨",
							"advocate-b": "중단됨",
						},
					});
				}
				return;
			}
			const message = errorMessage(error);
			this.setState({
				...this.state,
				status: "error",
				errors: {
					parent: message,
				},
				activity: {
					"advocate-a": this.state.activity?.["advocate-a"] ?? "중단됨",
					"advocate-b": this.state.activity?.["advocate-b"] ?? "중단됨",
				},
			});
		} finally {
			if (this.#debateAbort === abort) {
				this.#debateAbort = undefined;
			}
		}
	}

	async onChatMessage(
		_onFinish: unknown,
		options?: {
			abortSignal?: AbortSignal;
		},
	) {
		const workersAi = createWorkersAI({ binding: this.env.AI });
		const { topic, sideA, sideB, claims, status } = this.state;

		if (status === "cancelled") {
			const result = streamText({
				model: workersAi("@cf/zai-org/glm-4.7-flash"),
				prompt:
					"The debate was cancelled by the user. Reply briefly that the debate was stopped and they can start a new one.",
				abortSignal: options?.abortSignal,
			});
			return createUIMessageStreamResponse({
				stream: toUIMessageStream({
					stream: result.stream,
					originalMessages: this.messages,
				}),
			});
		}

		if (!topic || !sideA || !sideB || !claims?.a || !claims?.b) {
			const result = streamText({
				model: workersAi("@cf/zai-org/glm-4.7-flash"),
				system:
					"You are Debate Arena. Ask the user for a debate topic with two opposing sides.",
				messages: await convertToModelMessages(this.messages),
				abortSignal: options?.abortSignal,
			});

			return createUIMessageStreamResponse({
				stream: toUIMessageStream({
					stream: result.stream,
					originalMessages: this.messages,
				}),
			});
		}

		const formatClaim = (label: string, claim: Claim) =>
			[
				`### ${label}: ${claim.stance}`,
				`Opening: ${claim.opening}`,
				...claim.arguments.map(
					(arg, i) =>
						`Argument ${i + 1} — ${arg.point}: ${arg.reasoning}`,
				),
				`Closing: ${claim.closing}`,
			].join("\n");

		const result = streamText({
			model: workersAi("@cf/zai-org/glm-4.7-flash"),
			system: `You are the Debate Arena judge. Compare two independently prepared claims and deliver a verdict.

Rules:
- Declare a clear winner (one of the two stances).
- Name the specific argument (point + brief reason) that was decisive.
- Be fair but decisive. Do not invent arguments that were not provided.
- Respond in the same language as the topic when possible.`,
			prompt: `Topic: ${topic}

${formatClaim("Side A", claims.a)}

${formatClaim("Side B", claims.b)}

Write the verdict now. Include:
1. Winner
2. The decisive argument that swung the judgment
3. A short explanation`,
			abortSignal: options?.abortSignal,
			onFinish: async () => {
				if (this.state.status === "cancelled") return;
				this.setState({
					...this.state,
					status: "done",
				});
			},
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
		return (
			(await routeAgentRequest(request, env)) ??
			new Response(null, { status: 404 })
		);
	},
} satisfies ExportedHandler<Env>;
