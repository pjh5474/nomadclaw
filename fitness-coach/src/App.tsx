import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useMemo, useState } from "react";

type FileEntry = {
	path: string;
	type: "file" | "directory";
	size: number;
	updatedAt: number;
};

type SkillEntry = {
	name: string;
	description: string;
};

type ExtensionEntry = {
	name: string;
	version: string;
	description?: string;
	tools: string[];
};

type AgentState = {
	files: FileEntry[];
	skills: SkillEntry[];
	extensions: ExtensionEntry[];
};

type AgentStub = {
	readWorkspaceFile: (path: string) => Promise<string | null>;
};

type ActiveSkill = {
	name: string;
	content: string;
};

/** While a turn is in flight, surface the latest activate_skill payload. Cleared when ready (= unloaded). */
function findActiveSkill(
	messages: UIMessage[],
	status: string,
): ActiveSkill | null {
	if (status === "ready" || status === "error") return null;

	let lastUserIdx = -1;
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === "user") {
			lastUserIdx = i;
			break;
		}
	}
	if (lastUserIdx < 0) return null;

	for (let i = messages.length - 1; i > lastUserIdx; i--) {
		const msg = messages[i];
		if (msg.role !== "assistant") continue;
		for (let j = msg.parts.length - 1; j >= 0; j--) {
			const part = msg.parts[j];
			if (!isToolUIPart(part)) continue;
			if (getToolName(part) !== "activate_skill") continue;
			if (part.state !== "output-available") continue;
			const input = part.input as { name?: string } | undefined;
			const output = part.output;
			const content =
				typeof output === "string" ? output : JSON.stringify(output, null, 2);
			return {
				name: input?.name ?? "skill",
				content,
			};
		}
	}
	return null;
}

function App() {
	const [agentState, setAgentState] = useState<AgentState>({
		files: [],
		skills: [],
		extensions: [],
	});
	const [openFile, setOpenFile] = useState<{
		path: string;
		content: string | null;
	} | null>(null);
	const [loadingFile, setLoadingFile] = useState(false);

	const agent = useAgent<AgentState>({
		agent: "CoachAgent",
		onStateUpdate: setAgentState,
	});

	const {
		messages,
		sendMessage,
		clearHistory,
		status,
		stop,
		addToolApprovalResponse,
	} = useAgentChat({ agent });

	const activeSkill = useMemo(
		() => findActiveSkill(messages, status),
		[messages, status],
	);

	const handleFileClick = async (path: string) => {
		setLoadingFile(true);
		setOpenFile({ path, content: null });
		const stub = agent.stub as AgentStub;
		const content = await stub.readWorkspaceFile(path);
		setOpenFile({ path, content });
		setLoadingFile(false);
	};

	const formatSize = (bytes: number) => {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	};

	const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
		e.preventDefault();
		const formData = new FormData(e.currentTarget);
		const message = formData.get("input") as string;
		if (!message?.trim()) return;
		sendMessage({ text: message });
		e.currentTarget.reset();
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
						{part.state === "output-available" &&
							getToolName(part) !== "activate_skill" && (
								<pre className="mt-1 max-h-40 overflow-x-auto text-zinc-600">
									{JSON.stringify(part.output, null, 2)}
								</pre>
							)}
						{part.state === "output-available" &&
							getToolName(part) === "activate_skill" && (
								<p className="mt-1 text-zinc-500">
									가이드 내용은 오른쪽 Skills 패널에서 확인하세요.
								</p>
							)}
					</div>
				);
			}
			return null;
		});
	}

	return (
		<div className="flex h-dvh flex-col bg-zinc-50 text-zinc-900">
			<header className="z-10 flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3">
				<h1 className="shrink-0 text-sm font-semibold tracking-tight">
					Fitness Coach
				</h1>
				<div className="flex items-center gap-2">
					<button
						onClick={clearHistory}
						className="rounded-md px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
					>
						Clear
					</button>
					<button
						onClick={stop}
						className="rounded-md px-2 py-1 text-xs text-red-500 transition hover:bg-red-100 hover:text-red-900"
					>
						Stop
					</button>
					<span className="text-xs text-zinc-400">{status}</span>
				</div>
			</header>

			<div className="flex min-h-0 flex-1">
				{/* Chat */}
				<section className="flex min-w-0 flex-1 flex-col">
					<div className="flex-1 space-y-4 overflow-y-auto px-4 py-6">
						{messages.length === 0 && (
							<div className="flex h-full min-h-[40vh] items-center justify-center text-sm text-zinc-400">
								운동을 보고하거나, 자세·계획을 물어보세요.
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

					<form
						onSubmit={handleSubmit}
						className="flex shrink-0 gap-2 border-t border-zinc-200 bg-white px-4 py-3"
					>
						<input
							name="input"
							placeholder="메시지를 입력하세요..."
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
				</section>

				{/* Fixed right panel */}
				<aside className="flex w-[20rem] shrink-0 flex-col overflow-hidden border-l border-zinc-200 bg-white sm:w-[22rem] lg:w-[26rem]">
					<div className="flex-1 space-y-4 overflow-y-auto p-4">
						{/* Workspace */}
						<section>
							<div className="flex items-center justify-between">
								<h2 className="text-sm font-semibold tracking-tight">
									Workspace
								</h2>
								<span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
									{agentState.files.length}
								</span>
							</div>
							{agentState.files.length === 0 ? (
								<p className="mt-2 text-sm text-zinc-400">No files yet.</p>
							) : (
								<ul className="mt-3 space-y-1">
									{agentState.files.map((file) => (
										<li key={file.path}>
											<button
												type="button"
												onClick={() => handleFileClick(file.path)}
												disabled={file.type === "directory"}
												className="flex w-full items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-left text-sm transition enabled:hover:bg-zinc-100 disabled:cursor-default"
											>
												<span className="text-[10px] uppercase text-zinc-400">
													{file.type === "directory" ? "dir" : "file"}
												</span>
												<span className="flex-1 truncate font-mono text-xs text-zinc-700">
													{file.path}
												</span>
												{file.type === "file" && (
													<span className="shrink-0 text-xs text-zinc-400">
														{formatSize(file.size)}
													</span>
												)}
											</button>
										</li>
									))}
								</ul>
							)}

							{openFile && (
								<div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
									<div className="flex items-center justify-between gap-2">
										<span className="truncate font-mono text-xs text-zinc-700">
											{openFile.path}
										</span>
										<button
											onClick={() => setOpenFile(null)}
											className="shrink-0 rounded-md px-2 py-0.5 text-xs text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-900"
										>
											Close
										</button>
									</div>
									{loadingFile ? (
										<p className="mt-2 text-xs text-zinc-400">Loading…</p>
									) : openFile.content === null ? (
										<p className="mt-2 text-xs text-zinc-400">
											(File is empty or could not be read.)
										</p>
									) : (
										<pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-zinc-700">
											{openFile.content}
										</pre>
									)}
								</div>
							)}
						</section>

						{/* Skills */}
						<section>
							<div className="flex items-center justify-between">
								<h2 className="text-sm font-semibold tracking-tight">Skills</h2>
								<span
									className={`rounded-full px-2 py-0.5 text-xs font-medium ${
										activeSkill
											? "bg-emerald-100 text-emerald-800"
											: "bg-zinc-100 text-zinc-600"
									}`}
								>
									{activeSkill ? "loaded" : agentState.skills.length}
								</span>
							</div>

							{activeSkill ? (
								<div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
									<div className="flex items-center justify-between gap-2">
										<span className="font-mono text-xs font-semibold text-emerald-900">
											{activeSkill.name}
										</span>
										<span className="text-[10px] font-medium uppercase tracking-wide text-emerald-700">
											active
										</span>
									</div>
									<pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-zinc-700">
										{activeSkill.content}
									</pre>
								</div>
							) : (
								<>
									<p className="mt-1 text-xs text-zinc-500">
										R2 가이드 목록. activate_skill 시 내용이 여기에 표시됩니다.
									</p>
									{agentState.skills.length === 0 ? (
										<p className="mt-2 text-sm text-zinc-400">No skills yet.</p>
									) : (
										<ul className="mt-3 space-y-2">
											{agentState.skills.map((skill) => (
												<li
													key={skill.name}
													className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2"
												>
													<div className="font-mono text-xs font-semibold text-zinc-800">
														{skill.name}
													</div>
													<p className="mt-0.5 text-xs leading-relaxed text-zinc-600">
														{skill.description}
													</p>
												</li>
											))}
										</ul>
									)}
								</>
							)}
						</section>

						{/* Tools / Extensions */}
						<section>
							<div className="flex items-center justify-between">
								<h2 className="text-sm font-semibold tracking-tight">Tools</h2>
								<span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
									{agentState.extensions.length}
								</span>
							</div>
							<p className="mt-1 text-xs text-zinc-500">
								런타임에 load_extension으로 만든 확장 도구입니다.
							</p>
							{agentState.extensions.length === 0 ? (
								<p className="mt-2 text-sm text-zinc-400">
									No extensions loaded.
								</p>
							) : (
								<ul className="mt-3 space-y-2">
									{agentState.extensions.map((ext) => (
										<li
											key={ext.name}
											className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2"
										>
											<div className="flex items-baseline justify-between gap-2">
												<span className="font-mono text-xs font-semibold text-zinc-800">
													{ext.name}
												</span>
												<span className="text-[10px] text-zinc-400">
													v{ext.version}
												</span>
											</div>
											{ext.description && (
												<p className="mt-0.5 text-xs text-zinc-600">
													{ext.description}
												</p>
											)}
											{ext.tools.length > 0 && (
												<ul className="mt-2 space-y-1">
													{ext.tools.map((toolName) => (
														<li
															key={toolName}
															className="rounded bg-zinc-900/90 px-1.5 py-0.5 font-mono text-[10px] text-white"
														>
															{toolName}
														</li>
													))}
												</ul>
											)}
										</li>
									))}
								</ul>
							)}
						</section>
					</div>
				</aside>
			</div>
		</div>
	);
}

export default App;
