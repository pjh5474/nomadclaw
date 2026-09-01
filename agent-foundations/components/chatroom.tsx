import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Eye, Loader2, MessageCircle, Send, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useAgent } from "agents/react";
import type { Message, Session } from "@/shared/types";
import type { ChattingRoomAgent, ChattingRoomState } from "@/worker/index";
import { DEFAULT_ROOM_NAME, SPECTATOR_NICKNAME } from "@/shared/constants";
import VotePanel from "@/components/vote-panel";
import { cn } from "@/lib/utils";

function isChatMessage(value: unknown): value is Message {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.nickname === "string" &&
		typeof record.message === "string" &&
		typeof record.created_at === "number"
	);
}

export default function ChatRoom({
	nickname,
	roomId,
	roomToken,
	readonly,
}: Session) {
	const [isConnected, setIsConnected] = useState(false);
	const [message, setMessage] = useState("");
	const [messageHistory, setMessageHistory] = useState<Message[]>([]);
	const [chatRoomName, setChatRoomName] = useState(DEFAULT_ROOM_NAME);
	const [activeVoteTopic, setActiveVoteTopic] = useState<string | null>(null);

	const displayName = readonly ? SPECTATOR_NICKNAME : nickname;

	const query = useMemo(
		() =>
			readonly
				? {
						nickname: SPECTATOR_NICKNAME,
						readonly: "true" as const,
						token: roomToken,
					}
				: { nickname, readonly: "false" as const, token: roomToken },
		[readonly, nickname, roomToken],
	);

	const agent = useAgent<ChattingRoomAgent, ChattingRoomState>({
		agent: "ChattingRoomAgent",
		name: roomId,
		query,
		onOpen: async () => {
			setIsConnected(true);
			try {
				const history = (await agent.stub.loadHistory()) as Message[];
				setMessageHistory(history);
			} catch (err) {
				console.error("채팅 내역을 불러오지 못했습니다.", err);
			}
		},
		onMessage: (event) => {
			try {
				const parsed: unknown = JSON.parse(event.data);
				if (!isChatMessage(parsed)) return;
				setMessageHistory((prev) => [...prev, parsed]);
			} catch {
				// ignore non-JSON payloads
			}
		},
		onStateUpdate: (state) => {
			setChatRoomName(state.chatRoomName);
			setActiveVoteTopic(
				!state.closed && state.question ? state.question : null,
			);
		},
		onStateUpdateError: () => console.log("cant do that"),
	});

	const sendMessage = (text: string) => {
		if (readonly) return;
		agent.send(text);
		setMessageHistory((prev) => [
			...prev,
			{
				id: Date.now(),
				nickname,
				message: text,
				created_at: Date.now(),
			},
		]);
		setMessage("");
	};

	if (!isConnected) {
		return (
			<div className="flex min-h-svh items-center justify-center bg-linear-to-br from-secondary/40 via-background to-accent/30 p-6">
				<div className="flex flex-col items-center gap-4 rounded-2xl border bg-card/80 px-10 py-12 shadow-lg backdrop-blur-sm">
					<div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
						<Loader2 className="size-7 animate-spin" />
					</div>
					<div className="space-y-1 text-center">
						<p className="text-lg font-medium">채팅방에 연결 중</p>
						<p className="text-sm text-muted-foreground">
							{displayName}
							{readonly ? " (관전)" : "님"} - {chatRoomName}
						</p>
					</div>
				</div>
			</div>
		);
	}

	const participantsOnline = agent.state?.participantsOnline ?? 0;
	const spectatorsOnline = agent.state?.spectatorsOnline ?? 0;

	return (
		<div className="flex min-h-svh items-center justify-center bg-linear-to-br from-secondary/40 via-background to-accent/30 p-4 sm:p-6">
			<div className="flex h-[min(720px,92svh)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-primary/15 bg-card shadow-xl shadow-primary/5">
				<header className="flex items-center justify-between gap-4 border-b border-primary/10 bg-secondary/20 px-5 py-4 backdrop-blur-sm">
					<div className="flex min-w-0 items-center gap-3">
						<div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
							<MessageCircle className="size-5" />
						</div>
						<div className="min-w-0">
							<h1 className="truncate text-lg font-semibold tracking-tight">
								{chatRoomName}
							</h1>
							<p className="truncate text-sm text-muted-foreground">
								{displayName}
								{readonly ? " (관전)" : "님"}
								{activeVoteTopic ? ` - 투표: ${activeVoteTopic}` : ""}
							</p>
						</div>
					</div>

					<div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
						<div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-secondary/50 px-3 py-1.5 text-sm font-medium text-secondary-foreground">
							<Users className="size-4 text-primary" />
							<span className="size-2 rounded-full bg-primary" aria-hidden />
							<span>{participantsOnline}명 접속 중</span>
						</div>
						<div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-accent/50 px-3 py-1.5 text-sm font-medium text-accent-foreground">
							<Eye className="size-4 text-primary" />
							<span>{spectatorsOnline}명 관전 중</span>
						</div>
					</div>
				</header>

				<div className="flex min-h-0 flex-1 flex-col md:flex-row">
					<section className="flex min-h-0 min-w-0 flex-1 flex-col">
						<main className="flex flex-1 flex-col overflow-hidden bg-muted/30">
							<div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
								{messageHistory.length > 0 ? (
									messageHistory.map((history) => {
										const isOwnMessage =
											!readonly && history.nickname === nickname;

										return (
											<div
												key={
													history.id ??
													`${history.created_at}-${history.nickname}`
												}
												className={cn(
													"flex w-full",
													isOwnMessage ? "justify-end" : "justify-start",
												)}
											>
												<div
													className={cn(
														"max-w-[min(85%,28rem)] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
														isOwnMessage
															? "rounded-br-sm bg-primary text-primary-foreground"
															: "rounded-bl-sm border bg-background/90",
													)}
												>
													{!isOwnMessage && (
														<p className="mb-1 text-xs font-semibold text-primary">
															{history.nickname}
														</p>
													)}
													<p
														className={cn(
															"leading-relaxed wrap-break-word",
															isOwnMessage
																? "text-primary-foreground"
																: "text-foreground",
														)}
													>
														{history.message}
													</p>
												</div>
											</div>
										);
									})
								) : (
									<div className="flex flex-1 flex-col items-center justify-center gap-4 px-2 py-10 text-center">
										<div className="flex size-16 items-center justify-center rounded-2xl border border-dashed bg-background/70 text-muted-foreground">
											<MessageCircle className="size-8 opacity-60" />
										</div>
										<div className="max-w-sm space-y-2">
											<p className="text-base font-medium text-foreground/90">
												대화를 시작해 보세요
											</p>
											<p className="text-sm leading-relaxed text-muted-foreground">
												{readonly
													? "관전자는 채팅과 투표에 참여할 수 없습니다."
													: "아래 입력창에 메시지를 작성하고 전송하면 채팅방에 보낼 수 있습니다."}
											</p>
										</div>
									</div>
								)}
							</div>
						</main>

						{!readonly && (
							<>
								<Separator />

								<footer className="bg-background/90 p-4 backdrop-blur-sm">
									<form
										className="flex items-end gap-2"
										onSubmit={(e) => {
											e.preventDefault();
											const trimmed = message.trim();
											if (!trimmed) return;
											sendMessage(trimmed);
										}}
									>
										<Field
											orientation="horizontal"
											className="min-w-0 flex-1 items-center gap-2"
										>
											<Input
												type="text"
												name="message"
												placeholder="메시지를 입력하세요..."
												value={message}
												onChange={(e) => setMessage(e.target.value)}
												className="h-10 flex-1 bg-background"
												autoComplete="off"
											/>
											<Button
												type="submit"
												size="icon-lg"
												disabled={!message.trim()}
												aria-label="메시지 전송"
											>
												<Send className="size-4" />
											</Button>
										</Field>
									</form>
								</footer>
							</>
						)}
					</section>

					<VotePanel agent={agent} readonly={readonly} />
				</div>
			</div>
		</div>
	);
}
