import { useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import type { WebDetectiveState } from "../worker/index.ts";

function App() {
	const [state, setState] = useState<WebDetectiveState>({
		evidences: [],
		lastVisitedUrl: null,
		urlVisitedHistory: [],
		liveUrl: undefined,
	});

	const agent = useAgent<WebDetectiveState>({
		agent: "WebDetectiveAgent",
		onStateUpdate: (next) => setState(next),
	});

	const {
		messages,
		sendMessage,
		clearHistory,
		status,
		stop,
		addToolApprovalResponse,
	} = useAgentChat({ agent });

	const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
		e.preventDefault();
		const formData = new FormData(e.currentTarget);
		const message = formData.get("input") as string;
		if (!message?.trim()) return;
		sendMessage({ text: message });
		e.currentTarget.reset();
	};

	function screenshotKeysFromMessage(msg: UIMessage) {
		const keys: string[] = [];
		for (const part of msg.parts) {
			if (!isToolUIPart(part) || part.state !== "output-available") continue;
			const name = getToolName(part);
			if (name !== "followLink" && name !== "screenshot") continue;
			const filename = (part.output as { filename?: string } | undefined)
				?.filename;
			if (filename && !keys.includes(filename)) keys.push(filename);
		}
		return keys;
	}

	function renderMessage(msg: UIMessage) {
		const screenshotKeys = screenshotKeysFromMessage(msg);

		return (
			<>
				{msg.parts.map((part, i) => {
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

						const name = getToolName(part);

						return (
							<div
								key={i}
								className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs"
							>
								<div className="flex items-center gap-2">
									<span className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-white">
										{name}
									</span>
									<span className="text-zinc-500">{part.state}</span>
								</div>
								{"input" in part && part.input != null && (
									<pre className="mt-1 overflow-x-auto text-zinc-600">
										{JSON.stringify(part.input, null, 2)}
									</pre>
								)}
								{part.state === "output-available" && (
									<pre className="mt-1 max-h-40 overflow-auto text-zinc-600">
										{JSON.stringify(part.output, null, 2)}
									</pre>
								)}
							</div>
						);
					}
					return null;
				})}
				{screenshotKeys.map((key) => (
					<img
						key={key}
						src={`/${key}`}
						alt="page evidence"
						className="mt-3 w-full rounded-lg border border-zinc-200"
					/>
				))}
			</>
		);
	}

	return (
		<div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
			<header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
				<div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
					<h1 className="shrink-0 text-sm font-semibold tracking-tight">
						🕵️ Web Detective
					</h1>

					<form onSubmit={handleSubmit} className="flex flex-1 gap-2">
						<input
							name="input"
							placeholder="Question + starting URL..."
							autoComplete="off"
							className="flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm outline-none transition focus:border-zinc-400 focus:bg-white"
						/>
						<button
							type="submit"
							className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
						>
							Send
						</button>
					</form>
					<button
						onClick={clearHistory}
						className="shrink-0 rounded-md px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
					>
						Clear
					</button>
					<button
						onClick={stop}
						className="shrink-0 rounded-md px-2 py-1 text-xs text-red-500 transition hover:bg-red-100 hover:text-red-900"
					>
						Stop
					</button>
					<span className="shrink-0 text-xs text-zinc-400">{status}</span>
				</div>
			</header>

			<main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-6 pb-24 lg:grid-cols-[1fr_320px]">
				<section className="min-w-0 space-y-4">
					{state.liveUrl ? (
						<div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
							<iframe
								title="Browser Live View"
								src={state.liveUrl}
								className="aspect-video h-auto min-h-105 w-full"
								allow="clipboard-read; clipboard-write"
							/>
						</div>
					) : (
						<div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-zinc-300 text-xs text-zinc-400">
							Live View appears after the browser session starts (deployed
							Worker required).
						</div>
					)}

					{messages.length === 0 && (
						<div className="flex min-h-[30vh] items-center justify-center text-sm text-zinc-400">
							Ask a question with a starting URL to begin.
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
									className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm ${
										isUser
											? "bg-zinc-900 text-white"
											: "border border-zinc-200 bg-white text-zinc-900"
									}`}
								>
									{renderMessage(message)}
								</div>
							</div>
						);
					})}
				</section>

				<aside className="sticky top-17 flex max-h-[calc(100svh-5rem)] flex-col self-start overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
					<div className="border-b border-zinc-100 px-4 py-3">
						<h2 className="text-sm font-semibold">Evidence</h2>
						<p className="mt-0.5 text-xs text-zinc-500">
							{state.urlVisitedHistory.length}/5 hops · {state.evidences.length}{" "}
							screenshots
						</p>
					</div>

					<div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
						{state.evidences.length === 0 ? (
							<p className="py-8 text-center text-xs text-zinc-400">
								Screenshots appear here as the agent explores.
							</p>
						) : (
							state.evidences.map((evidence, index) => (
								<figure key={evidence.key} className="space-y-1">
									<figcaption className="text-[11px] text-zinc-500">
										#{index + 1}{" "}
										{state.urlVisitedHistory[index] ?? evidence.key}
									</figcaption>
									<img
										src={`/${evidence.key}`}
										alt={`Evidence ${index + 1}`}
										className="w-full rounded-lg border border-zinc-200"
									/>
								</figure>
							))
						)}
					</div>
				</aside>
			</main>
		</div>
	);
}

export default App;
