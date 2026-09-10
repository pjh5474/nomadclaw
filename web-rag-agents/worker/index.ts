import { AIChatAgent } from "@cloudflare/ai-chat";
import { callable, routeAgentRequest } from "agents";
import {
	convertToModelMessages,
	createUIMessageStreamResponse,
	embed,
	embedMany,
	isLoopFinished,
	streamText,
	tool,
	toUIMessageStream,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import z from "zod";

export type SourceInfo = {
	url: string;
	title: string;
	chunkCount: number;
	createdAt: number;
};

function extractTitle(markdown: string, url: string): string {
	const frontmatter = markdown.match(/^---\s*\n([\s\S]*?)\n---/);
	if (frontmatter) {
		const titleLine = frontmatter[1].match(/^title:\s*["']?(.+?)["']?\s*$/m);
		if (titleLine?.[1]) return titleLine[1].trim();
	}
	const heading = markdown.match(/^#\s+(.+)$/m);
	if (heading?.[1]) return heading[1].trim();
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

export class RAGAgent extends AIChatAgent<Env> {
	embedder() {
		return createWorkersAI({ binding: this.env.AI }).textEmbeddingModel(
			"@cf/baai/bge-base-en-v1.5",
		);
	}

	onStart() {
		void this.sql`
			CREATE TABLE IF NOT EXISTS chunks (
				id TEXT PRIMARY KEY,
				source TEXT NOT NULL,
				text TEXT NOT NULL
			);
		`;
		void this.sql`
			CREATE TABLE IF NOT EXISTS sources (
				url TEXT PRIMARY KEY,
				title TEXT NOT NULL,
				chunk_count INTEGER NOT NULL,
				created_at INTEGER NOT NULL
			);
		`;
	}

	splitMarkdown(text: string, size = 800, overlap = 80): string[] {
		const chunks: string[] = [];
		if (!text.trim()) return chunks;
		let start = 0;
		while (start < text.length) {
			let end = Math.min(start + size, text.length);
			if (end < text.length) {
				const slice = text.slice(start, end);
				const breakAt = Math.max(
					slice.lastIndexOf("\n\n"),
					slice.lastIndexOf("\n"),
					slice.lastIndexOf(" "),
				);
				if (breakAt > size * 0.5) end = start + breakAt;
			}
			const chunk = text.slice(start, end).trim();
			if (chunk) chunks.push(chunk);
			if (end >= text.length) break;
			start = Math.max(0, end - overlap);
		}
		return chunks;
	}

	async embedChunks(chunks: string[]) {
		const embeddings: number[][] = [];
		const batchSize = 50;
		for (let i = 0; i < chunks.length; i += batchSize) {
			const batch = chunks.slice(i, i + batchSize);
			const { embeddings: batchEmbeddings } = await embedMany({
				model: this.embedder(),
				values: batch,
			});
			embeddings.push(...batchEmbeddings);
		}
		return embeddings;
	}

	async fetchMarkdown(url: string): Promise<{ markdown: string; title: string }> {
		if (!this.env.ACCOUNT_ID?.trim() || !this.env.API_TOKEN?.trim()) {
			throw new Error(
				"Missing ACCOUNT_ID or API_TOKEN. Set them with `wrangler secret put ACCOUNT_ID` and `wrangler secret put API_TOKEN` (local: .dev.vars).",
			);
		}

		const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.env.ACCOUNT_ID}/browser-rendering/markdown`;
		let response: Response;
		try {
			response = await fetch(endpoint, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.env.API_TOKEN}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ url }),
			});
		} catch (error) {
			throw new Error(
				`Network error calling Browser Rendering /markdown: ${errorMessage(error)}`,
			);
		}

		const rawBody = await response.text();
		let data: {
			success?: boolean;
			result?: string;
			meta?: { title?: string };
			errors?: { code?: number; message: string }[];
		} = {};
		try {
			data = JSON.parse(rawBody) as typeof data;
		} catch {
			throw new Error(
				`Browser Rendering /markdown returned non-JSON (HTTP ${response.status}): ${rawBody.slice(0, 500)}`,
			);
		}

		if (!response.ok || !data.success || typeof data.result !== "string") {
			const apiError = data.errors
				?.map((e) => `${e.code ?? "?"}: ${e.message}`)
				.join("; ");
			throw new Error(
				apiError ||
					`Browser Rendering /markdown failed (HTTP ${response.status}): ${rawBody.slice(0, 500)}`,
			);
		}

		return {
			markdown: data.result,
			title: data.meta?.title?.trim() || extractTitle(data.result, url),
		};
	}

	listSavedSources(): SourceInfo[] {
		const rows = this.sql<{
			url: string;
			title: string;
			chunk_count: number;
			created_at: number;
		}>`
			SELECT url, title, chunk_count, created_at
			FROM sources
			ORDER BY created_at DESC
		`;

		return rows.map((row) => ({
			url: row.url,
			title: row.title,
			chunkCount: row.chunk_count,
			createdAt: row.created_at,
		}));
	}

	async removeSource(url: string): Promise<{ ok: true; deletedChunks: number }> {
		const ids = this.sql<{ id: string }>`
			SELECT id FROM chunks WHERE source = ${url}
		`.map((row) => row.id);

		const batchSize = 1000;
		for (let i = 0; i < ids.length; i += batchSize) {
			await this.env.VECTORIZE.deleteByIds(ids.slice(i, i + batchSize));
		}

		void this.sql`DELETE FROM chunks WHERE source = ${url}`;
		void this.sql`DELETE FROM sources WHERE url = ${url}`;

		return { ok: true, deletedChunks: ids.length };
	}

	@callable()
	getSources(): SourceInfo[] {
		return this.listSavedSources();
	}

	@callable()
	async deleteSource(url: string): Promise<{ ok: true; deletedChunks: number }> {
		return this.removeSource(url);
	}

	async onChatMessage(
		_onFinish: unknown,
		options?: {
			abortSignal?: AbortSignal;
		},
	) {
		const workersAi = createWorkersAI({ binding: this.env.AI });

		const result = streamText({
			model: workersAi("@cf/zai-org/glm-4.7-flash"),
			system: `You are a second brain that remembers web pages the user shares.

When the user pastes a URL (or asks you to save/remember a page), call \`saveUrl\` to fetch and store it.
When the user asks a question about saved content, call \`recall\` before answering.
When the user asks what you've saved, call \`listSources\`.
When the user asks to forget/delete a page, call \`deleteSource\` with that URL.

Always ground answers in recalled chunks.
After every answer that uses recalled content, end with a "Sources:" section that lists each cited page as a full URL on its own line (use the \`sourceUrl\` field from recall results). Never omit source URLs.
If recall returns nothing relevant, say you don't have that information saved yet.
If \`saveUrl\` returns status "error", show the exact error message and step to the user so they can debug (do not hide it).`,
			messages: await convertToModelMessages(this.messages),
			tools: {
				saveUrl: tool({
					description:
						"Fetch a web page via Cloudflare Browser Rendering /markdown, chunk it (~800 chars), embed, and store it in Vectorize + SQL for later recall. On failure returns status=error with step and message.",
					inputSchema: z.object({
						url: z.url().meta({
							description: "Absolute https URL of the page to remember.",
						}),
					}),
					execute: async ({ url }) => {
						let step:
							| "check_existing"
							| "fetch_markdown"
							| "chunk"
							| "embed"
							| "upsert_vectorize"
							| "insert_sql" = "check_existing";

						try {
							const [existing] = this.sql<{
								url: string;
								title: string;
								chunk_count: number;
							}>`SELECT url, title, chunk_count FROM sources WHERE url = ${url}`;

							if (existing) {
								return {
									status: "already_exists" as const,
									url: existing.url,
									title: existing.title,
									chunkCount: existing.chunk_count,
								};
							}

							step = "fetch_markdown";
							const { markdown, title } = await this.fetchMarkdown(url);

							step = "chunk";
							const chunks = this.splitMarkdown(markdown, 800, 80);
							if (chunks.length === 0) {
								return {
									status: "empty" as const,
									url,
									title,
									message: "Page produced no usable markdown text.",
								};
							}

							step = "embed";
							const embeddings = await this.embedChunks(chunks);
							const vectors = chunks.map((chunk, index) => {
								const id = crypto.randomUUID();
								void this.sql`
									INSERT INTO chunks (id, source, text)
									VALUES (${id}, ${url}, ${chunk})
								`;
								return {
									id,
									values: embeddings[index],
									metadata: { source: url },
								};
							});

							step = "upsert_vectorize";
							await this.env.VECTORIZE.upsert(vectors);

							step = "insert_sql";
							void this.sql`
								INSERT INTO sources (url, title, chunk_count, created_at)
								VALUES (${url}, ${title}, ${chunks.length}, ${Date.now()})
							`;

							return {
								status: "saved" as const,
								url,
								title,
								chunkCount: chunks.length,
							};
						} catch (error) {
							console.error("saveUrl failed", { url, step, error });
							return {
								status: "error" as const,
								url,
								step,
								message: errorMessage(error),
							};
						}
					},
				}),

				recall: tool({
					description:
						"Search remembered pages for chunks relevant to a question. Call this before answering questions about saved content. Each result includes sourceUrl — cite those URLs in your answer.",
					inputSchema: z.object({
						question: z.string().meta({
							description: "The question to look up in saved pages.",
						}),
					}),
					execute: async ({ question }) => {
						const { embedding } = await embed({
							model: this.embedder(),
							value: question,
						});
						const { matches } = await this.env.VECTORIZE.query(embedding, {
							topK: 5,
						});

						return matches
							.map((match) => {
								const [row] = this.sql<{
									id: string;
									source: string;
									text: string;
									title: string | null;
								}>`
									SELECT c.id, c.source, c.text, s.title
									FROM chunks c
									LEFT JOIN sources s ON s.url = c.source
									WHERE c.id = ${match.id}
								`;

								if (!row?.text || !row.source) return null;

								return {
									id: match.id,
									score: match.score,
									sourceUrl: row.source,
									title: row.title ?? row.source,
									text: row.text,
								};
							})
							.filter((item) => item != null);
					},
				}),

				listSources: tool({
					description:
						"List all remembered page URLs with their titles and save times.",
					inputSchema: z.object({}),
					execute: async () => {
						return this.listSavedSources().map((source) => ({
							url: source.url,
							title: source.title,
							chunkCount: source.chunkCount,
							savedAt: new Date(source.createdAt).toISOString(),
						}));
					},
				}),

				deleteSource: tool({
					description:
						"Delete a remembered page by URL. Removes its chunks from SQL and Vectorize.",
					inputSchema: z.object({
						url: z.url().meta({
							description: "The saved page URL to delete.",
						}),
					}),
					execute: async ({ url }) => this.removeSource(url),
				}),
			},
			abortSignal: options?.abortSignal,
			stopWhen: isLoopFinished(),
		});

		return createUIMessageStreamResponse({
			stream: toUIMessageStream({
				stream: result.stream,
				originalMessages: this.messages,
			}),
		});
	}
}

export default {
	async fetch(request, env) {
		return (
			(await routeAgentRequest(request, env)) ??
			new Response(null, { status: 404 })
		);
	},
} satisfies ExportedHandler<Env>;
