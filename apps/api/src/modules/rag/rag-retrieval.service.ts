import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AiService } from '../../core/ai/ai.service';
import { AiFeature, type DocumentCorpus } from '../../core/prisma/client';
import { CircuitBreakerService } from '../../core/resilience/circuit-breaker.service';
import { VECTOR_STORE, VECTOR_STORE_CIRCUIT_KEY, type VectorQueryHit, type VectorStore } from './vector-store';

export interface RagScope {
  organizationId: string | null;
  corpus: DocumentCorpus;
}

export const DEFAULT_TOP_K = 8;

/**
 * WO-35.4 — `retrieve()`, exactly the doc's own §4 shape. The
 * `organizationId`/`corpus` filter is applied INSIDE `VectorStore.query()`'s
 * own vector search, never as a post-filter here — see `PgVectorStore
 * .query()`'s own comment for why that distinction is the whole point of
 * this method existing rather than "fetch nearest N, then `.filter()`."
 *
 * Also this doc's own "Dry run before live" answer: called with no
 * generation step at all (`RagAdminController`'s query-test console), it is
 * the tool for tuning chunk size/overlap before trusting an answer built on
 * top of it.
 */
@Injectable()
export class RagRetrievalService {
  private readonly logger = new Logger(RagRetrievalService.name);

  constructor(
    private readonly ai: AiService,
    @Inject(VECTOR_STORE) private readonly vectorStore: VectorStore,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  /** For a screen to check before rendering a query box at all — the doc's own "absent collaborator" rule. */
  isAvailable(): boolean {
    return this.ai.isAvailable('embed');
  }

  /**
   * Degrades to `ServiceUnavailableException` (never a bare 500, never a
   * silently empty result indistinguishable from "no matches") when the
   * embedding call fails — the doc's own §"Four hours down" / "Failure"
   * answer for this module: "unavailable, try again," one of the two
   * behaviors it names as acceptable. The other named alternative — a
   * keyword fallback over `DocumentSource.originalName` — is a real,
   * separate retrieval mode (title matching, not chunk-content matching)
   * that this work order does not also build; the doc frames the two as an
   * "or," and this is the simpler of the two, already this exact codebase's
   * own precedent for a direct, user-awaited AI action
   * (`SearchService.searchByImage()`'s identical throw on a failed
   * `describeImage`/`embed` call).
   */
  async retrieve(query: string, scope: RagScope, topK: number = DEFAULT_TOP_K): Promise<VectorQueryHit[]> {
    const embedded = await this.ai.embed(AiFeature.RAG_RETRIEVAL, [query]);
    if (!embedded) {
      throw new ServiceUnavailableException('Retrieval is not available right now — try again shortly.');
    }
    try {
      // 38-resilience-engineering.md §2, WO-38.2.
      return await this.circuitBreaker.execute(VECTOR_STORE_CIRCUIT_KEY, () =>
        this.vectorStore.query(embedded.vectors[0], scope, topK),
      );
    } catch (error) {
      // L16 (security review) — a vector-store failure (a bad connection, a
      // query timeout) must degrade the same documented way every other
      // retrieval failure mode already does, never surface as a raw 500.
      this.logger.error(`Vector store query failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException('Retrieval is not available right now — try again shortly.');
    }
  }
}
