import { createWorkersAI } from "workers-ai-provider";
import { AIChatAgent } from "@cloudflare/ai-chat";
import { callable, routeAgentRequest } from "agents";
import puppeteer, { type Browser, type Page } from "@cloudflare/puppeteer";
import {
	convertToModelMessages,
	createUIMessageStreamResponse,
	hasToolCall,
	isLoopFinished,
	streamText,
	toUIMessageStream,
} from "ai";
import { WEB_DETECTIVE_SYSTEM_PROMPT } from "./prompt.ts";
import {
	createBrowserClose,
	createFollowLink,
	createScreenshot,
	readPage,
} from "./tools.ts";

export type WebDetectiveState = {
	evidences: { key: string; createdAt: number }[];
	lastVisitedUrl: string | null;
	urlVisitedHistory: string[];
	liveUrl?: string;
};

export class WebDetectiveAgent extends AIChatAgent<Env, WebDetectiveState> {
	initialState: WebDetectiveState = {
		evidences: [],
		lastVisitedUrl: null,
		urlVisitedHistory: [],
		liveUrl: undefined,
	};

	browser?: Browser;
	page?: Page;

	onStart() {
		void this.sql`
			CREATE TABLE IF NOT EXISTS web_detective_actions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				url TEXT NOT NULL,
				created_at INTEGER NOT NULL
			)
		`;

		void this.sql`
			CREATE TABLE IF NOT EXISTS web_detective_evidences (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				web_detective_action_id INTEGER NOT NULL REFERENCES web_detective_actions(id) ON DELETE CASCADE,
				key TEXT NOT NULL,
				created_at INTEGER NOT NULL
			)
		`;
	}

	private clearInvestigationState(extra?: Partial<WebDetectiveState>) {
		this.setState({
			evidences: [],
			lastVisitedUrl: null,
			urlVisitedHistory: [],
			liveUrl: undefined,
			...extra,
		});
	}

	private updatePublicState(partial: Partial<WebDetectiveState>) {
		this.setState({
			...this.state,
			...partial,
		});
	}

	private stateAccess() {
		return {
			getState: () => this.state,
			setState: (partial: Partial<WebDetectiveState>) =>
				this.updatePublicState(partial),
		};
	}

	async getPage() {
		if (this.page && this.browser?.connected) return this.page;
		this.browser = await puppeteer.launch(this.env.BROWSER);
		this.page = await this.browser.newPage();

		await this.page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

		await this.getLiveViewURL();
		return this.page;
	}

	async closeBrowser() {
		const hadBrowser = !!this.browser;
		if (hadBrowser) {
			try {
				this.saveStateOnSQL();
			} catch (err) {
				console.error("[closeBrowser] saveStateOnSQL failed:", err);
			}
			await this.browser?.close().catch(() => {});
		}

		this.browser = undefined;
		this.page = undefined;
		// Keep evidences/path visible until the next user request starts
		this.updatePublicState({ liveUrl: undefined });
	}

	async getLiveViewURL() {
		if (!this.browser || !this.page) return;

		try {
			// Prefer CDP Live View (works through the Browser binding; no REST UUID needed)
			const cdp = await this.page.createCDPSession();
			const live = (await cdp.send("Cloudflare.getLiveView" as never, {
				mode: "tab",
				expiresInMs: 300_000,
			} as never)) as { devtoolsFrontendUrl?: string };

			if (live?.devtoolsFrontendUrl) {
				this.updatePublicState({ liveUrl: live.devtoolsFrontendUrl });
				return;
			}
		} catch (err) {
			console.error("[liveView] CDP getLiveView failed:", err);
		}

		// Fallback: REST API needs the real session UUID from sessionId()
		const sessionId = this.browser.sessionId();
		if (!sessionId || sessionId === "unknown") {
			console.error("[liveView] missing session UUID:", sessionId);
			return;
		}

		const res = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${this.env.ACCOUNT_ID}/browser-rendering/devtools/browser/${sessionId}/json/list`,
			{
				headers: {
					Authorization: `Bearer ${this.env.API_TOKEN}`,
				},
			},
		);

		const json: unknown = await res.json();
		if (!res.ok) {
			console.error("[liveView] REST failed:", res.status, json);
			return;
		}

		type DevtoolsTarget = { type: string; devtoolsFrontendUrl: string };
		const targets: DevtoolsTarget[] = Array.isArray(json)
			? (json as DevtoolsTarget[])
			: ((json as { result?: DevtoolsTarget[] }).result ?? []);

		const url = targets.find((target) => target.type === "page")
			?.devtoolsFrontendUrl;
		if (!url) {
			console.error("[liveView] no page target in", json);
			return;
		}

		const liveUrl = new URL(
			url.startsWith("http") ? url : `https://live.browser.run${url}`,
		);
		liveUrl.searchParams.set("mode", "tab");
		this.updatePublicState({ liveUrl: liveUrl.toString() });
	}

	async onChatMessage(
		_onFinish: unknown,
		options?: {
			abortSignal?: AbortSignal;
		},
	) {
		// New user message = new investigation: drop previous session/hops/evidence
		if (this.browser?.connected) {
			await this.browser.close().catch(() => {});
			this.browser = undefined;
			this.page = undefined;
		}
		this.clearInvestigationState();

		const workersAi = createWorkersAI({ binding: this.env.AI });
		const stateAccess = this.stateAccess();

		const result = streamText({
			model: workersAi("@cf/zai-org/glm-4.7-flash"),
			system: WEB_DETECTIVE_SYSTEM_PROMPT,
			messages: await convertToModelMessages(this.messages),
			tools: {
				readPage: readPage(() => this.getPage()),
				followLink: createFollowLink(
					() => this.getPage(),
					this.env.FILES,
					stateAccess,
				),
				screenshot: createScreenshot(
					() => this.getPage(),
					this.env.FILES,
					stateAccess,
				),
				closeBrowser: createBrowserClose(() => this.closeBrowser()),
			},
			abortSignal: options?.abortSignal,
			// End the agent loop as soon as closeBrowser runs (prevents report spam)
			stopWhen: [isLoopFinished(), hasToolCall("closeBrowser")],
		});

		return createUIMessageStreamResponse({
			stream: toUIMessageStream({
				stream: result.stream,
				originalMessages: this.messages,
			}),
		});
	}

	@callable()
	saveStateOnSQL() {
		if (!this.state.lastVisitedUrl) return;

		const [actionId] = this.sql`
			INSERT INTO web_detective_actions (url, created_at)
			VALUES (${this.state.lastVisitedUrl}, ${Date.now()})
			RETURNING id
		`;

		for (const evidence of this.state.evidences) {
			this.sql`
				INSERT INTO web_detective_evidences (web_detective_action_id, key, created_at)
				VALUES (${actionId.id}, ${evidence.key}, ${evidence.createdAt})
			`;
		}
	}

	@callable()
	resetWebDetectiveState() {
		void this.closeBrowser();
		this.clearInvestigationState();
	}

	@callable()
	readWebDetectiveActions() {
		const actions = this.sql`
			SELECT id, url, created_at FROM web_detective_actions
			ORDER BY created_at DESC
			LIMIT 10
		`;
		return actions.map((action) => ({
			url: action.url,
			createdAt: action.created_at,
		}));
	}

	@callable()
	readWebDetectiveEvidences(actionId: number) {
		const evidences = this.sql`
			SELECT id, key, created_at FROM web_detective_evidences
			WHERE web_detective_action_id = ${actionId}
			ORDER BY created_at ASC
		`;
		return evidences.map((evidence) => ({
			id: evidence.id,
			key: evidence.key,
			createdAt: evidence.created_at,
		}));
	}
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname.startsWith("/evidence/")) {
			const key = url.pathname.slice(1);
			const file = await env.FILES.get(key);
			if (file) {
				return new Response(file.body, {
					headers: {
						"Content-Type": file.httpMetadata?.contentType ?? "image/jpeg",
					},
				});
			}
			return new Response("Not found", { status: 404 });
		}

		return (
			(await routeAgentRequest(request, env)) ??
			new Response(null, { status: 404 })
		);
	},
} satisfies ExportedHandler<Env>;
