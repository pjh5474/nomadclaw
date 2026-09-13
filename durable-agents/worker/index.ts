import {
	Agent,
	callable,
	routeAgentRequest,
	type FiberRecoveryContext,
} from "agents";
import { generateText } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import type { NovelState } from "./types";

const TOTAL_CHAPTERS = 5;

export class NovelistAgent extends Agent<Env, NovelState> {
	initialState: NovelState = {
		premise: "",
		status: "idle",
		totalChapters: TOTAL_CHAPTERS,
		currentChapter: 0,
		chapters: [],
	};

	async wrtieChapters() {
		const workersai = createWorkersAI({ binding: this.env.AI });
		const model = workersai("@cf/meta/llama-4-scout-17b-16e-instruct");

		await this.runFiber("write-novel", async () => {
			while (this.state.currentChapter <= TOTAL_CHAPTERS) {
				const i = this.state.currentChapter;
				const previousChapters = this.state.chapters
					.map((chapter, index) => `Chapter ${index + 1}:\n${chapter}`)
					.join("\n\n");

				const { text } = await generateText({
					model,
					prompt: `
          You are writing a 5-chapter novel about: ${this.state.premise}
  
          Previous chapters: ${previousChapters}
  
          Write Chapter ${i} in around 150 words. Just the prose — no chapter title, no "Chapter X" header.`,
				});

				this.setState({
					...this.state,
					chapters: [...this.state.chapters, text.trim()],
					currentChapter: i + 1,
				});
			}

			this.setState({ ...this.state, status: "done" });
		});
	}

	@callable()
	async startNovel(premise: string) {
		this.setState({
			premise,
			status: "writing",
			totalChapters: TOTAL_CHAPTERS,
			currentChapter: 1,
			chapters: [],
		});

		await this.wrtieChapters();
	}

	@callable()
	async resetNovel() {
		this.setState(this.initialState);
	}

	async onFiberRecovered(ctx: FiberRecoveryContext) {
		if (ctx.name === "write-novel") {
			await this.wrtieChapters();
		}
	}
}

export default {
	async fetch(request, env) {
		return (
			(await routeAgentRequest(request, env)) ??
			new Response("Not found", { status: 404 })
		);
	},
} satisfies ExportedHandler<Env>;
