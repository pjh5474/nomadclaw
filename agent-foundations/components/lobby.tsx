import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Clock, LogIn, MessageCircle, Plus, RefreshCw, Vote } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAgent } from "agents/react";
import type { RoomSummary, Session } from "@/shared/types";
import type { RoomDirectoryAgent } from "@/worker/index";
import { formatDeadline, formatRemaining } from "@/shared/format";

function RoomVoteInfo({
	topic,
	endAt,
	now,
}: {
	topic: string;
	endAt: number;
	now: number;
}) {
	const remainingMs = endAt - now;
	const isExpired = remainingMs <= 0;

	return (
		<div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
			<span className="inline-flex items-center gap-1 truncate">
				<Vote className="size-3 shrink-0 text-primary" />
				<span className="truncate">{topic}</span>
			</span>
			<span className="inline-flex items-center gap-1">
				<Clock className="size-3 shrink-0" />
				{isExpired ? (
					"마감됨"
				) : (
					<>
						마감 {formatDeadline(endAt)} · {formatRemaining(endAt, now)} 남음
					</>
				)}
			</span>
		</div>
	);
}

export default function Lobby({
	onEnter,
}: {
	onEnter: (session: Session) => void;
}) {
	const [nickname, setNickname] = useState("");
	const [rooms, setRooms] = useState<RoomSummary[]>([]);
	const [loadingRooms, setLoadingRooms] = useState(true);
	const [newRoomName, setNewRoomName] = useState("");
	const [creatingRoom, setCreatingRoom] = useState(false);
	const [now, setNow] = useState(Date.now());

	const directory = useAgent<RoomDirectoryAgent>({
		agent: "RoomDirectoryAgent",
		name: "global",
	});

	const loadRooms = useCallback(async () => {
		try {
			await directory.ready;
			const list = (await directory.stub.listRooms()) as RoomSummary[];
			setRooms(list);
		} finally {
			setLoadingRooms(false);
		}
	}, [directory]);

	useEffect(() => {
		void loadRooms();
	}, [loadRooms]);

	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, []);

	const trimmedNickname = nickname.trim();

	function enterRoom(room: RoomSummary) {
		const readonly = trimmedNickname.length === 0;
		onEnter({
			nickname: readonly ? "" : trimmedNickname,
			roomId: room.room_id,
			roomToken: room.room_token,
			readonly,
		});
	}

	async function handleCreateRoom(event: React.FormEvent) {
		event.preventDefault();
		const name = newRoomName.trim();
		if (!name) return;

		setCreatingRoom(true);
		try {
			await directory.ready;
			await directory.stub.createRoom(name);
			setNewRoomName("");
			await loadRooms();
		} finally {
			setCreatingRoom(false);
		}
	}

	return (
		<div className="flex min-h-svh items-center justify-center bg-linear-to-br from-secondary/40 via-background to-accent/30 p-6">
			<div className="w-full max-w-lg rounded-2xl border border-primary/15 bg-card/90 p-8 shadow-xl backdrop-blur-sm">
				<div className="mb-6 space-y-2 text-center">
					<div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm shadow-primary/20">
						<MessageCircle className="size-7" />
					</div>
					<h1 className="text-2xl font-semibold tracking-tight">투표 채팅방</h1>
					<p className="text-sm text-muted-foreground">
						닉네임을 입력하고 방을 선택해 입장하세요. 닉네임 없이 입장하면
						관전자(읽기 전용)로 접속됩니다.
					</p>
				</div>

				<Field className="mb-6">
					<Input
						type="text"
						name="nickname"
						placeholder="닉네임 (비우면 관전자로 입장됩니다)"
						value={nickname}
						onChange={(e) => setNickname(e.target.value)}
						className="h-11 bg-background"
						autoComplete="off"
						autoFocus
					/>
				</Field>

				<div className="mb-4 flex items-center justify-between">
					<h2 className="text-sm font-semibold">채팅방 목록</h2>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => void loadRooms()}
						disabled={loadingRooms}
					>
						<RefreshCw className="size-4" />
						새로고침
					</Button>
				</div>

				<div className="mb-6 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-primary/10 bg-secondary/15 p-2">
					{loadingRooms ? (
						<p className="px-2 py-4 text-center text-sm text-muted-foreground">
							목록 불러오는 중...
						</p>
					) : rooms.length === 0 ? (
						<p className="px-2 py-4 text-center text-sm text-muted-foreground">
							생성된 채팅방이 없습니다. 아래에서 새 방을 만들어 보세요.
						</p>
					) : (
						rooms.map((room) => (
							<div
								key={room.room_id}
								className="flex items-center justify-between gap-3 rounded-lg border border-primary/10 bg-card px-3 py-2.5"
							>
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium">{room.name}</p>
									{room.activeVoteTopic && room.activeVoteEndAt ? (
										<RoomVoteInfo
											topic={room.activeVoteTopic}
											endAt={room.activeVoteEndAt}
											now={now}
										/>
									) : (
										<p className="mt-0.5 text-xs text-muted-foreground">
											진행 중인 투표 없음
										</p>
									)}
								</div>
								<Button
									type="button"
									size="sm"
									className="shrink-0"
									onClick={() => enterRoom(room)}
								>
									<LogIn className="size-4" />
									입장
								</Button>
							</div>
						))
					)}
				</div>

				<form className="flex gap-2" onSubmit={handleCreateRoom}>
					<Input
						type="text"
						placeholder="새 채팅방 이름"
						value={newRoomName}
						onChange={(e) => setNewRoomName(e.target.value)}
						className="h-10 flex-1 bg-background"
						autoComplete="off"
					/>
					<Button
						type="submit"
						variant="secondary"
						disabled={!newRoomName.trim() || creatingRoom}
					>
						<Plus className="size-4" />방 만들기
					</Button>
				</form>
			</div>
		</div>
	);
}
