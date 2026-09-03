import {
	getToolName,
	isToolUIPart,
	type ChatAddToolApproveResponseFunction,
	type UIMessage,
} from "ai";

export default function renderMessage(
	msg: UIMessage,
	addToolApprovalResponse: ChatAddToolApproveResponseFunction,
) {
	return msg.parts.map((part, i) => {
		if (part.type === "text")
			return (
				<p key={i} className="whitespace-pre-wrap leading-relaxed">
					{part.text}
				</p>
			);
		// if (part.type === "reasoning")
		// 	return (
		// 		<p key={i} className="text-xs italic text-zinc-500">
		// 			{part.text}
		// 		</p>
		// 	);
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
							<pre className="mt-1">{JSON.stringify(part.input, null, 2)}</pre>
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
					{/* {"input" in part && part.input != null && (
						<pre className="mt-1 overflow-x-auto text-zinc-600">
							{JSON.stringify(part.input, null, 2)}
						</pre>
					)} */}
					{/* {part.state === "output-available" && (
						<pre className="mt-1 overflow-x-auto text-zinc-600">
							{JSON.stringify(part.output, null, 2)}
						</pre>
					)} */}
				</div>
			);
		}
		return null;
	});
}
