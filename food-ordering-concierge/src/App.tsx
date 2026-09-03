import { useAgent } from "agents/react";
import { useAgentChat } from "agents/chat/react";
import { ShoppingCartIcon } from "lucide-react";
import { useState } from "react";
import renderMessage from "../components/renderMessages";
import type { CartLine, FoodOrderingState } from "@/worker/index";

function formatKrw(amount: number) {
	return `${amount.toLocaleString("ko-KR")}원`;
}

function App() {
	const [cart, setCart] = useState<CartLine[]>([]);

	const agent = useAgent<FoodOrderingState>({
		agent: "FoodOrderingConciergeAgent",
		onStateUpdate: (state) => {
			setCart(state.cart);
		},
	});

	const {
		messages,
		sendMessage,
		clearHistory,
		status,
		stop,
		addToolApprovalResponse,
	} = useAgentChat({
		agent,
		onToolCall: async ({ toolCall, addToolOutput }) => {
			if (toolCall.toolName === "getLocation") {
				const position = await new Promise<GeolocationPosition>(
					(resolve, reject) =>
						navigator.geolocation.getCurrentPosition(resolve, reject),
				);
				addToolOutput({
					toolCallId: toolCall.toolCallId,
					output: position.toJSON(),
				});
			}
		},
	});

	const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
		e.preventDefault();
		const formData = new FormData(e.currentTarget);
		const message = formData.get("input") as string;
		if (!message?.trim()) return;
		sendMessage({ text: message });
		e.currentTarget.reset();
	};

	const subtotal = cart.reduce(
		(sum, line) => sum + line.price * line.quantity,
		0,
	);
	const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

	return (
		<div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
			<header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
				<div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
					<h1 className="shrink-0 text-sm font-semibold tracking-tight">
						🍔 Food Ordering Concierge 🍔
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
					{status}
				</div>
			</header>

			<main className="mx-auto flex w-full max-w-5xl flex-1 gap-4 px-4 py-6 pb-24">
				<section className="flex min-w-0 flex-1 flex-col">
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
										{renderMessage(message, addToolApprovalResponse)}
									</div>
								</div>
							);
						})}
					</div>
				</section>

				<aside className="sticky top-17 flex max-h-[calc(100svh-4.75rem)] w-72 shrink-0 flex-col self-start overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
					<div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 px-4 py-3">
						<ShoppingCartIcon className="size-4 text-zinc-600" />
						<h2 className="text-sm font-semibold">장바구니</h2>
						{itemCount > 0 && (
							<span className="ml-auto rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white">
								{itemCount}
							</span>
						)}
					</div>

					<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
						{cart.length === 0 ? (
							<p className="py-8 text-center text-xs text-zinc-400">
								담긴 메뉴가 없습니다.
							</p>
						) : (
							<ul className="space-y-2">
								{cart.map((line) => (
									<li
										key={line.id}
										className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2"
									>
										<div className="flex items-start justify-between gap-2">
											<span className="text-sm font-medium leading-snug">
												{line.name}
											</span>
											<span className="shrink-0 text-xs text-zinc-500">
												x{line.quantity}
											</span>
										</div>
										<p className="mt-1 text-xs text-zinc-500">
											{formatKrw(line.price * line.quantity)}
										</p>
									</li>
								))}
							</ul>
						)}
					</div>

					<div className="shrink-0 border-t border-zinc-100 bg-white px-4 py-3">
						<div className="flex items-center justify-between text-sm">
							<span className="text-zinc-500">합계</span>
							<span className="font-semibold">{formatKrw(subtotal)}</span>
						</div>
					</div>
				</aside>
			</main>
		</div>
	);
}

export default App;
