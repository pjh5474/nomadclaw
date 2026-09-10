import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useState } from "react";
import type { Orchestrator, OrchestratorState } from "../worker/index";

function App() {
	const [query, setQuery] = useState<string | null>(null);

	const agent = useAgent<Orchestrator, OrchestratorState>({
		agent: "Orchestrator",
	});

	const { messages, clearHistory, status, stop, addToolApprovalResponse } =
		useAgentChat({ agent });

	const orchestratorStatus = agent.state?.status ?? "idle";

	const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
		e.preventDefault();
		const form = e.currentTarget;
		const formData = new FormData(form);
		const message = formData.get("input") as string;
		if (!message?.trim()) return;
		form.reset();
		setQuery(message);
		await agent.stub.research(message);
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
							className="text-sm bg-yellow-50 border border-yellow-300 p-2 rounded my-1"
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
									className="px-3 py-1 bg-green-500 text-white rounded"
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
									className="px-3 py-1 bg-red-500 text-white rounded"
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
							className="text-sm bg-red-50 border border-red-300 p-2 rounded my-1"
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
				<div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
					<h1 className="shrink-0 text-sm font-semibold tracking-tight">
						🤖 Orchestrator
					</h1>

					<form onSubmit={handleSubmit} className="flex flex-1 gap-2">
						<input
							name="input"
							placeholder="Type a message..."
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

			<main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6 pb-24">
				{query && (
					<section className="rounded-2xl border border-zinc-200 bg-white p-4">
						<div className="flex items-center gap-2">
							<span
								className={`relative inline-flex h-2 w-2 rounded-full ${
									orchestratorStatus === "planning"
										? "bg-amber-500"
										: "bg-emerald-500"
								}`}
							>
								{orchestratorStatus === "planning" && (
									<span className="absolute inset-0 animate-ping rounded-full bg-amber-500 opacity-75" />
								)}
							</span>
							<span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
								{orchestratorStatus === "planning"
									? "Planning research"
									: "Idle"}
							</span>
						</div>
						<p className="mt-2 text-xs uppercase tracking-wide text-zinc-400">
							Query
						</p>
						<p className="mt-1 text-sm font-medium text-zinc-900">{query}</p>

						{agent.state?.plan && agent.state.plan.length > 0 && (
							<>
								<p className="mt-4 text-xs uppercase tracking-wide text-zinc-400">
									Research plan
								</p>
								<ol className="mt-2 space-y-1.5">
									{agent.state.plan.map((q, i) => {
										const activity = agent.state?.activity?.[`researcher-${i}`];
										return (
											<li
												key={i}
												className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"
											>
												<div className="flex gap-2">
													<span className="font-mono text-xs text-zinc-400">
														{i + 1}
													</span>
													<span className="flex-1 text-zinc-700">{q}</span>
												</div>
												{activity && (
													<div className="mt-1.5 flex items-center gap-1.5 pl-6">
														<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500">
															<span className="absolute inset-0 animate-ping rounded-full bg-amber-500 opacity-75" />
														</span>
														<span className="truncate text-xs text-zinc-500">
															{activity}
														</span>
													</div>
												)}
											</li>
										);
									})}
								</ol>
							</>
						)}
					</section>
				)}

				<div className="flex-1 space-y-4">
					{messages.length === 0 && (
						<div className="flex h-full min-h-[40vh] items-center justify-center text-sm text-zinc-400">
							Say something to get started.
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
