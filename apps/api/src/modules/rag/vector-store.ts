import type { DocumentCorpus } from '../../core/prisma/client';

/**
 * Extension point: vector similarity search (WO-35.3,
 * docs/implementation/ai-layer/35-scalable-rag-document-retrieval.md §2).
 * Same shape and same registration idiom as `StorageDriver` (core/storage) —
 * `RagModule` binds this token to `PgVectorStore`, the only implementation
 * today. The doc's own named escalation trigger (a single deployment's
 * `DocumentChunk` table past ~50M rows, or p95 retrieval latency past
 * 300ms) is, when it actually fires, a second class plus one changed
 * binding here — never a rewrite of ingestion, chunking or retrieval, which
 * call only this interface and never `PgVectorStore` directly (WO-35.7,
 * deferred until that trigger fires, is exactly and only that second
 * class).
 *
 * `upsertChunks`/`query` match the doc's own literal interface shape
 * (`docs/implementation/ai-layer/35-…md` §2); the one necessary
 * accommodation is representing a chunk's embedding as `number[]` rather
 * than the Prisma `DocumentChunk` model type itself — Prisma's
 * `Unsupported("vector(1536)")` column has no normal TypeScript field type
 * to reuse, so every caller already works with a plain array (see
 * `RagIngestionService`, `search.service.ts`'s identical `EmbeddingResult
 * .vectors`).
 */
export interface DocumentChunkInput {
  id: string;
  sourceId: string;
  organizationId: string | null;
  corpus: DocumentCorpus;
  pageFrom: number;
  pageTo: number;
  text: string;
  embedding: number[];
}

export interface VectorQueryFilter {
  /** `null` matches the Solo/Chain "no Organization tier" case — see rag.prisma's header. */
  organizationId: string | null;
  /** Omitted only by the future cross-corpus admin tooling this doc names as out of scope; every real caller sets it. */
  corpus?: DocumentCorpus;
}

export interface VectorQueryHit {
  id: string;
  sourceId: string;
  pageFrom: number;
  pageTo: number;
  text: string;
  /** Cosine similarity, 1 = identical, -1 = opposite — same convention as `search.service.ts`'s own `vectorMatch()`. */
  score: number;
}

export interface VectorStore {
  /**
   * Replaces, atomically, whatever chunks this store already holds for
   * every distinct `sourceId` present in `chunks` — the doc's own §3
   * idempotent-re-ingestion rule ("old chunks deleted, new ones inserted,"
   * "in one transaction") lives here rather than in every caller, so a
   * caller only ever states the chunks a source should now have. Called
   * with zero chunks is a no-op (never used to "clear" a source — that is
   * `RagCorpusService.deleteSource()`, which removes the `DocumentSource`
   * row itself and cascades).
   */
  upsertChunks(chunks: DocumentChunkInput[]): Promise<void>;
  /** Nearest `topK` chunks to `embedding`, `filter` applied as a predicate INSIDE the query — never a post-filter (WO-35.4's own non-negotiable). */
  query(embedding: number[], filter: VectorQueryFilter, topK: number): Promise<VectorQueryHit[]>;
}

export const VECTOR_STORE = Symbol('VECTOR_STORE');

/**
 * 38-resilience-engineering.md §2, WO-38.2 — the one `CircuitBreakerService`
 * key both `RagRetrievalService.retrieve()` and `RagIngestionService`'s own
 * `upsertChunks()` call wrap with, since every `VECTOR_STORE` binding today
 * is the same `PgVectorStore` (`rag.module.ts`) — one dependency, one
 * circuit, not one per caller.
 */
export const VECTOR_STORE_CIRCUIT_KEY = 'vector.store';
