/** 채팅 메시지 (DB / WebSocket payload) */
export type Message = {
	id: number;
	nickname: string;
	message: string;
	created_at: number;
};

/** 로비 → 채팅방 입장 세션 */
export type Session = {
	nickname: string;
	roomId: string;
	roomToken: string;
	readonly: boolean;
};

/** 투표 선택지 (Agent state) */
export type PollOption = {
	id: number;
	label: string;
	votes: number;
};

/** RoomDirectoryAgent 채팅방 목록 항목 */
export type RoomSummary = {
	room_id: string;
	name: string;
	created_at: number;
	room_token: string;
	activeVoteTopic: string | null;
	activeVoteEndAt: number | null;
};

/** ChattingRoomAgent 동기화 상태 */
export type ChattingRoomState = {
	participantsOnline: number;
	spectatorsOnline: number;
	chatRoomName: string;
	question: string;
	options: PollOption[];
	closed: boolean;
	closesAt: number | null;
	pollStartedAt: number | null;
};

/** 마감된 투표 기록 */
export type PollHistorySummary = {
	id: number;
	question: string;
	startedAt: number;
	closedAt: number;
	totalVotes: number;
	options: { label: string; votes: number }[];
};

/** RoomDirectoryAgent 상태 (현재 비어 있음) */
export type RoomDirectory = Record<string, never>;
