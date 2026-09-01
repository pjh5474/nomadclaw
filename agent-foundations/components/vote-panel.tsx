import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Clock, History, Plus, RefreshCw, Vote } from "lucide-react";
import type { ChattingRoomState, PollHistorySummary } from "@/shared/types";
import { useAgent } from "agents/react";
import type { ChattingRoomAgent } from "@/worker/index";
import {
	DEFAULT_VOTE_DURATION_MS,
	MIN_VOTE_OPTIONS,
	VOTE_EXTEND_MS,
} from "@/shared/constants";
import { formatDeadline, formatRemaining } from "@/shared/format";

type AgentConnection = ReturnType<
	typeof useAgent<ChattingRoomAgent, ChattingRoomState>
>;

function toDateTimeLocalValue(date: Date) {
	const offset = date.getTimezoneOffset();
	const local = new Date(date.getTime() - offset * 60_000);
	return local.toISOString().slice(0, 16);
}

function PollResultBars({
	options,
	totalVotes,
}: {
	options: { label: string; votes: number }[];
	totalVotes: number;
}) {
	const maxVotes = Math.max(...options.map((option) => option.votes), 1);

	return (
		<div className="space-y-2">
			{options.map((option) => {
				const widthPercent = (option.votes / maxVotes) * 100;
				const share =
					totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;

				return (
					<div key={option.label} className="space-y-1">
						<div className="flex items-center justify-between text-sm">
							<span className="font-medium">{option.label}</span>
							<span className="text-muted-foreground">
								{option.votes}표 ({share}%)
							</span>
						</div>
						<div className="h-2 overflow-hidden rounded-full bg-muted">
							<div
								className="h-full rounded-full bg-primary/70 transition-all"
								style={{ width: `${widthPercent}%` }}
							/>
						</div>
					</div>
				);
			})}
		</div>
	);
}

function PollHistoryCard({ poll }: { poll: PollHistorySummary }) {
	return (
		<div className="rounded-lg border border-primary/10 bg-background/80 p-3">
			<div className="mb-2 space-y-1">
				<p className="text-sm font-semibold leading-snug">{poll.question}</p>
				<p className="text-xs text-muted-foreground">
					{formatDeadline(poll.startedAt)} ~ {formatDeadline(poll.closedAt)}
				</p>
				<p className="text-xs text-muted-foreground">총 {poll.totalVotes}표</p>
			</div>
			<PollResultBars options={poll.options} totalVotes={poll.totalVotes} />
		</div>
	);
}

export default function VotePanel({
	agent,
	readonly = false,
}: {
	agent: AgentConnection;
	readonly?: boolean;
}) {
	const pollState = agent.state;
	const hasActivePoll =
		Boolean(pollState?.question) && pollState?.closed === false;

	const [error, setError] = useState<string | null>(null);
	const [showCreateForm, setShowCreateForm] = useState(false);
	const [reVoteMode, setReVoteMode] = useState(false);
	const [myVoteOptionId, setMyVoteOptionId] = useState<number | null>(null);
	const [now, setNow] = useState(Date.now());
	const [pollHistory, setPollHistory] = useState<PollHistorySummary[]>([]);

	const [question, setQuestion] = useState("");
	const [closesAtInput, setClosesAtInput] = useState(
		toDateTimeLocalValue(new Date(Date.now() + DEFAULT_VOTE_DURATION_MS)),
	);
	const [optionLabels, setOptionLabels] = useState(() =>
		Array(MIN_VOTE_OPTIONS).fill(""),
	);
	const [newOptionLabel, setNewOptionLabel] = useState("");

	const loadPollHistory = useCallback(async () => {
		try {
			const history =
				(await agent.stub.listPollHistory()) as PollHistorySummary[];
			setPollHistory(history);
		} catch {
			setPollHistory([]);
		}
	}, [agent.stub]);

	const loadMyVote = useCallback(async () => {
		try {
			const optionId = (await agent.stub.getMyVoteOptionId()) as number | null;
			setMyVoteOptionId(optionId);
		} catch {
			setMyVoteOptionId(null);
		}
	}, [agent.stub]);

	useEffect(() => {
		void loadPollHistory();
		void loadMyVote();
	}, [loadPollHistory, loadMyVote]);

	useEffect(() => {
		if (pollState?.closed !== false) {
			void loadPollHistory();
		}
	}, [pollState?.closed, pollState?.question, loadPollHistory]);

	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, []);

	const canExtendDeadline = useMemo(() => {
		if (!pollState?.closesAt || pollState.closed) return false;
		const remaining = pollState.closesAt - now;
		return remaining > 0 && remaining <= VOTE_EXTEND_MS;
	}, [pollState?.closesAt, pollState?.closed, now]);

	const hasVoted = myVoteOptionId != null;
	const canSelectOption = !hasVoted || reVoteMode;

	async function handleStartPoll(event: React.FormEvent) {
		event.preventDefault();
		setError(null);

		try {
			const closesAt = new Date(closesAtInput).getTime();
			await agent.stub.reset(question, closesAt, optionLabels);
			setShowCreateForm(false);
			setQuestion("");
			setOptionLabels(Array(MIN_VOTE_OPTIONS).fill(""));
			setReVoteMode(false);
			await loadMyVote();
			await loadPollHistory();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "투표 생성에 실패했습니다.",
			);
		}
	}

	async function handleVote(optionId: number) {
		if (!canSelectOption) return;
		setError(null);

		try {
			const result = (await agent.stub.vote(optionId)) as {
				myVoteOptionId: number;
			};
			setMyVoteOptionId(result.myVoteOptionId);
			setReVoteMode(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "투표에 실패했습니다.");
		}
	}

	async function handleAddOption(event: React.FormEvent) {
		event.preventDefault();
		setError(null);

		try {
			await agent.stub.addOption(newOptionLabel);
			setNewOptionLabel("");
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "선택지 추가에 실패했습니다.",
			);
		}
	}

	async function handleExtendPoll() {
		setError(null);

		try {
			await agent.stub.extendPoll();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "마감 연장에 실패했습니다.",
			);
		}
	}

	return (
		<aside className="flex w-full min-w-0 flex-col border-l border-primary/15 bg-card/95 md:w-80">
			<div className="border-b border-primary/10 bg-secondary/30 px-4 py-3">
				<div className="flex items-center gap-2">
					<Vote className="size-4 text-primary" />
					<h2 className="text-sm font-semibold">투표</h2>
				</div>
			</div>

			<div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
				{readonly && (
					<div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
						관전 모드입니다. 실시간 결과는 볼 수 있지만 투표에는 참여할 수
						없습니다.
					</div>
				)}

				{error && (
					<div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
						{error}
					</div>
				)}

				{hasActivePoll && pollState ? (
					<>
						<div className="space-y-2">
							<h3 className="text-base font-semibold leading-snug">
								{pollState.question}
							</h3>
							{pollState.closesAt && (
								<div className="flex items-center justify-between gap-2 text-sm">
									<div className="flex min-w-0 items-center gap-2 text-muted-foreground">
										<Clock className="size-4 shrink-0 text-secondary-foreground" />
										<span className="truncate">
											마감까지 {formatRemaining(pollState.closesAt, now)}
										</span>
									</div>
									{!readonly && canExtendDeadline && (
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="h-7 shrink-0 border-primary/30 bg-accent/50 px-2.5 text-xs hover:bg-accent"
											onClick={() => void handleExtendPoll()}
										>
											+5분
										</Button>
									)}
								</div>
							)}
						</div>

						{!readonly && hasVoted && !reVoteMode && (
							<div className="rounded-lg border border-primary/30 bg-accent/60 px-3 py-2 text-sm text-accent-foreground">
								선택한 항목에 투표했습니다. 변경하려면 다시 투표하세요.
							</div>
						)}

						<div className="space-y-2">
							{pollState.options.map((option) => {
								const isSelected = myVoteOptionId === option.id;
								return (
									<div
										key={option.id}
										className={[
											"flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm",
											isSelected && !readonly
												? "border-primary bg-primary/10 ring-2 ring-primary/30"
												: "bg-background",
										].join(" ")}
									>
										{readonly ? (
											<>
												<span className="font-medium">{option.label}</span>
												<span className="text-muted-foreground">
													{option.votes}표
												</span>
											</>
										) : (
											<button
												type="button"
												disabled={!canSelectOption}
												onClick={() => void handleVote(option.id)}
												className={[
													"flex w-full items-center justify-between text-left transition-colors",
													!canSelectOption
														? "cursor-default opacity-80"
														: "cursor-pointer hover:opacity-80",
												].join(" ")}
											>
												<span className="font-medium">{option.label}</span>
												<span className="text-muted-foreground">
													{option.votes}표
												</span>
											</button>
										)}
									</div>
								);
							})}
						</div>

						{!readonly && hasVoted && !reVoteMode && (
							<Button
								type="button"
								variant="outline"
								className="w-full border-secondary/50 bg-secondary/20 hover:bg-secondary/40"
								onClick={() => setReVoteMode(true)}
							>
								<RefreshCw className="size-4" />
								다시 투표하기
							</Button>
						)}

						{!readonly && (
							<>
								<Separator />

								<form className="space-y-2" onSubmit={handleAddOption}>
									<Label htmlFor="new-option">선택지 추가</Label>
									<div className="flex gap-2">
										<Input
											id="new-option"
											value={newOptionLabel}
											onChange={(e) => setNewOptionLabel(e.target.value)}
											placeholder="새 선택지"
											className="bg-background"
										/>
										<Button
											type="submit"
											size="icon"
											disabled={!newOptionLabel.trim()}
										>
											<Plus className="size-4" />
										</Button>
									</div>
								</form>
							</>
						)}
					</>
				) : showCreateForm && !readonly ? (
					<form className="space-y-4" onSubmit={handleStartPoll}>
						<Field>
							<Label htmlFor="vote-question">투표 주제</Label>
							<Input
								id="vote-question"
								value={question}
								onChange={(e) => setQuestion(e.target.value)}
								placeholder="예: 오늘 점심 메뉴"
								className="bg-background"
							/>
						</Field>

						<Field>
							<Label htmlFor="vote-closes-at">마감 시간</Label>
							<Input
								id="vote-closes-at"
								type="datetime-local"
								value={closesAtInput}
								onChange={(e) => setClosesAtInput(e.target.value)}
								className="bg-background"
							/>
						</Field>

						<div className="space-y-2">
							<Label>선택지 (최소 2개)</Label>
							{optionLabels.map((label, index) => (
								<Input
									key={index}
									value={label}
									onChange={(e) => {
										const next = [...optionLabels];
										next[index] = e.target.value;
										setOptionLabels(next);
									}}
									placeholder={`선택지 ${index + 1}`}
									className="bg-background"
								/>
							))}
							<Button
								type="button"
								variant="outline"
								className="w-full"
								onClick={() => setOptionLabels((prev) => [...prev, ""])}
							>
								<Plus className="size-4" />
								선택지 추가
							</Button>
						</div>

						<div className="flex gap-2">
							<Button type="submit" className="flex-1">
								투표 시작
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={() => setShowCreateForm(false)}
							>
								취소
							</Button>
						</div>
					</form>
				) : (
					<div className="flex flex-col items-center justify-center gap-3 py-4 text-center">
						<p className="text-sm text-muted-foreground">
							진행 중인 투표가 없습니다.
						</p>
						{!readonly && (
							<Button type="button" onClick={() => setShowCreateForm(true)}>
								<Vote className="size-4" />
								투표 생성
							</Button>
						)}
					</div>
				)}

				{pollHistory.length > 0 && (
					<>
						<Separator />
						<div className="space-y-3">
							<div className="flex items-center gap-2">
								<History className="size-4 text-primary" />
								<h3 className="text-sm font-semibold">이전 투표 결과</h3>
							</div>
							{pollHistory.map((poll) => (
								<PollHistoryCard key={poll.id} poll={poll} />
							))}
						</div>
					</>
				)}
			</div>
		</aside>
	);
}
