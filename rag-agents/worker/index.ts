import { AIChatAgent } from "@cloudflare/ai-chat";
import { callable, getAgentByName, routeAgentRequest } from "agents";
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

export type DocumentInfo = {
	source: string;
	originalName: string;
	chunkCount: number;
	createdAt: number;
};

export type IngestResult =
	| { status: "ingested"; source: string; originalName: string; chunkCount: number }
	| { status: "already_exists"; source: string; originalName: string; chunkCount: number };

async function hashBuffer(buffer: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", buffer);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export class RAGAgent extends AIChatAgent<Env> {
	embedder() {
		return createWorkersAI({ binding: this.env.AI }).textEmbeddingModel(
			"@cf/baai/bge-base-en-v1.5",
		);
	}

	onStart() {
		void this
			.sql`CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, source TEXT NOT NULL, text TEXT NOT NULL);`;
		void this.sql`
			CREATE TABLE IF NOT EXISTS documents (
				source TEXT PRIMARY KEY,
				original_name TEXT NOT NULL,
				content_hash TEXT NOT NULL UNIQUE,
				chunk_count INTEGER NOT NULL,
				created_at INTEGER NOT NULL
			);
		`;

		// Backfill document rows for chunks ingested before the documents table existed.
		const orphans = this.sql<{ source: string; chunk_count: number }>`
			SELECT source, COUNT(*) AS chunk_count
			FROM chunks
			WHERE source NOT IN (SELECT source FROM documents)
			GROUP BY source
		`;
		for (const orphan of orphans) {
			const dash = orphan.source.indexOf("-");
			const originalName =
				dash >= 0 ? orphan.source.slice(dash + 1) : orphan.source;
			void this.sql`
				INSERT OR IGNORE INTO documents (source, original_name, content_hash, chunk_count, created_at)
				VALUES (
					${orphan.source},
					${originalName},
					${`legacy:${orphan.source}`},
					${orphan.chunk_count},
					${Date.now()}
				)
			`;
		}
	}

	async convert(fileName: string, buffer: ArrayBuffer, fileType: string) {
		const result = await this.env.AI.toMarkdown({
			name: fileName,
			blob: new Blob([buffer], { type: fileType }),
		});
		if (result.format === "error") throw new Error(result.error);
		return result.data;
	}

	splitMarkdown(text: string, size = 500, overlap = 50): string[] {
		const chunks: string[] = [];
		if (!text.trim()) return chunks;
		let start = 0;
		while (start < text.length) {
			let end = Math.min(start + size, text.length);
			// 마지막 chunk가 아니면, size 근처에서 공백/개행으로 끊기
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
		const { embeddings } = await embedMany({
			model: this.embedder(),
			values: chunks,
		});
		return embeddings;
	}

	async ingestPdf(
		buffer: ArrayBuffer,
		originalName: string,
		fileType: string,
	): Promise<IngestResult> {
		const contentHash = await hashBuffer(buffer);
		const [existing] = this.sql<{
			source: string;
			original_name: string;
			chunk_count: number;
		}>`SELECT source, original_name, chunk_count FROM documents WHERE content_hash = ${contentHash}`;

		if (existing) {
			return {
				status: "already_exists",
				source: existing.source,
				originalName: existing.original_name,
				chunkCount: existing.chunk_count,
			};
		}

		const source = `${Date.now()}-${originalName}`;
		await this.env.FILES.put(source, buffer, {
			httpMetadata: {
				contentType: fileType,
			},
		});

		const markdown = await this.convert(originalName, buffer, fileType);
		const chunks = this.splitMarkdown(markdown, 500, 50);
		const embeddings = await this.embedChunks(chunks);

		const vectors = chunks.map((chunk, index) => {
			const id = crypto.randomUUID();
			void this
				.sql`INSERT INTO chunks (id, source, text) VALUES (${id}, ${source}, ${chunk})`;
			return { id, values: embeddings[index], metadata: { source } };
		});
		await this.env.VECTORIZE.upsert(vectors);

		void this.sql`
			INSERT INTO documents (source, original_name, content_hash, chunk_count, created_at)
			VALUES (${source}, ${originalName}, ${contentHash}, ${chunks.length}, ${Date.now()})
		`;

		return {
			status: "ingested",
			source,
			originalName,
			chunkCount: chunks.length,
		};
	}

	@callable()
	listDocuments(): DocumentInfo[] {
		const rows = this.sql<{
			source: string;
			original_name: string;
			chunk_count: number;
			created_at: number;
		}>`
			SELECT source, original_name, chunk_count, created_at
			FROM documents
			ORDER BY created_at DESC
		`;

		return rows.map((row) => ({
			source: row.source,
			originalName: row.original_name,
			chunkCount: row.chunk_count,
			createdAt: row.created_at,
		}));
	}

	@callable()
	async deleteDocument(source: string): Promise<{ ok: true }> {
		const ids = this.sql<{ id: string }>`
			SELECT id FROM chunks WHERE source = ${source}
		`.map((row) => row.id);

		const batchSize = 1000;
		for (let i = 0; i < ids.length; i += batchSize) {
			await this.env.VECTORIZE.deleteByIds(ids.slice(i, i + batchSize));
		}

		void this.sql`DELETE FROM chunks WHERE source = ${source}`;
		void this.sql`DELETE FROM documents WHERE source = ${source}`;
		await this.env.FILES.delete(source);

		return { ok: true };
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
			system:
				"You answer questions using ingested documents. Use `recall` to loop up information before answering questions about ingested content.",
			messages: await convertToModelMessages(this.messages),
			tools: {
				recall: tool({
					description:
						"Search ingested documents for chunks relevant to a query. Call this before answering questions about previously-saved content.",
					inputSchema: z.object({
						query: z.string().meta({
							description: "What to look up.",
						}),
					}),
					execute: async ({ query }) => {
						const { embedding } = await embed({
							model: this.embedder(),
							value: query,
						});
						const { matches } = await this.env.VECTORIZE.query(embedding, {
							topK: 5,
						});
						return matches.map((match) => {
							const [result] = this
								.sql`SELECT * FROM chunks WHERE id = ${match.id}`;
							return result;
						});
					},
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
		const url = new URL(request.url);
		if (url.pathname === "/api/upload") {
			const formData = await request.formData();
			const file = formData.get("file") as File;
			const buffer = await file.arrayBuffer();
			const stub = await getAgentByName(env.RAGAgent, "default");
			const result = await stub.ingestPdf(buffer, file.name, file.type);
			return Response.json(result);
		}
		return (
			(await routeAgentRequest(request, env)) ??
			new Response(null, { status: 404 })
		);
	},
} satisfies ExportedHandler<Env>;
