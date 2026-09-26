import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../core/prisma/prisma.service';
import { StorageService } from '../../core/storage/storage.service';
import { AiService } from '../../core/ai/ai.service';
import { AiFeature } from '../../core/prisma/client';
import { PdfExtractionService } from './pdf-extraction.service';
import { chunkPages } from './chunking';
import { VECTOR_STORE, type DocumentChunkInput, type VectorStore } from './vector-store';
import { assertCorpusAccess } from './rag-corpus-access';

/** How many chunks go into one `AiService.embed()` call — batched (WO-35.2's own words), never one call per chunk. */
const EMBED_BATCH_SIZE = 32;
/** How many QUEUED sources one cron tick processes — bounded so a huge backlog never turns one tick into an hour-long job blocking the next tick's own work. */
export const INGESTION_BATCH_SIZE = 5;
/**
 * M7 (security review) — how long a claim (EXTRACTING/CHUNKING/EMBEDDING)
 * may sit with no progress before it is treated as abandoned by a crashed
 * worker, either by the cron's own reaper or by a manual
 * `RagCorpusService.retry()`. Exported so the two paths can never define
 * "stale" differently.
 */
export const STALE_CLAIM_MINUTES = 15;
/** M8 — a source that fails embedding this many times running is a deterministic failure (bad input, not a transient outage) and stops occupying every batch forever. */
const MAX_EMBED_ATTEMPTS = 5;
const IN_FLIGHT_STATUSES = ['EXTRACTING', 'CHUNKING', 'EMBEDDING'] as const;

/**
 * WO-35.2's own pipeline: extract -> chunk -> embed (batched) -> upsert ->
 * READY. Every step after "a `DocumentSource` row exists" runs here, off
 * the request path — `RagIngestionCron` is the only unattended caller in
 * this codebase (the admin `ingest-now` route is the other, manual one),
 * following `finance.cron.ts`'s exact "nothing here runs synchronously in a
 * request path" shape (`09-ai-layer.md`'s own latency rule, applied to
 * ingestion).
 *
 * Failure handling (the doc's own "failure path" lens): an extraction
 * failure (corrupted PDF) sets FAILED with a `failureReason`, visible on the
 * admin queue with a manual retry. An `AiProvider` outage during embedding
 * — `AiService.embed()` returning `null` — leaves the source QUEUED with an
 * exponential backoff (M8) for the next eligible cron pass rather than
 * FAILED, and writes NOTHING to `DocumentChunk`: embeddings for every chunk
 * are computed and validated in full BEFORE the one atomic swap
 * (`VectorStore.upsertChunks()`), so a mid-batch outage never leaves some
 * chunks embedded and others silently missing. A source that fails embedding
 * `MAX_EMBED_ATTEMPTS` times running is a deterministic failure, not a
 * transient one, and moves to FAILED instead of retrying forever.
 *
 * Claiming a source (M7, security review) is a single atomic
 * `updateMany({ where: { status: 'QUEUED' } })`, never read-then-write —
 * the cron and a manual `ingest-now` racing the same source can never both
 * pass a check and both run a full embedding pass. A claim that never
 * completes (a crashed worker) is reset back to QUEUED by
 * `reapStaleClaims()` after `STALE_CLAIM_MINUTES`, or by an operator's
 * manual retry — a reset source restarts the pipeline from scratch rather
 * than trying to resume mid-flight.
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

  /** Picks up to `batchSize` eligible QUEUED sources, oldest-eligible first, and ingests each in turn. */
  async processQueued(batchSize: number = INGESTION_BATCH_SIZE): Promise<{ processed: number; succeeded: number; failed: number }> {
    if (!this.ai.isAvailable('embed')) {
      // The doc's own "absent collaborator" rule: with no embedding-capable
      // AiProvider configured, ingestion never starts — a QUEUED backlog
      // simply waits, exactly like WO-9.5's `embedPendingTranslations()`.
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    const reaped = await this.reapStaleClaims();
    if (reaped > 0) {
      this.logger.warn(`Reaped ${reaped} stale ingestion claim(s), stuck for more than ${STALE_CLAIM_MINUTES} minutes, back to QUEUED.`);
    }

    const now = new Date();
    const sources = await this.prisma.documentSource.findMany({
      where: {
        status: 'QUEUED',
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      // Explicit nulls positioning (Prisma's stable `sort`/`nulls` orderBy
      // input, not the bare column default) rather than trusting Postgres's
      // own ASC-nulls-last default to happen to match what we want here —
      // a source with no `nextAttemptAt` at all (never backed off) is
      // exactly as eligible right now as one whose backoff already elapsed,
      // so both sort ahead of anything not yet eligible could not appear in
      // this query anyway; `createdAt` breaks ties oldest-first as before.
      orderBy: [{ nextAttemptAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
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

  /**
   * M7 — anything still EXTRACTING/CHUNKING/EMBEDDING whose claim is older
   * than `STALE_CLAIM_MINUTES` is assumed abandoned by a crashed worker and
   * reset to QUEUED (claim cleared) so the next pass picks it back up from
   * scratch. Runs at the start of every `processQueued()` tick, before new
   * work is selected, so a reaped source is immediately eligible again.
   */
  private async reapStaleClaims(): Promise<number> {
    const staleBefore = new Date(Date.now() - STALE_CLAIM_MINUTES * 60_000);
    const result = await this.prisma.documentSource.updateMany({
      where: { status: { in: [...IN_FLIGHT_STATUSES] }, claimedAt: { lt: staleBefore } },
      data: { status: 'QUEUED', claimedAt: null },
    });
    return result.count;
  }

  /**
   * Returns `true` on READY, `false` on FAILED or a no-op — already claimed
   * by another caller (the atomic claim below lost the race), an
   * embedding-provider outage that requeued it, or `permissions` may not
   * reach this source's corpus.
   *
   * `permissions` is set only by the manual `ingest-now` HTTP route (H1,
   * security review) — the cron's own call omits it, since the cron acts as
   * the system rather than on behalf of any one user and processes every
   * QUEUED source impartially. When set, the check runs against a read-only
   * lookup BEFORE the atomic claim below, so an unauthorized caller never
   * causes this source to be claimed (and so blocked from a legitimate
   * caller) even transiently.
   */
  async ingestOne(sourceId: string, permissions?: readonly string[]): Promise<boolean> {
    if (permissions) {
      const check = await this.prisma.documentSource.findUnique({ where: { id: sourceId }, select: { corpus: true } });
      if (!check) return false;
      assertCorpusAccess(permissions, check.corpus);
    }

    // M7 — atomic claim: a single compare-and-set, not read-then-write.
    const claim = await this.prisma.documentSource.updateMany({
      where: { id: sourceId, status: 'QUEUED' },
      data: { status: 'EXTRACTING', claimedAt: new Date() },
    });
    if (claim.count !== 1) return false;
    const source = await this.prisma.documentSource.findUniqueOrThrow({ where: { id: sourceId } });

    try {
      const buffer = await this.fetchSourceBytes(source.storageKey);
      const extracted = await this.extraction.extract(buffer);

      await this.prisma.documentSource.update({ where: { id: sourceId }, data: { status: 'CHUNKING' } });
      const textChunks = chunkPages(extracted.pages);

      await this.prisma.documentSource.update({ where: { id: sourceId }, data: { status: 'EMBEDDING' } });
      const embedded = await this.embedAll(textChunks.map((c) => c.text));
      if (embedded === null) {
        // AiProvider outage/budget exhaustion mid-embedding: back off and
        // requeue for a later cron pass rather than FAILED — this is a
        // retryable condition, not a defect in the document itself (the
        // doc's own §"The failure path"), unless it has now happened
        // `MAX_EMBED_ATTEMPTS` times running, at which point it stops
        // looking transient (M8).
        await this.requeueAfterEmbedFailure(sourceId, source.attempts);
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
        data: {
          status: 'READY',
          pageCount: extracted.pageCount,
          ingestedAt: new Date(),
          failureReason: null,
          attempts: 0,
          nextAttemptAt: null,
        },
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Ingestion failed for DocumentSource ${sourceId}: ${message}`);
      await this.prisma.documentSource.update({
        where: { id: sourceId },
        data: { status: 'FAILED', failureReason: sanitizeFailureMessage(message), claimedAt: null },
      });
      return false;
    }
  }

  /**
   * M8 — exponential backoff (capped at 24h), and a hard ceiling on total
   * attempts past which a persistently-broken document (a deterministic
   * vendor 4xx, not a transient outage) stops being retried automatically
   * and moves to FAILED like any other unrecoverable ingestion error.
   */
  private async requeueAfterEmbedFailure(sourceId: string, previousAttempts: number): Promise<void> {
    const attempts = previousAttempts + 1;
    if (attempts > MAX_EMBED_ATTEMPTS) {
      await this.prisma.documentSource.update({
        where: { id: sourceId },
        data: { status: 'FAILED', failureReason: 'Exceeded maximum embedding retry attempts.', attempts, claimedAt: null },
      });
      return;
    }
    const backoffMinutes = Math.min(5 * 2 ** attempts, 1440);
    await this.prisma.documentSource.update({
      where: { id: sourceId },
      data: { status: 'QUEUED', attempts, nextAttemptAt: new Date(Date.now() + backoffMinutes * 60_000), claimedAt: null },
    });
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
   * H2 (security review) — reads the stored file's bytes directly. This is
   * never meant to be a publicly-fetchable object: the only reader is this
   * process itself, unlike an OCR scratch image (`PdfExtractionService
   * .ocrPage()`), which genuinely has to hand an external vision API a URL
   * it can fetch.
   */
  private async fetchSourceBytes(storageKey: string): Promise<Buffer> {
    return this.storage.get(storageKey);
  }
}

/**
 * L15 (security review) — a raw internal error can carry a storage URL or an
 * absolute filesystem path; neither belongs in `failureReason`, which is
 * returned verbatim by the admin sources API. The original, unredacted
 * message is still logged server-side above, for an operator who actually
 * needs it.
 */
function sanitizeFailureMessage(message: string): string {
  return message
    .replace(/https?:\/\/\S+/gi, '[url removed]')
    .replace(/(?:[A-Za-z]:)?[/\\][^\s"']+/g, '[path removed]')
    .slice(0, 500);
}
