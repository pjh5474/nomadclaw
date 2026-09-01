import {
	Agent,
	callable,
	getAgentByName,
	getCurrentAgent,
	routeAgentRequest,
	type Connection,
	type ConnectionContext,
	type WSMessage,
} from "agents";
import {
	DEFAULT_ROOM_NAME,
	MIN_VOTE_OPTIONS,
	SPECTATOR_NICKNAME,
	VOTE_EXTEND_MS,
} from "@/shared/constants";
import type {
	ChattingRoomState,
	PollHistorySummary,
	PollOption,
	RoomDirectory,
	RoomSummary,
} from "@/shared/types";

export type {
	ChattingRoomState,
	PollHistorySummary,
	PollOption,
	RoomDirectory,
} from "@/shared/types";

type ConnectionState = {
	nickname: string;
	readonly?: boolean;
	city: string;
};

export class ChattingRoomAgent extends Agent<Env, ChattingRoomState> {
	initialState: ChattingRoomState = {
		participantsOnline: 0,
		spectatorsOnline: 0,
		chatRoomName: DEFAULT_ROOM_NAME,
		question: "",
		options: [],
		closed: true,
		closesAt: null,
		pollStartedAt: null,
	};

	shouldConnectionBeReadonly(_connection: Connection, ctx: ConnectionContext) {
		const url = new URL(ctx.request.url);
		return url.searchParams.get("readonly") === "true";
	}

	/** Lifecycle hooks run inside the connecting connection's context; readonly connections cannot use setState(). */
	private updateServerState(partial: Partial<ChattingRoomState>) {
		const nextState = { ...this.state, ...partial };
		(
			this as unknown as {
				_setStateInternal: (state: ChattingRoomState, source: "server") => void;
			}
		)._setStateInternal(nextState, "server");
	}

	private getRoomTokenFromDb() {
		const [row] = this.sql<{ room_token: string }>`
			SELECT room_token FROM room_config WHERE id = 1
		`;
		return row?.room_token ?? null;
	}

	private getCityFromRequest(request: Request) {
		const cf = request.cf as { city?: string } | undefined;
		return cf?.city ?? "Unknown";
	}

	onConnect(connection: Connection, ctx: ConnectionContext) {
		const url = new URL(ctx.request.url);
		const providedToken = url.searchParams.get("token");
		const roomToken = this.getRoomTokenFromDb();

		if (!roomToken || providedToken !== roomToken) {
			connection.close(4401, "Unauthorized");
			return;
		}

		const isReadonly = url.searchParams.get("readonly") === "true";
		const nickname =
			url.searchParams.get("nickname")?.trim() || SPECTATOR_NICKNAME;
		const city = this.getCityFromRequest(ctx.request);

		connection.setState({
			nickname,
			readonly: isReadonly,
			city,
		} satisfies ConnectionState);

		if (isReadonly) {
			this.updateServerState({
				spectatorsOnline: this.state.spectatorsOnline + 1,
			});
		} else {
			this.updateServerState({
				participantsOnline: this.state.participantsOnline + 1,
			});
		}
	}

	onClose(connection: Connection<ConnectionState>) {
		if (connection.state?.readonly) {
			this.updateServerState({
				spectatorsOnline: Math.max(0, this.state.spectatorsOnline - 1),
			});
		} else {
			this.updateServerState({
				participantsOnline: Math.max(0, this.state.participantsOnline - 1),
			});
		}
	}

	onMessage(connection: Connection<ConnectionState>, message: WSMessage) {
		if (connection.state?.readonly) return;

		const messageObject = {
			nickname: connection.state?.nickname,
			message: message.toString(),
			created_at: Date.now(),
		};

		if (message.toString().includes("delete")) {
			this.scheduleEvery(30, "deleteMessages");
		}

		const [inserted] = this.sql<{ id: number }>`
			INSERT INTO messages (nickname, message, created_at)
			VALUES (${messageObject.nickname ?? "anon"}, ${messageObject.message}, ${messageObject.created_at})
			RETURNING id
		`;

		const payload = {
			id: inserted?.id ?? Date.now(),
			nickname: messageObject.nickname ?? "anon",
			message: messageObject.message,
			created_at: messageObject.created_at,
		};

		this.broadcast(JSON.stringify(payload), [connection.id]);
	}

	deleteMessages() {
		void this.sql`DELETE FROM messages`;
	}

	validateStateChange(
		_nextState: ChattingRoomState,
		source: Connection | "server",
	): void {
		if (source !== "server") throw new Error("cant do this");
	}

	onStart() {
		void this.sql`
		CREATE TABLE IF NOT EXISTS messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			nickname TEXT NOT NULL,
			message TEXT NOT NULL,
			created_at INTEGER NOT NULL
		)
		`;

		void this.sql`
		CREATE TABLE IF NOT EXISTS room_config (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			room_token TEXT NOT NULL,
			display_name TEXT NOT NULL DEFAULT ''
		)
		`;

		void this.sql`
		CREATE TABLE IF NOT EXISTS poll_options (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			label TEXT NOT NULL,
			created_at INTEGER NOT NULL
		)
		`;

		void this.sql`
		CREATE TABLE IF NOT EXISTS poll_votes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			option_id INTEGER NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
			nickname TEXT NOT NULL,
			city TEXT NOT NULL,
			created_at INTEGER NOT NULL
		)
		`;

		void this.sql`
		CREATE TABLE IF NOT EXISTS poll_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			question TEXT NOT NULL,
			started_at INTEGER NOT NULL,
			closed_at INTEGER NOT NULL,
			total_votes INTEGER NOT NULL DEFAULT 0
		)
		`;

		void this.sql`
		CREATE TABLE IF NOT EXISTS poll_history_options (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			poll_history_id INTEGER NOT NULL REFERENCES poll_history(id) ON DELETE CASCADE,
			label TEXT NOT NULL,
			votes INTEGER NOT NULL DEFAULT 0,
			sort_order INTEGER NOT NULL DEFAULT 0
		)
		`;
	}

	private archiveCurrentPoll(closedAt = Date.now()) {
		if (!this.state.question || this.state.options.length === 0) return;

		const options = this.rebuildOptionsWithVotes();
		const totalVotes = options.reduce((sum, option) => sum + option.votes, 0);
		const startedAt = this.state.pollStartedAt ?? closedAt;

		const [historyRow] = this.sql<{ id: number }>`
			INSERT INTO poll_history (question, started_at, closed_at, total_votes)
			VALUES (${this.state.question}, ${startedAt}, ${closedAt}, ${totalVotes})
			RETURNING id
		`;

		if (!historyRow) return;

		options.forEach((option, index) => {
			void this.sql`
				INSERT INTO poll_history_options (poll_history_id, label, votes, sort_order)
				VALUES (${historyRow.id}, ${option.label}, ${option.votes}, ${index})
			`;
		});
	}

	private buildPollHistorySummaries(limit = 20): PollHistorySummary[] {
		const histories = this.sql<{
			id: number;
			question: string;
			started_at: number;
			closed_at: number;
			total_votes: number;
		}>`
			SELECT id, question, started_at, closed_at, total_votes
			FROM poll_history
			ORDER BY closed_at DESC
			LIMIT ${limit}
		`;

		return histories.map((history) => {
			const options = this.sql<{ label: string; votes: number }>`
				SELECT label, votes
				FROM poll_history_options
				WHERE poll_history_id = ${history.id}
				ORDER BY sort_order ASC
			`;

			return {
				id: history.id,
				question: history.question,
				startedAt: history.started_at,
				closedAt: history.closed_at,
				totalVotes: history.total_votes,
				options,
			};
		});
	}

	private getConnectionState() {
		const connection = getCurrentAgent<ChattingRoomAgent>()
			.connection as Connection<ConnectionState> | null;
		return connection?.state ?? null;
	}

	private getConnectionNickname() {
		return this.getConnectionState()?.nickname ?? SPECTATOR_NICKNAME;
	}

	private getConnectionCity() {
		return this.getConnectionState()?.city ?? "Unknown";
	}

	private assertCanParticipate() {
		if (this.getConnectionState()?.readonly) {
			throw new Error("관전자는 투표에 참여할 수 없습니다.");
		}
	}

	private assertPollOpen() {
		if (this.state.closed || !this.state.question) {
			throw new Error("진행 중인 투표가 없습니다.");
		}
	}

	private rebuildOptionsWithVotes(): PollOption[] {
		return this.state.options.map((option) => {
			const [countRow] = this.sql<{ votes: number }>`
				SELECT COUNT(*) AS votes
				FROM poll_votes
				WHERE option_id = ${option.id}
			`;
			return {
				...option,
				votes: countRow?.votes ?? 0,
			};
		});
	}

	private findMyVoteOptionId(nickname: string) {
		for (const option of this.state.options) {
			const [vote] = this.sql<{ option_id: number }>`
				SELECT option_id
				FROM poll_votes
				WHERE nickname = ${nickname}
					AND option_id = ${option.id}
				LIMIT 1
			`;
			if (vote) return vote.option_id;
		}
		return null;
	}

	closePoll() {
		if (this.state.closed) return;

		const closedAt = this.state.closesAt ?? Date.now();
		this.archiveCurrentPoll(closedAt);

		this.updateServerState({
			...this.state,
			closed: true,
			question: "",
			options: [],
			closesAt: null,
			pollStartedAt: null,
		});
	}

	@callable()
	vote(optionId: number) {
		this.assertCanParticipate();
		this.assertPollOpen();

		const nickname = this.getConnectionNickname();
		const city = this.getConnectionCity();

		const optionExists = this.state.options.some(
			(option) => option.id === optionId,
		);
		if (!optionExists) {
			throw new Error("유효하지 않은 선택지입니다.");
		}

		for (const option of this.state.options) {
			void this.sql`
				DELETE FROM poll_votes
				WHERE nickname = ${nickname}
					AND option_id = ${option.id}
			`;
		}

		void this.sql`
			INSERT INTO poll_votes (option_id, nickname, city, created_at)
			VALUES (${optionId}, ${nickname}, ${city}, ${Date.now()})
		`;

		this.updateServerState({
			...this.state,
			options: this.rebuildOptionsWithVotes(),
		});

		return { myVoteOptionId: optionId };
	}

	@callable()
	addOption(label: string) {
		this.assertCanParticipate();
		this.assertPollOpen();

		const trimmedLabel = label.trim();
		if (!trimmedLabel) {
			throw new Error("선택지를 입력해 주세요.");
		}

		const [inserted] = this.sql<{ id: number }>`
			INSERT INTO poll_options (label, created_at)
			VALUES (${trimmedLabel}, ${Date.now()})
			RETURNING id
		`;

		if (!inserted) {
			throw new Error("선택지 추가에 실패했습니다.");
		}

		this.updateServerState({
			...this.state,
			options: [
				...this.state.options,
				{ id: inserted.id, label: trimmedLabel, votes: 0 },
			],
		});
	}

	@callable()
	async reset(question: string, closesAt: number, optionLabels: string[]) {
		this.assertCanParticipate();

		const trimmedQuestion = question.trim();
		const trimmedOptions = optionLabels
			.map((label) => label.trim())
			.filter(Boolean);

		if (!trimmedQuestion) {
			throw new Error("투표 주제를 입력해 주세요.");
		}

		if (trimmedOptions.length < MIN_VOTE_OPTIONS) {
			throw new Error("선택지는 최소 2개 이상 필요합니다.");
		}

		const now = Date.now();
		if (closesAt <= now) {
			throw new Error("마감 시간은 현재보다 이후여야 합니다.");
		}

		if (!this.state.closed && this.state.question) {
			throw new Error("이미 진행 중인 투표가 있습니다.");
		}

		if (
			this.state.question &&
			this.state.options.length > 0 &&
			!this.state.closed
		) {
			this.archiveCurrentPoll(this.state.closesAt ?? now);
		}

		void this.sql`DELETE FROM poll_votes`;
		void this.sql`DELETE FROM poll_options`;

		const options: PollOption[] = [];
		for (const label of trimmedOptions) {
			const [row] = this.sql<{ id: number }>`
				INSERT INTO poll_options (label, created_at)
				VALUES (${label}, ${now})
				RETURNING id
			`;
			if (row) {
				options.push({ id: row.id, label, votes: 0 });
			}
		}

		await this.schedule(
			new Date(closesAt),
			"closePoll",
			{},
			{ idempotent: true },
		);

		this.updateServerState({
			...this.state,
			question: trimmedQuestion,
			options,
			closed: false,
			closesAt,
			pollStartedAt: now,
		});
	}

	@callable()
	async extendPoll() {
		this.assertCanParticipate();
		this.assertPollOpen();

		if (!this.state.closesAt) {
			throw new Error("마감 시간이 설정되지 않았습니다.");
		}

		const now = Date.now();
		if (this.state.closesAt - now > VOTE_EXTEND_MS) {
			throw new Error("마감 5분 전부터 연장할 수 있습니다.");
		}

		const newClosesAt = this.state.closesAt + VOTE_EXTEND_MS;
		await this.schedule(
			new Date(newClosesAt),
			"closePoll",
			{},
			{ idempotent: true },
		);

		this.updateServerState({
			...this.state,
			closesAt: newClosesAt,
		});
	}

	@callable()
	getMyVoteOptionId() {
		return this.findMyVoteOptionId(this.getConnectionNickname());
	}

	@callable()
	listPollHistory() {
		return this.buildPollHistorySummaries();
	}

	@callable()
	loadHistory() {
		return this.sql`SELECT * FROM messages ORDER BY created_at ASC LIMIT 100`;
	}

	@callable()
	getPublicVoteInfo(): { voteTopic: string; endAt: number } | null {
		if (!this.state.question || this.state.closed || !this.state.closesAt) {
			return null;
		}
		return { voteTopic: this.state.question, endAt: this.state.closesAt };
	}

	@callable()
	setRoomConfig(config: { token: string; displayName: string }) {
		void this.sql`
			INSERT OR REPLACE INTO room_config (id, room_token, display_name)
			VALUES (1, ${config.token}, ${config.displayName})
		`;

		this.updateServerState({
			...this.state,
			chatRoomName: config.displayName,
		});
	}
}

export class RoomDirectoryAgent extends Agent<Env, RoomDirectory> {
	onStart() {
		void this.sql`
		CREATE TABLE IF NOT EXISTS chatrooms (
			room_id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			created_at INTEGER NOT NULL
		)
		`;

		try {
			void this
				.sql`ALTER TABLE chatrooms ADD COLUMN room_token TEXT NOT NULL DEFAULT ''`;
		} catch {
			// column already exists
		}
	}

	@callable()
	async createRoom(name: string) {
		const roomId = crypto.randomUUID();
		const roomToken = crypto.randomUUID();
		const createdAt = Date.now();

		void this.sql`
			INSERT INTO chatrooms (room_id, name, room_token, created_at)
			VALUES (${roomId}, ${name}, ${roomToken}, ${createdAt})
		`;

		const roomAgent = await getAgentByName(this.env.ChattingRoomAgent, roomId);
		await roomAgent.setRoomConfig({ token: roomToken, displayName: name });

		return { roomId, name, token: roomToken };
	}

	@callable()
	async listRooms(): Promise<RoomSummary[]> {
		const rooms = this.sql<{
			room_id: string;
			name: string;
			room_token: string;
			created_at: number;
		}>`
			SELECT room_id, name, room_token, created_at
			FROM chatrooms
			ORDER BY created_at DESC
		`;

		return Promise.all(
			rooms.map(async (room) => {
				let activeVoteTopic: string | null = null;
				let activeVoteEndAt: number | null = null;

				try {
					const roomAgent = await getAgentByName(
						this.env.ChattingRoomAgent,
						room.room_id,
					);
					const voteInfo = await roomAgent.getPublicVoteInfo();
					if (voteInfo) {
						activeVoteTopic = voteInfo.voteTopic;
						activeVoteEndAt = voteInfo.endAt;
					}
				} catch {
					// ignore unavailable room agents
				}

				return {
					room_id: room.room_id,
					name: room.name,
					room_token: room.room_token,
					created_at: room.created_at,
					activeVoteTopic,
					activeVoteEndAt,
				};
			}),
		);
	}
}

export default {
	async fetch(request, env) {
		const agentResponse = await routeAgentRequest(request, env);
		if (agentResponse) return agentResponse;
		return new Response(null, { status: 404 });
	},
} satisfies ExportedHandler<Env>;
