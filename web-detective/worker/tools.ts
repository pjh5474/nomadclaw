import { tool } from "ai";
import { z } from "zod";
import { type Page } from "@cloudflare/puppeteer";
import { READ_PAGE_SCRIPT } from "./prompt.ts";
import type { WebDetectiveState } from "./index.ts";

const MAX_HOPS = 5;

type ReadPageResult = {
	text: string;
	links: { text: string; href: string }[];
};

type StateAccess = {
	getState: () => WebDetectiveState;
	setState: (partial: Partial<WebDetectiveState>) => void;
};

export function readPage(getPage: () => Promise<Page>) {
	return tool({
		title: "readPage",
		description:
			"Read the current page and return visible text plus all links ({ text, href }[]) so you can choose the next hop.",
		inputSchema: z.object({}),
		execute: async (): Promise<ReadPageResult> => {
			const page = await getPage();
			return (await page.evaluate(READ_PAGE_SCRIPT)) as ReadPageResult;
		},
	});
}

export function createFollowLink(
	getPage: () => Promise<Page>,
	files: R2Bucket,
	stateAccess: StateAccess,
) {
	return tool({
		title: "followLink",
		description:
			"Navigate to an absolute https URL, save a JPEG screenshot to evidence storage, and update visit history. Max 5 hops per investigation.",
		inputSchema: z.object({
			href: z.url().meta({
				description: "Absolute URL to open (https://...)",
			}),
		}),
		execute: async ({ href }) => {
			const state = stateAccess.getState();
			const hops = state.urlVisitedHistory.length;

			if (hops >= MAX_HOPS) {
				return {
					ok: false as const,
					error: `Hop limit reached (${MAX_HOPS}). Stop navigating, report what you found (or that you could not find the answer), and call closeBrowser.`,
					hops,
					maxHops: MAX_HOPS,
					path: state.urlVisitedHistory,
				};
			}

			const page = await getPage();
			await page.goto(href, { waitUntil: "networkidle2", timeout: 30_000 });

			const buffer = await page.screenshot({ type: "jpeg" });
			const key = `evidence/${Date.now()}.jpeg`;
			await files.put(key, buffer, {
				httpMetadata: { contentType: "image/jpeg" },
			});

			const nextHistory = [...state.urlVisitedHistory, href];
			const nextEvidences = [
				...state.evidences,
				{ key, createdAt: Date.now() },
			];

			stateAccess.setState({
				lastVisitedUrl: href,
				urlVisitedHistory: nextHistory,
				evidences: nextEvidences,
			});

			return {
				ok: true as const,
				href,
				title: await page.title(),
				filename: key,
				hops: nextHistory.length,
				maxHops: MAX_HOPS,
				remainingHops: MAX_HOPS - nextHistory.length,
			};
		},
	});
}

export function createScreenshot(
	getPage: () => Promise<Page>,
	files: R2Bucket,
	stateAccess: StateAccess,
) {
	return tool({
		title: "screenshot",
		description: "Capture the current page as JPEG evidence in R2.",
		inputSchema: z.object({}),
		execute: async () => {
			const page = await getPage();
			const buffer = await page.screenshot({ type: "jpeg" });
			const key = `evidence/${Date.now()}.jpeg`;
			await files.put(key, buffer, {
				httpMetadata: { contentType: "image/jpeg" },
			});

			const state = stateAccess.getState();
			stateAccess.setState({
				evidences: [...state.evidences, { key, createdAt: Date.now() }],
			});

			return { ok: true as const, filename: key };
		},
	});
}

export function createBrowserClose(closeBrowser: () => Promise<void>) {
	return tool({
		title: "closeBrowser",
		description:
			"Close the shared browser session when the investigation is finished. Call this EXACTLY ONCE after your final report. Do not call it again.",
		inputSchema: z.object({}),
		execute: async () => {
			await closeBrowser();
			return {
				ok: true as const,
				message: "Browser closed. Investigation complete — stop now.",
				done: true as const,
			};
		},
	});
}
