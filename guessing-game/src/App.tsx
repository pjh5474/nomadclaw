import { useAgentChat } from "agents/chat/react";
import { useAgent } from "agents/react";
import { type UIMessage } from "ai";
import {
	BotIcon,
	CircleHelpIcon,
	HistoryIcon,
	RotateCcwIcon,
	SendIcon,
	SparklesIcon,
	SquareIcon,
	TrophyIcon,
	UserIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
	Message,
	MessageAvatar,
	MessageContent,
	MessageGroup,
} from "@/components/ui/message";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { CATEGORIES } from "@/worker/constants.ts";
import type {
	GameHistoryDetail,
	GameHistorySummary,
	GuessingGameState,
} from "@/worker/index";

const CATEGORY_LABELS: Record<keyof typeof CATEGORIES, string> = {
	animals: "동물",
	countries: "나라",
	celebrities: "유명인",
};

function getCategoryLabel(category: string) {
	return CATEGORY_LABELS[category as keyof typeof CATEGORIES] ?? category;
}

function hasVisibleText(message: UIMessage): boolean {
	return message.parts.some(
		(part) => part.type === "text" && part.text.trim().length > 0,
	);
}

function App() {
	const [questionCount, setQuestionCount] = useState(0);
	const [isQuestionSolved, setIsQuestionSolved] = useState(false);
	const [revealedAnswer, setRevealedAnswer] = useState<string | null>(null);
	const [gameActive, setGameActive] = useState(false);
	const [category, setCategory] = useState<keyof typeof CATEGORIES>("animals");
	const [history, setHistory] = useState<GameHistorySummary[]>([]);
	const [selectedGame, setSelectedGame] = useState<GameHistoryDetail | null>(
		null,
	);
	const [draft, setDraft] = useState("");

	const agent = useAgent<GuessingGameState>({
		agent: "GuessingGameAgent",
		onStateUpdate: (state) => {
			setQuestionCount(state.questionCount);
			setIsQuestionSolved(state.solved);
			setRevealedAnswer(state.revealedAnswer);
			setGameActive(state.gameActive);
			if (state.category) setCategory(state.category);
		},
	});

	const { messages, sendMessage, clearHistory, status, stop } = useAgentChat({
		agent,
	});

	const isStreaming = status === "streaming" || status === "submitted";

	const loadHistory = useCallback(async () => {
		const rows = await agent.stub.listGameHistory(10);
		setHistory(rows);
	}, [agent.stub]);

	useEffect(() => {
		void loadHistory();
	}, [loadHistory]);

	const handleNewGame = async () => {
		if (isStreaming) stop();

		const result = await agent.stub.newGame(category);
		if (!result.ok) {
			toast.add({
				type: "error",
				title: "게임 시작 실패",
				description: result.message ?? "다시 시도해주세요.",
			});
			return;
		}

		clearHistory();
		setDraft("");
		setSelectedGame(null);
		await loadHistory();
		toast.add({
			type: "info",
			title: "새 게임 시작",
			description: `${CATEGORY_LABELS[category]} 카테고리에서 비밀 대상이 정해졌습니다.`,
		});
	};

	const handleViewHistory = async (gameId: number) => {
		const detail = await agent.stub.getGameHistory(gameId);
		setSelectedGame(detail);
	};

	const handleMessageSubmit = async (
		e: React.SyntheticEvent<HTMLFormElement>,
	) => {
		e.preventDefault();
		const message = draft.trim();
		if (!message) return;

		const result = await agent.stub.submitMessage(message);

		if (result.type === "error") {
			toast.add({
				type: "error",
				title: "전송할 수 없습니다",
				description: result.message,
			});
			return;
		}

		setDraft("");

		if (result.type === "correct") {
			toast.add({
				type: "success",
				title: "정답입니다!",
				description: `정답은 "${result.answer}"였습니다.`,
			});
			await loadHistory();
			return;
		}

		sendMessage({ text: message });
	};

	const visibleMessages = messages.filter(
		(message) => message.role === "user" || hasVisibleText(message),
	);

	const showThinkingIndicator =
		isStreaming &&
		(visibleMessages.length === 0 ||
			visibleMessages[visibleMessages.length - 1]?.role === "user");

	function renderMessageParts(msg: UIMessage) {
		return msg.parts.map((part, i) => {
			if (part.type === "text")
				return (
					<p key={i} className="whitespace-pre-wrap leading-relaxed">
						{part.text}
					</p>
				);
			return null;
		});
	}

	return (
		<div className="flex min-h-svh flex-col bg-background">
			<header className="border-b border-primary/15 bg-linear-to-r from-primary/8 via-card to-secondary/10 backdrop-blur-sm">
				<div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
					<div className="flex items-center gap-3">
						<div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
							<SparklesIcon className="size-5" />
						</div>
						<div>
							<h1 className="text-base font-semibold tracking-tight">
								Guessing Game
							</h1>
							<p className="text-xs text-muted-foreground">
								질문으로 단서를 모으고 정답을 맞혀보세요
							</p>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						{gameActive && (
							<>
								<span className="inline-flex items-center gap-1.5 rounded-full border border-secondary/40 bg-secondary/60 px-3 py-1 text-xs font-medium text-secondary-foreground">
									<CircleHelpIcon className="size-3.5" />
									질문 {questionCount}번
								</span>
								<span className="inline-flex items-center gap-1.5 rounded-full border border-accent-foreground/10 bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
									{getCategoryLabel(category)}
								</span>
							</>
						)}
						{isQuestionSolved && revealedAnswer && (
							<span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
								<TrophyIcon className="size-3.5" />
								정답: {revealedAnswer}
							</span>
						)}
						{isStreaming && (
							<span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
								<Spinner />
								응답 중...
							</span>
						)}
					</div>
				</div>
			</header>

			<div className="mx-auto flex w-full max-w-6xl flex-1 gap-4 p-4 min-h-0">
				<section className="flex min-h-[calc(100svh-8rem)] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-primary/10 bg-card shadow-sm shadow-primary/5">
					<div className="flex items-center justify-between gap-2 border-b px-4 py-3">
						<div className="flex items-center gap-2 text-sm font-medium">
							{gameActive ? "게임 진행 중" : "게임 시작 전"}
						</div>
						<ButtonGroup>
							<Button
								variant="ghost"
								size="sm"
								onClick={clearHistory}
								disabled={messages.length === 0}
							>
								<RotateCcwIcon />
								대화 지우기
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onClick={stop}
								disabled={!isStreaming}
							>
								<SquareIcon />
								중지
							</Button>
						</ButtonGroup>
					</div>

					<MessageScrollerProvider>
						<MessageScroller className="min-h-0 flex-1">
							<MessageScrollerViewport className="min-h-80 flex-1">
								<MessageScrollerContent className="gap-4 p-4">
									{!gameActive && messages.length === 0 && (
										<div className="flex min-h-70 flex-col items-center justify-center gap-3 text-center">
											<div className="flex size-14 items-center justify-center rounded-2xl bg-secondary/50 text-secondary-foreground">
												<SparklesIcon className="size-7" />
											</div>
											<div>
												<p className="font-medium">게임을 시작해주세요</p>
												<p className="mt-1 text-sm text-muted-foreground">
													카테고리를 고른 뒤 새 게임을 시작하면 AI가 비밀 대상이
													됩니다.
												</p>
											</div>
										</div>
									)}

									{gameActive &&
										visibleMessages.length === 0 &&
										!isQuestionSolved && (
											<div className="flex min-h-50 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
												<CircleHelpIcon className="size-8 opacity-60" />
												<p>
													예: &quot;살아 있나요?&quot;, &quot;유럽에
													있나요?&quot;
												</p>
												<p>정답을 알 것 같으면 이름을 직접 말해보세요.</p>
											</div>
										)}

									{isQuestionSolved && revealedAnswer && (
										<div className="rounded-xl border border-primary/25 bg-primary/8 p-4 text-center">
											<TrophyIcon className="mx-auto mb-2 size-8 text-primary" />
											<p className="font-semibold text-primary">
												축하합니다! 정답은 {revealedAnswer} 입니다.
											</p>
											<p className="mt-1 text-sm text-muted-foreground">
												총 {questionCount}번의 질문 후 맞혔습니다.
											</p>
										</div>
									)}

									<MessageGroup>
										{visibleMessages.map((message, index) => {
											const isUser = message.role === "user";
											return (
												<MessageScrollerItem
													key={message.id}
													scrollAnchor={index === visibleMessages.length - 1}
												>
													<Message align={isUser ? "end" : "start"}>
														<MessageAvatar
															className={cn(
																"size-8 text-xs font-semibold",
																isUser
																	? "bg-primary text-primary-foreground"
																	: "bg-secondary/50 text-secondary-foreground",
															)}
														>
															{isUser ? (
																<UserIcon className="size-4" />
															) : (
																<BotIcon className="size-4" />
															)}
														</MessageAvatar>
														<MessageContent>
															<div
																className={cn(
																	"max-w-prose rounded-2xl px-4 py-2.5 text-sm",
																	isUser
																		? "bg-primary text-primary-foreground"
																		: "border border-secondary/30 bg-secondary/35",
																)}
															>
																{renderMessageParts(message)}
															</div>
														</MessageContent>
													</Message>
												</MessageScrollerItem>
											);
										})}
									</MessageGroup>

									{showThinkingIndicator && (
										<Message align="start">
											<MessageAvatar className="size-8 bg-secondary/60 text-secondary-foreground">
												<BotIcon className="size-4" />
											</MessageAvatar>
											<MessageContent>
												<div className="flex items-center gap-2 rounded-2xl border border-secondary/30 bg-secondary/25 px-4 py-3 text-sm text-secondary-foreground">
													<Spinner />
													생각하는 중...
												</div>
											</MessageContent>
										</Message>
									)}
								</MessageScrollerContent>
							</MessageScrollerViewport>
							<MessageScrollerButton />
						</MessageScroller>
					</MessageScrollerProvider>

					<div className="border-t bg-card p-4">
						<form onSubmit={handleMessageSubmit} className="space-y-3">
							<div className="flex flex-wrap items-center gap-2">
								<Select
									value={category}
									onValueChange={(value) =>
										setCategory(value as keyof typeof CATEGORIES)
									}
									disabled={gameActive && !isQuestionSolved}
								>
									<SelectTrigger size="sm" className="w-30">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{(
											Object.keys(
												CATEGORY_LABELS,
											) as (keyof typeof CATEGORIES)[]
										).map((key) => (
											<SelectItem key={key} value={key}>
												{CATEGORY_LABELS[key]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>

								<Button
									type="button"
									variant="secondary"
									size="sm"
									onClick={() => void handleNewGame()}
								>
									<SparklesIcon />새 게임
								</Button>
							</div>

							<ButtonGroup className="w-full">
								<input
									name="input"
									value={draft}
									onChange={(e) => setDraft(e.target.value)}
									placeholder={
										!gameActive
											? "먼저 새 게임을 시작해주세요"
											: isQuestionSolved
												? "정답을 맞혔습니다!"
												: "질문하거나 정답을 추측하세요..."
									}
									autoComplete="off"
									disabled={!gameActive || isQuestionSolved || isStreaming}
									className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
								/>
								<Button
									type="submit"
									disabled={!gameActive || isQuestionSolved || isStreaming}
								>
									<SendIcon />
									전송
								</Button>
							</ButtonGroup>
						</form>
					</div>
				</section>

				<aside className="flex w-full max-w-sm shrink-0 flex-col gap-4 min-h-[calc(100svh-8rem)]">
					<div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-secondary/20 bg-card shadow-sm shadow-secondary/5">
						<div className="flex items-center justify-between border-b px-4 py-3">
							<div className="flex items-center gap-2 text-sm font-medium">
								<HistoryIcon className="size-4 text-muted-foreground" />
								이전 게임
							</div>
							<Button
								variant="ghost"
								size="xs"
								onClick={() => void loadHistory()}
							>
								<RotateCcwIcon />
							</Button>
						</div>

						<div className="flex-1 overflow-y-auto p-3">
							{history.length === 0 ? (
								<p className="py-8 text-center text-sm text-muted-foreground">
									아직 기록이 없습니다.
								</p>
							) : (
								<ul className="space-y-2">
									{history.map((game) => (
										<li key={game.id}>
											<button
												type="button"
												onClick={() => void handleViewHistory(game.id)}
												className={cn(
													"w-full rounded-xl border px-3 py-2.5 text-left text-sm transition hover:bg-muted/50",
													selectedGame?.id === game.id &&
														"border-primary/40 bg-primary/5",
												)}
											>
												<div className="flex items-center justify-between gap-2">
													<span className="font-medium">#{game.id}</span>
													<span
														className={cn(
															"rounded-full px-2 py-0.5 text-[10px] font-medium",
															game.solved
																? "bg-primary/12 text-primary"
																: "bg-accent/80 text-accent-foreground",
														)}
													>
														{game.solved ? "완료" : "진행 중"}
													</span>
												</div>
												<p className="mt-1 text-xs text-muted-foreground">
													{getCategoryLabel(game.category)} · 질문{" "}
													{game.questionCount}번
												</p>
												{game.solved && game.secret && (
													<p className="mt-1 text-xs font-medium">
														정답: {game.secret}
													</p>
												)}
											</button>
										</li>
									))}
								</ul>
							)}
						</div>
					</div>

					{selectedGame && (
						<div className="max-h-[45vh] overflow-y-auto rounded-2xl border bg-card p-4 shadow-sm">
							<div className="mb-3 flex items-start justify-between gap-2">
								<div>
									<h2 className="text-sm font-semibold">
										게임 #{selectedGame.id}
									</h2>
									<p className="mt-1 text-xs text-muted-foreground">
										{getCategoryLabel(selectedGame.category)} · 질문{" "}
										{selectedGame.questionCount}번
										{selectedGame.solved && selectedGame.secret && (
											<> · 정답 {selectedGame.secret}</>
										)}
									</p>
								</div>
								<Button
									variant="ghost"
									size="xs"
									onClick={() => setSelectedGame(null)}
								>
									닫기
								</Button>
							</div>

							<Separator className="mb-3" />

							{selectedGame.questions.length === 0 ? (
								<p className="text-xs text-muted-foreground">
									기록된 문답이 없습니다.
								</p>
							) : (
								<ul className="space-y-3">
									{selectedGame.questions.map((row, index) => (
										<li
											key={`${row.createdAt}-${index}`}
											className="rounded-lg border border-secondary/15 bg-secondary/15 p-3 text-sm"
										>
											<p className="font-medium">Q. {row.question}</p>
											<p className="mt-1.5 text-muted-foreground">
												A. {row.reply}
											</p>
										</li>
									))}
								</ul>
							)}
						</div>
					)}
				</aside>
			</div>
		</div>
	);
}

export default App;
