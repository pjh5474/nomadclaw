import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useCallback, useEffect, useState } from "react";
import type { RAGAgent, SourceInfo } from "../worker/index.ts";

function App() {
	const [sources, setSources] = useState<SourceInfo[]>([]);
	const [loadingSources, setLoadingSources] = useState(true);
	const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	const agent = useAgent<RAGAgent>({ agent: "RAGAgent", name: "default" });

	const {
		messages,
		sendMessage,
		clearHistory,
		status,
		stop,
		addToolApprovalResponse,
	} = useAgentChat({ agent });

	const refreshSources = useCallback(async () => {
		try {
			await agent.ready;
			const list = (await agent.stub.getSources()) as SourceInfo[];
			setSources(list);
		} finally {
			setLoadingSources(false);
		}
	}, [agent]);

	useEffect(() => {
		void refreshSources();
	}, [refreshSources]);

	// Refresh the panel after the agent finishes a turn (e.g. saveUrl / deleteSource).
	useEffect(() => {
		if (status === "ready" || status === "error") {
			void refreshSources();
		}
	}, [status, messages.length, refreshSources]);

	const handleDelete = async (source: SourceInfo) => {
		if (
			!window.confirm(
				`Delete "${source.title}"?\nThis removes chunks from SQL and Vectorize.`,
			)
		) {
			return;
		}
		setDeletingUrl(source.url);
		setNotice(null);
		try {
			await agent.ready;
			await agent.stub.deleteSource(source.url);
			setNotice(`Deleted "${source.title}".`);
			await refreshSources();
		} finally {
			setDeletingUrl(null);
		}
	};

	const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
		e.preventDefault();
		const formData = new FormData(e.currentTarget);
		const message = formData.get("input") as string;
		if (!message?.trim()) return;
		sendMessage({ text: message });
		e.currentTarget.reset();
	};

	function sourceLinksFromMessage(msg: UIMessage) {
		const links: { url: string; title: string }[] = [];
		const seen = new Set<string>();

		for (const part of msg.parts) {
			if (!isToolUIPart(part) || part.state !== "output-available") continue;
			if (getToolName(part) !== "recall") continue;

			const output = part.output;
			if (!Array.isArray(output)) continue;

			for (const item of output) {
				if (!item || typeof item !== "object") continue;
				const record = item as { sourceUrl?: unknown; title?: unknown };
				const url =
					typeof record.sourceUrl === "string" ? record.sourceUrl : null;
				if (!url || seen.has(url)) continue;
				seen.add(url);
				links.push({
					url,
					title:
						typeof record.title === "string" && record.title.trim()
							? record.title
							: url,
				});
			}
		}

		return links;
	}

	function renderMessage(msg: UIMessage) {
		const sourceLinks = sourceLinksFromMessage(msg);

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

						const toolName = getToolName(part);
						const output =
							part.state === "output-available" ? part.output : null;
						const isSaveUrlError =
							toolName === "saveUrl" &&
							!!output &&
							typeof output === "object" &&
							"status" in output &&
							(output as { status?: string }).status === "error";

						return (
							<div
								key={i}
								className={`mt-2 rounded-md border p-2 text-xs ${
									isSaveUrlError
										? "border-red-300 bg-red-50"
										: "border-zinc-200 bg-zinc-50"
								}`}
							>
								<div className="flex items-center gap-2">
									<span
										className={`rounded px-1.5 py-0.5 font-mono text-[10px] text-white ${
											isSaveUrlError ? "bg-red-700" : "bg-zinc-900"
										}`}
									>
										{toolName}
									</span>
									<span
										className={
											isSaveUrlError ? "text-red-700" : "text-zinc-500"
										}
									>
										{part.state}
										{isSaveUrlError ? " — failed" : ""}
									</span>
								</div>
								{"input" in part && part.input != null && (
									<pre className="mt-1 overflow-x-auto text-zinc-600">
										{JSON.stringify(part.input, null, 2)}
									</pre>
								)}
								{part.state === "output-available" && (
									<pre
										className={`mt-1 overflow-x-auto whitespace-pre-wrap wrap-break-word ${
											isSaveUrlError ? "text-red-800" : "text-zinc-600"
										}`}
									>
										{JSON.stringify(part.output, null, 2)}
									</pre>
								)}
								{part.state === "output-error" && "errorText" in part && (
									<pre className="mt-1 overflow-x-auto whitespace-pre-wrap wrap-break-word text-red-800">
										{String(part.errorText)}
									</pre>
								)}
							</div>
						);
					}
					return null;
				})}
				{sourceLinks.length > 0 && (
					<div className="mt-3 border-t border-zinc-200 pt-2">
						<p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
							Sources
						</p>
						<ul className="space-y-1">
							{sourceLinks.map((link) => (
								<li key={link.url}>
									<a
										href={link.url}
										target="_blank"
										rel="noreferrer"
										className="block truncate text-xs text-blue-700 underline-offset-2 hover:underline"
										title={link.url}
									>
										{link.title}
									</a>
									<a
										href={link.url}
										target="_blank"
										rel="noreferrer"
										className="block truncate text-[11px] text-zinc-500 underline-offset-2 hover:underline"
									>
										{link.url}
									</a>
								</li>
							))}
						</ul>
					</div>
				)}
			</>
		);
	}

	return (
		<div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
			<header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
				<div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
					<h1 className="shrink-0 text-sm font-semibold tracking-tight">
						🧠 Second Brain
					</h1>

					<form onSubmit={handleSubmit} className="flex flex-1 gap-2">
						<input
							name="input"
							placeholder="Paste a URL to remember, or ask a question..."
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

			<main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 pb-24">
				<section className="rounded-xl border border-zinc-200 bg-white p-4">
					<div className="mb-3 flex items-center justify-between gap-2">
						<h2 className="text-sm font-semibold">Saved pages</h2>
						<button
							type="button"
							onClick={() => {
								setLoadingSources(true);
								void refreshSources();
							}}
							className="rounded-md px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
						>
							Refresh
						</button>
					</div>
					{notice && (
						<p className="mb-3 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
							{notice}
						</p>
					)}
					{loadingSources ? (
						<p className="text-xs text-zinc-400">Loading…</p>
					) : sources.length === 0 ? (
						<p className="text-xs text-zinc-400">No pages saved yet.</p>
					) : (
						<ul className="divide-y divide-zinc-100">
							{sources.map((source) => (
								<li
									key={source.url}
									className="flex items-center justify-between gap-3 py-2"
								>
									<div className="min-w-0">
										<p className="truncate text-sm font-medium">
											{source.title}
										</p>
										<a
											href={source.url}
											target="_blank"
											rel="noreferrer"
											className="block truncate text-[11px] text-zinc-500 underline-offset-2 hover:underline"
										>
											{source.url}
										</a>
										<p className="truncate text-[11px] text-zinc-400">
											{source.chunkCount} chunks ·{" "}
											{new Date(source.createdAt).toLocaleString()}
										</p>
									</div>
									<button
										type="button"
										onClick={() => void handleDelete(source)}
										disabled={deletingUrl === source.url}
										className="shrink-0 rounded-md px-2 py-1 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-50"
									>
										{deletingUrl === source.url ? "Deleting…" : "Delete"}
									</button>
								</li>
							))}
						</ul>
					)}
				</section>

				<div className="flex-1 space-y-4">
					{messages.length === 0 && (
						<div className="flex h-full min-h-[30vh] flex-col items-center justify-center gap-2 text-center text-sm text-zinc-400">
							<p>Paste a URL and I’ll read & remember the page.</p>
							<p>Ask questions later — I’ll answer with source links.</p>
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
