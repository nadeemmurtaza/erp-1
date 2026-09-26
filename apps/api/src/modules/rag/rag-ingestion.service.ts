import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../core/prisma/prisma.service';
import { StorageService } from '../../core/storage/storage.service';
import { AiService } from '../../core/ai/ai.service';
import { AiFeature } from '../../core/prisma/client';
import { PdfExtractionService } from './pdf-extraction.service';
import { chunkPages } from './chunking';
import { VECTOR_STORE, type DocumentChunkInput, type VectorStore } from './vector-store';

/** How many chunks go into one `AiService.embed()` call — batched (WO-35.2's own words), never one call per chunk. */
const EMBED_BATCH_SIZE = 32;
/** How many QUEUED sources one cron tick processes — bounded so a huge backlog never turns one tick into an hour-long job blocking the next tick's own work. */
export const INGESTION_BATCH_SIZE = 5;

/**
 * WO-35.2's own pipeline: extract -> chunk -> embed (batched) -> upsert ->
 * READY. Every step after "a `DocumentSource` row exists" runs here, off
 * the request path — `RagIngestionCron` is the only caller in this
 * codebase, following `finance.cron.ts`'s exact "nothing here runs
 * synchronously in a request path" shape (`09-ai-layer.md`'s own latency
 * rule, applied to ingestion).
 *
 * Failure handling (the doc's own "failure path" lens): an extraction
 * failure (corrupted PDF) sets FAILED with a `failureReason`, visible on the
 * admin queue with a manual retry. An `AiProvider` outage during embedding
 * — `AiService.embed()` returning `null` — leaves the source QUEUED for the
 * next cron pass rather than FAILED, and writes NOTHING to `DocumentChunk`:
 * embeddings for every chunk are computed and validated in full BEFORE the
 * one atomic swap (`VectorStore.upsertChunks()`), so a mid-batch outage
 * never leaves some chunks embedded and others silently missing.
 */
@Injectable()
export class RagIngestionService {
  private readonly logger = new Logger(RagIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ai: AiService,
    private readonly extraction: PdfExtractionService,
    @Inject(VECTOR_STORE) private readonly vectorStore: VectorStore,
  ) {}

  /** Picks up to `batchSize` QUEUED sources, oldest first, and ingests each in turn. */
  async processQueued(batchSize: number = INGESTION_BATCH_SIZE): Promise<{ processed: number; succeeded: number; failed: number }> {
    if (!this.ai.isAvailable('embed')) {
      // The doc's own "absent collaborator" rule: with no embedding-capable
      // AiProvider configured, ingestion never starts — a QUEUED backlog
      // simply waits, exactly like WO-9.5's `embedPendingTranslations()`.
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    const sources = await this.prisma.documentSource.findMany({
      where: { status: 'QUEUED' },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    });

    let succeeded = 0;
    let failed = 0;
    for (const source of sources) {
      const ok = await this.ingestOne(source.id);
      if (ok) succeeded += 1;
      else failed += 1;
    }
    return { processed: sources.length, succeeded, failed };
  }

  /** Returns `true` on READY, `false` on FAILED or a no-op (already past QUEUED, or an embedding-provider outage that left it QUEUED again). */
  async ingestOne(sourceId: string): Promise<boolean> {
    const source = await this.prisma.documentSource.findUnique({ where: { id: sourceId } });
    if (!source || source.status !== 'QUEUED') return false;

    try {
      await this.prisma.documentSource.update({ where: { id: sourceId }, data: { status: 'EXTRACTING' } });
      const buffer = await this.fetchSourceBytes(source.storageKey);
      const extracted = await this.extraction.extract(buffer);

      await this.prisma.documentSource.update({ where: { id: sourceId }, data: { status: 'CHUNKING' } });
      const textChunks = chunkPages(extracted.pages);

      await this.prisma.documentSource.update({ where: { id: sourceId }, data: { status: 'EMBEDDING' } });
      const embedded = await this.embedAll(textChunks.map((c) => c.text));
      if (embedded === null) {
        // AiProvider outage/budget exhaustion mid-embedding: revert to
        // QUEUED for the next cron pass rather than FAILED — this is a
        // retryable condition, not a defect in the document itself (the
        // doc's own §"The failure path").
        await this.prisma.documentSource.update({ where: { id: sourceId }, data: { status: 'QUEUED' } });
        return false;
      }

      const chunkInputs: DocumentChunkInput[] = textChunks.map((chunk, index) => ({
        id: `${sourceId}-${randomBytes(6).toString('hex')}`,
        sourceId,
        organizationId: source.organizationId,
        corpus: source.corpus,
        pageFrom: chunk.pageFrom,
        pageTo: chunk.pageTo,
        text: chunk.text,
        embedding: embedded[index],
      }));

      // The one atomic swap — everything up to here was read-only or an AI
      // call; nothing about `DocumentChunk` changes until every embedding
      // for this source has already succeeded.
      await this.vectorStore.upsertChunks(chunkInputs);

      await this.prisma.documentSource.update({
        where: { id: sourceId },
        data: { status: 'READY', pageCount: extracted.pageCount, ingestedAt: new Date(), failureReason: null },
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Ingestion failed for DocumentSource ${sourceId}: ${message}`);
      await this.prisma.documentSource.update({
        where: { id: sourceId },
        data: { status: 'FAILED', failureReason: message.slice(0, 500) },
      });
      return false;
    }
  }

  /** `null` the moment any batch comes back empty (no provider, budget exhausted, timeout, vendor error) — `AiService.embed()`'s own contract, propagated rather than partially applied. */
  private async embedAll(texts: string[]): Promise<number[][] | null> {
    if (texts.length === 0) return [];

    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
      const batch = texts.slice(start, start + EMBED_BATCH_SIZE);
      const result = await this.ai.embed(AiFeature.RAG_INGESTION, batch);
      if (!result) return null;
      vectors.push(...result.vectors);
    }
    return vectors;
  }

  /**
   * Reads the uploaded file back through its own public URL — the same
   * "give me a URL, fetch it" shape `AiProvider.describeImage()` already
   * requires (`storage.driver.ts`'s own doc comment), rather than a second,
   * driver-specific "read raw bytes" method `StorageDriver` does not
   * otherwise need (nothing else in this codebase reads a stored file back
   * into the API process; every other consumer only ever writes one or
   * hands its URL to a browser or an external API).
   */
  private async fetchSourceBytes(storageKey: string): Promise<Buffer> {
    const url = this.storage.urlFor(storageKey);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Could not read the stored file back (${response.status} ${response.statusText}) from ${url}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
}
