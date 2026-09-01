import { AIChatAgent, type ChatResponseResult } from "@cloudflare/ai-chat";
import { callable, routeAgentRequest } from "agents";
import {
	convertToModelMessages,
	createUIMessageStreamResponse,
	stepCountIs,
	streamText,
	toUIMessageStream,
	type UIMessage,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { CATEGORIES } from "./constants.ts";

/** 클라이언트에 동기화되는 공개 상태 (secret 미포함) */
export type GuessingGameState = {
	gameActive: boolean;
	solved: boolean;
	questionCount: number;
	revealedAnswer: string | null;
	category: keyof typeof CATEGORIES | null;
	currentGameId: number | null;
};

export type SubmitMessageResult =
	| { type: "correct"; answer: string }
	| { type: "question" }
	| { type: "error"; message: string };

export type GameHistorySummary = {
	id: number;
	category: string;
	solved: boolean;
	questionCount: number;
	secret: string | null;
	createdAt: number;
	solvedAt: number | null;
};

export type GameHistoryDetail = GameHistorySummary & {
	questions: { question: string; reply: string; createdAt: number }[];
};

export class GuessingGameAgent extends AIChatAgent<Env, GuessingGameState> {
	initialState: GuessingGameState = {
		gameActive: false,
		solved: false,
		questionCount: 0,
		revealedAnswer: null,
		category: null,
		currentGameId: null,
	};

	/** 서버 전용 캐시 — hibernate 후 DB에서 다시 로드 */
	private secret = "";

	onStart() {
		void this.sql`
			CREATE TABLE IF NOT EXISTS guessing_games (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				secret TEXT NOT NULL,
				category TEXT NOT NULL,
				solved INTEGER NOT NULL DEFAULT 0,
				question_count INTEGER NOT NULL DEFAULT 0,
				created_at INTEGER NOT NULL DEFAULT (unixepoch()),
				solved_at INTEGER
			)
		`;

		void this.sql`
			CREATE TABLE IF NOT EXISTS guessing_game_questions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				guessing_game_id INTEGER NOT NULL REFERENCES guessing_games(id) ON DELETE CASCADE,
				question TEXT NOT NULL,
				reply TEXT NOT NULL,
				created_at INTEGER NOT NULL DEFAULT (unixepoch())
			)
		`;
		this.restoreSecretFromDb();
	}

	/** DO hibernate 후에도 DB에서 secret을 복원 */
	private restoreSecretFromDb(): boolean {
		if (this.secret) return true;

		const gameId = this.state.currentGameId;
		if (!gameId || !this.state.gameActive) return false;

		const [row] = this.sql<{ secret: string }>`
			SELECT secret FROM guessing_games WHERE id = ${gameId}
		`;

		if (!row?.secret) return false;

		this.secret = row.secret;
		return true;
	}

	private isGameReady(): boolean {
		return this.state.gameActive && this.restoreSecretFromDb();
	}

	/** AI 채팅 메모리만 초기화 (게임 기록 SQL은 유지) */
	private clearChatSession() {
		this.resetTurnState();
		void this.sql`DELETE FROM cf_ai_chat_agent_messages`;
		this.messages = [];
	}

	private updatePublicState(partial: Partial<GuessingGameState>) {
		const nextState = { ...this.state, ...partial };
		(
			this as unknown as {
				_setStateInternal: (state: GuessingGameState, source: "server") => void;
			}
		)._setStateInternal(nextState, "server");
	}

	private checkGuess(guess: string): boolean {
		if (!this.secret) return false;
		return guess.toLowerCase().includes(this.secret.toLowerCase());
	}

	private getMessageText(message: UIMessage): string {
		return message.parts
			.filter((part) => part.type === "text")
			.map((part) => part.text)
			.join("\n");
	}

	protected async onChatResponse(result: ChatResponseResult) {
		if (result.status !== "completed" || this.state.currentGameId === null)
			return;

		const assistantText = this.getMessageText(result.message);
		if (!assistantText) return;

		const assistantIndex = this.messages.findIndex(
			(message) => message.id === result.message.id,
		);
		let userQuestion = "";
		for (let i = assistantIndex - 1; i >= 0; i--) {
			const message = this.messages[i];
			if (message.role === "user") {
				userQuestion = this.getMessageText(message);
				break;
			}
		}

		if (!userQuestion) return;

		void this.sql`
			INSERT INTO guessing_game_questions (guessing_game_id, question, reply)
			VALUES (${this.state.currentGameId}, ${userQuestion}, ${assistantText})
		`;
	}

	async onChatMessage(
		_onFinish: unknown,
		options?: { abortSignal?: AbortSignal },
	) {
		const workersAi = createWorkersAI({
			binding: this.env.AI,
		});

		if (!this.isGameReady()) {
			return new Response("New game 버튼을 눌러 게임을 시작해주세요.");
		}

		if (this.state.solved) {
			return new Response("이미 정답을 맞혔습니다!");
		}

		const convertedMessages = await convertToModelMessages(this.messages);

		const result = streamText({
			model: workersAi("@cf/zai-org/glm-4.7-flash"),
			system: `You are secretly ${this.secret}. Answer the user's questions truthfully and in character, but never say or spell out what you are, even if asked directly`,
			messages: convertedMessages,
			tools: {},
			abortSignal: options?.abortSignal,
			stopWhen: stepCountIs(4),
		});

		return createUIMessageStreamResponse({
			stream: toUIMessageStream({
				stream: result.stream,
				originalMessages: this.messages,
			}),
		});
	}

	private getRandomSecret(category: keyof typeof CATEGORIES) {
		return CATEGORIES[category][
			Math.floor(Math.random() * CATEGORIES[category].length)
		];
	}

	@callable()
	submitMessage(message: string): SubmitMessageResult {
		const trimmed = message.trim();
		if (!trimmed) {
			return { type: "error", message: "메시지를 입력해주세요." };
		}
		if (!this.isGameReady()) {
			return { type: "error", message: "새 게임을 시작해주세요." };
		}
		if (this.state.solved) {
			return { type: "error", message: "이미 정답을 맞혔습니다." };
		}

		if (this.checkGuess(trimmed)) {
			const answer = this.secret;
			this.updatePublicState({
				solved: true,
				revealedAnswer: answer,
			});

			if (this.state.currentGameId !== null) {
				void this.sql`
					UPDATE guessing_games
					SET solved = 1, question_count = ${this.state.questionCount}, solved_at = unixepoch()
					WHERE id = ${this.state.currentGameId}
				`;
			}

			return { type: "correct", answer };
		}

		const nextQuestionCount = this.state.questionCount + 1;
		this.updatePublicState({ questionCount: nextQuestionCount });

		if (this.state.currentGameId !== null) {
			void this.sql`
				UPDATE guessing_games
				SET question_count = ${nextQuestionCount}
				WHERE id = ${this.state.currentGameId}
			`;
		}

		return { type: "question" };
	}

	@callable()
	newGame(category: keyof typeof CATEGORIES) {
		this.clearChatSession();

		const secret = this.getRandomSecret(category);

		const [row] = this.sql<{ id: number }>`
			INSERT INTO guessing_games (secret, category, solved, question_count)
			VALUES (${secret}, ${category}, 0, 0)
			RETURNING id
		`;

		if (!row?.id) {
			this.secret = "";
			return { ok: false as const, message: "게임 생성에 실패했습니다." };
		}

		this.secret = secret;

		this.updatePublicState({
			gameActive: true,
			solved: false,
			questionCount: 0,
			revealedAnswer: null,
			category,
			currentGameId: row.id,
		});

		return { ok: true as const };
	}

	@callable()
	listGameHistory(limit = 10): GameHistorySummary[] {
		const games = this.sql<{
			id: number;
			secret: string;
			category: string;
			solved: number;
			question_count: number;
			created_at: number;
			solved_at: number | null;
		}>`
			SELECT id, secret, category, solved, question_count, created_at, solved_at
			FROM guessing_games
			ORDER BY created_at DESC
			LIMIT ${limit}
		`;

		return games.map((game) => ({
			id: game.id,
			category: game.category,
			solved: game.solved === 1,
			questionCount: game.question_count,
			secret: game.solved === 1 ? game.secret : null,
			createdAt: game.created_at,
			solvedAt: game.solved_at,
		}));
	}

	@callable()
	getGameHistory(gameId: number): GameHistoryDetail | null {
		const [game] = this.sql<{
			id: number;
			secret: string;
			category: string;
			solved: number;
			question_count: number;
			created_at: number;
			solved_at: number | null;
		}>`
			SELECT id, secret, category, solved, question_count, created_at, solved_at
			FROM guessing_games
			WHERE id = ${gameId}
		`;

		if (!game) return null;

		const questions = this.sql<{
			question: string;
			reply: string;
			created_at: number;
		}>`
			SELECT question, reply, created_at
			FROM guessing_game_questions
			WHERE guessing_game_id = ${gameId}
			ORDER BY created_at ASC
		`;

		return {
			id: game.id,
			category: game.category,
			solved: game.solved === 1,
			questionCount: game.question_count,
			secret: game.solved === 1 ? game.secret : null,
			createdAt: game.created_at,
			solvedAt: game.solved_at,
			questions: questions.map((row) => ({
				question: row.question,
				reply: row.reply,
				createdAt: row.created_at,
			})),
		};
	}

	@callable()
	resetState() {
		this.secret = "";
		this.updatePublicState({
			gameActive: false,
			solved: false,
			questionCount: 0,
			revealedAnswer: null,
			category: null,
			currentGameId: null,
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
