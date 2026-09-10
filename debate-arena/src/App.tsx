import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useState } from "react";
import type {
	Claim,
	DebateArena,
	DebateArenaState,
} from "../worker/index.ts";

function statusLabel(status: DebateArenaState["status"]) {
	switch (status) {
		case "extracting":
			return "양쪽 입장 추출 중";
		case "debating":
			return "대변인 주장 준비 중";
		case "judging":
			return "심판 판정 중";
		case "done":
			return "판정 완료";
		case "cancelled":
			return "중단됨";
		case "error":
			return "오류 발생";
		default:
			return "대기";
	}
}

function ClaimCard({
	label,
	stance,
	activity,
	claim,
	error,
	busy,
}: {
	label: string;
	stance?: string;
	activity?: string;
	claim?: Claim;
	error?: string;
	busy: boolean;
}) {
	return (
		<div
			className={`rounded-lg border p-3 ${
				error ? "border-red-300 bg-red-50" : "border-zinc-200 bg-zinc-50"
			}`}
		>
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
						{label}
					</p>
					<p className="truncate text-sm font-semibold text-zinc-900">
						{stance ?? "입장 추출 중…"}
					</p>
				</div>
				{busy && !error && (
					<span className="relative mt-1 inline-flex h-2 w-2 shrink-0 rounded-full bg-amber-500">
						<span className="absolute inset-0 animate-ping rounded-full bg-amber-500 opacity-75" />
					</span>
				)}
			</div>

			{error ? (
				<div className="mt-2 space-y-1">
					<p className="text-xs font-medium text-red-700">Subagent error</p>
					<pre className="overflow-x-auto whitespace-pre-wrap wrap-break-word text-xs text-red-800">
						{error}
					</pre>
				</div>
			) : (
				activity && (
					<p className="mt-2 truncate text-xs text-amber-700">{activity}</p>
				)
			)}

			{claim && (
				<div className="mt-3 space-y-2 text-xs text-zinc-700">
					<p>
						<span className="font-medium text-zinc-500">Opening</span>
						<br />
						{claim.opening}
					</p>
					<ol className="space-y-1.5">
						{claim.arguments.map((arg, i) => (
							<li
								key={i}
								className="rounded-md border border-zinc-200 bg-white px-2 py-1.5"
							>
								<p className="font-medium">
									{i + 1}. {arg.point}
								</p>
								<p className="mt-0.5 text-zinc-600">{arg.reasoning}</p>
							</li>
						))}
					</ol>
					<p>
						<span className="font-medium text-zinc-500">Closing</span>
						<br />
						{claim.closing}
					</p>
				</div>
			)}
		</div>
	);
}

function App() {
	const [query, setQuery] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const agent = useAgent<DebateArena, DebateArenaState>({
		agent: "DebateArena",
	});

	const { messages, clearHistory, status, stop, addToolApprovalResponse } =
		useAgentChat({ agent });

	const debateStatus = agent.state?.status ?? "idle";
	const isLive =
		debateStatus === "extracting" ||
		debateStatus === "debating" ||
		debateStatus === "judging";

	const handleStop = async () => {
		stop();
		setSubmitting(false);
		try {
			await agent.ready;
			await agent.stub.cancelDebate();
		} catch {
			// Ignore cancel races if the agent is reconnecting.
		}
	};

	const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
		e.preventDefault();
		const form = e.currentTarget;
		const formData = new FormData(form);
		const message = formData.get("input") as string;
		if (!message?.trim() || submitting) return;
		form.reset();
		setQuery(message);
		setSubmitting(true);
		try {
			await agent.ready;
			await agent.stub.debate(message);
		} catch {
			// Cancelled debates reject the callable; keep UI usable.
		} finally {
			setSubmitting(false);
		}
	};

	function renderMessage(msg: UIMessage) {
		return msg.parts.map((part, i) => {
			if (part.type === "text")
				return (
					<p key={i} className="whitespace-pre-wrap leading-relaxed">
						{part.text}
					</p>
				);
			if (part.type === "reasoning")
				return (
					<p key={i} className="text-xs italic text-zinc-500">
						{part.text}
					</p>
				);
			if (isToolUIPart(part)) {
				if ("approval" in part && part.state === "approval-requested") {
					return (
						<div
							key={i}
							className="my-1 rounded border border-yellow-300 bg-yellow-50 p-2 text-sm"
						>
							<div>
								<strong>Approve {getToolName(part)}?</strong>
							</div>
							{"input" in part && part.input != null && (
								<pre className="mt-1">
									{JSON.stringify(part.input, null, 2)}
								</pre>
							)}
							<div className="mt-2 flex gap-2">
								<button
									className="rounded bg-green-500 px-3 py-1 text-white"
									onClick={() =>
										addToolApprovalResponse({
											id: part.approval.id,
											approved: true,
										})
									}
								>
									Approve
								</button>
								<button
									className="rounded bg-red-500 px-3 py-1 text-white"
									onClick={() =>
										addToolApprovalResponse({
											id: part.approval.id,
											approved: false,
										})
									}
								>
									Reject
								</button>
							</div>
						</div>
					);
				}

				if (part.state === "output-denied") {
					return (
						<div
							key={i}
							className="my-1 rounded border border-red-300 bg-red-50 p-2 text-sm"
						>
							<strong>{getToolName(part)}</strong> — Rejected
						</div>
					);
				}

				return (
					<div
						key={i}
						className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs"
					>
						<div className="flex items-center gap-2">
							<span className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-white">
								{getToolName(part)}
							</span>
							<span className="text-zinc-500">{part.state}</span>
						</div>
						{"input" in part && part.input != null && (
							<pre className="mt-1 overflow-x-auto text-zinc-600">
								{JSON.stringify(part.input, null, 2)}
							</pre>
						)}
						{part.state === "output-available" && (
							<pre className="mt-1 overflow-x-auto text-zinc-600">
								{JSON.stringify(part.output, null, 2)}
							</pre>
						)}
					</div>
				);
			}
			return null;
		});
	}

	return (
		<div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
			<header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
				<div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
					<h1 className="shrink-0 text-sm font-semibold tracking-tight">
						⚔️ Debate Arena
					</h1>

					<form onSubmit={handleSubmit} className="flex flex-1 gap-2">
						<input
							name="input"
							placeholder="예: 민초 찬성인가 반대인가? / 부먹 vs 찍먹"
							autoComplete="off"
							disabled={submitting || isLive}
							className="flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm outline-none transition focus:border-zinc-400 focus:bg-white disabled:opacity-50"
						/>
						<button
							type="submit"
							disabled={submitting || isLive}
							className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50"
						>
							Debate
						</button>
					</form>
					<button
						onClick={clearHistory}
						className="shrink-0 rounded-md px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
					>
						Clear
					</button>
					<button
						onClick={() => void handleStop()}
						className="shrink-0 rounded-md px-2 py-1 text-xs text-red-500 transition hover:bg-red-100 hover:text-red-900"
					>
						Stop
					</button>
					<span className="shrink-0 text-xs text-zinc-400">{status}</span>
				</div>
			</header>

			<main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6 pb-24">
				{query && (
					<section className="rounded-2xl border border-zinc-200 bg-white p-4">
						<div className="flex items-center gap-2">
							<span
								className={`relative inline-flex h-2 w-2 rounded-full ${
									debateStatus === "error"
										? "bg-red-500"
										: isLive
											? "bg-amber-500"
											: "bg-emerald-500"
								}`}
							>
								{isLive && (
									<span className="absolute inset-0 animate-ping rounded-full bg-amber-500 opacity-75" />
								)}
							</span>
							<span
								className={`text-xs font-medium uppercase tracking-wide ${
									debateStatus === "error" ? "text-red-600" : "text-zinc-500"
								}`}
							>
								{statusLabel(debateStatus)}
							</span>
						</div>

						<p className="mt-2 text-xs uppercase tracking-wide text-zinc-400">
							Topic
						</p>
						<p className="mt-1 text-sm font-medium text-zinc-900">
							{agent.state?.topic ?? query}
						</p>

						{agent.state?.errors &&
							Object.keys(agent.state.errors).length > 0 && (
								<div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3">
									<p className="text-xs font-semibold text-red-700">
										Debate failed
									</p>
									<ul className="mt-2 space-y-2">
										{Object.entries(agent.state.errors).map(([who, message]) => (
											<li key={who} className="text-xs text-red-800">
												<p className="font-medium uppercase tracking-wide text-red-600">
													{who}
												</p>
												<pre className="mt-0.5 overflow-x-auto whitespace-pre-wrap wrap-break-word">
													{message}
												</pre>
											</li>
										))}
									</ul>
								</div>
							)}

						<div className="mt-4 grid gap-3 md:grid-cols-2">
							<ClaimCard
								label="Advocate A"
								stance={agent.state?.sideA}
								activity={agent.state?.activity?.["advocate-a"]}
								claim={agent.state?.claims?.a}
								error={agent.state?.errors?.["advocate-a"]}
								busy={
									debateStatus === "debating" &&
									!agent.state?.claims?.a &&
									!agent.state?.errors?.["advocate-a"]
								}
							/>
							<ClaimCard
								label="Advocate B"
								stance={agent.state?.sideB}
								activity={agent.state?.activity?.["advocate-b"]}
								claim={agent.state?.claims?.b}
								error={agent.state?.errors?.["advocate-b"]}
								busy={
									debateStatus === "debating" &&
									!agent.state?.claims?.b &&
									!agent.state?.errors?.["advocate-b"]
								}
							/>
						</div>
					</section>
				)}

				<div className="flex-1 space-y-4">
					{messages.length === 0 && !query && (
						<div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-2 text-center text-sm text-zinc-400">
							<p>토론 주제를 입력하면 양쪽 대변인이 동시에 주장을 준비합니다.</p>
							<p>예: 민초 찬성/반대 · 탕수육 부먹/찍먹 · 깻잎논쟁</p>
						</div>
					)}
					{messages.map((message) => {
						const isUser = message.role === "user";
						return (
							<div
								key={message.id}
								className={`flex ${isUser ? "justify-end" : "justify-start"}`}
							>
								<div
									className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
										isUser
											? "bg-zinc-900 text-white"
											: "border border-zinc-200 bg-white text-zinc-900"
									}`}
								>
									{!isUser && (
										<p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
											Judge
										</p>
									)}
									{renderMessage(message)}
								</div>
							</div>
						);
					})}
				</div>
			</main>
		</div>
	);
}

export default App;
