import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { StorageService } from '../../core/storage/storage.service';
import { AuditService } from '../../core/audit/audit.service';
import { paginated, type PaginatedResult } from '../../core/common/dto/pagination.dto';
import type { DocumentCorpus, DocumentSource, IngestStatus } from '../../core/prisma/client';
import { assertCorpusAccess, visibleCorpora } from './rag-corpus-access';
import { STALE_CLAIM_MINUTES } from './rag-ingestion.service';

/** Statuses a stuck claim can be reaped or manually retried out of — M7. */
const STALE_CLAIM_STATUSES: readonly IngestStatus[] = ['EXTRACTING', 'CHUNKING', 'EMBEDDING'];

const ALLOWED_TYPE = 'application/pdf';

/** A `DocumentSource` with its storage key stripped — H2's own fix: `storageKey` never reaches an HTTP response, only this service's own internal reads (`deleteSource`, `getSourceFile`, ingestion). */
export type PublicDocumentSource = Omit<DocumentSource, 'storageKey'>;

export function toPublicSource(source: DocumentSource): PublicDocumentSource {
  const { storageKey: _storageKey, ...rest } = source;
  return rest;
}

export interface UploadedSourceFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

/**
 * WO-35.1/35.6 — `DocumentSource` administration: upload a document into a
 * corpus, list/inspect the ingestion queue, retry a `FAILED` one, remove a
 * source. Every method here is gated by `rag.ingest.manage`
 * (`RagAdminController`) — this service itself does not check permissions,
 * the same "controller enforces, service trusts its caller" split every
 * other admin service in this codebase already follows.
 *
 * Doc 28's own vault (`docs/implementation/hr-people-org/28-…md`,
 * `EMPLOYEE_DOCUMENTS`'s naming source) is unbuilt in this codebase today —
 * no `EmployeeDocument` model exists — so nothing here reads from or writes
 * to it; a source in that corpus is uploaded through this same screen like
 * any other, until doc 28 exists and can feed it automatically. Named, not
 * silently assumed: extending doc 28 to auto-ingest is that document's own
 * future work order, not this one's.
 */
@Injectable()
export class RagCorpusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async createSource(params: {
    file: UploadedSourceFile;
    corpus: DocumentCorpus;
    organizationId: string | null;
    uploadedById: string;
  }): Promise<DocumentSource> {
    if (params.file.mimetype !== ALLOWED_TYPE) {
      throw new BadRequestException('Only PDF documents are supported today (the doc\'s own "out of scope" — Word, HTML, scanned images with no PDF wrapper).');
    }

    const stored = await this.storage.putDocument({
      folder: 'rag-sources',
      filename: params.file.originalname,
      contentType: params.file.mimetype,
      body: params.file.buffer,
    });

    const source = await this.prisma.documentSource.create({
      data: {
        organizationId: params.organizationId,
        storageKey: stored.key,
        originalName: params.file.originalname,
        corpus: params.corpus,
        uploadedById: params.uploadedById,
        status: 'QUEUED',
      },
    });

    await this.audit.record({
      actorId: params.uploadedById,
      action: 'rag.source_uploaded',
      entity: 'DocumentSource',
      entityId: source.id,
      data: { corpus: params.corpus, originalName: params.file.originalname },
    });

    return source;
  }

  /**
   * H1's own list-filtering rule: a caller who names a corpus gets the
   * single-item check (`assertCorpusAccess`); a caller who does not gets the
   * query silently constrained to `visibleCorpora(permissions)` rather than
   * every corpus in the system — never a raw `WHERE true` a client's own
   * omitted filter would otherwise fall through to.
   */
  async list(
    query: {
      page: number;
      pageSize: number;
      corpus?: DocumentCorpus;
      status?: IngestStatus;
    },
    permissions: readonly string[],
  ): Promise<PaginatedResult<DocumentSource>> {
    let corpusFilter: DocumentCorpus | { in: DocumentCorpus[] };
    if (query.corpus) {
      assertCorpusAccess(permissions, query.corpus);
      corpusFilter = query.corpus;
    } else {
      corpusFilter = { in: visibleCorpora(permissions) };
    }

    const where = { corpus: corpusFilter, status: query.status };
    const [data, total] = await Promise.all([
      this.prisma.documentSource.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.documentSource.count({ where }),
    ]);
    return paginated(data, total, query);
  }

  /**
   * `permissions` omitted means an internal, system-acting caller (this
   * service's own other methods reading a row they already know they may
   * touch) — every HTTP-reachable caller always passes it, so the row's own
   * corpus is checked before its contents (or even its existence, for a
   * corpus a caller may not see at all) are confirmed to a client.
   */
  async findOne(id: string, permissions?: readonly string[]): Promise<DocumentSource> {
    const source = await this.prisma.documentSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Document source not found.');
    if (permissions) assertCorpusAccess(permissions, source.corpus);
    return source;
  }

  /** The original file's bytes, for the authenticated `/file` download route — the only path that ever reads `storageKey` back out of this service. */
  async getSourceFile(id: string, permissions: readonly string[]): Promise<{ source: DocumentSource; buffer: Buffer }> {
    const source = await this.findOne(id, permissions);
    const buffer = await this.storage.get(source.storageKey);
    return { source, buffer };
  }

  /** Chunk count for the admin screen's own "N chunks" column — a cheap count, never the chunks themselves. */
  async chunkCount(sourceId: string): Promise<number> {
    return this.prisma.documentChunk.count({ where: { sourceId } });
  }

  /**
   * Batched form of `chunkCount()` for a whole list page (L18, security
   * review) — one `groupBy` instead of one `COUNT` query per row. A source
   * missing from the result (no chunks at all, e.g. still QUEUED) is simply
   * absent from the map; callers default it to 0.
   */
  async chunkCounts(sourceIds: string[]): Promise<Record<string, number>> {
    if (sourceIds.length === 0) return {};
    const grouped = await this.prisma.documentChunk.groupBy({
      by: ['sourceId'],
      where: { sourceId: { in: sourceIds } },
      _count: true,
    });
    return Object.fromEntries(grouped.map((group) => [group.sourceId, group._count]));
  }

  /**
   * FAILED -> QUEUED, so the next cron pass picks it back up — the doc's
   * own "visible on an admin ingestion-queue screen with a manual retry."
   * Also accepts a source stuck in EXTRACTING/CHUNKING/EMBEDDING whose claim
   * is older than `STALE_CLAIM_MINUTES` (M7's own manual "unstick," for an
   * operator who does not want to wait for the reaper's own next cron tick)
   * — reusing the exact same threshold constant the cron reaper does, so the
   * two paths can never drift apart on what "stale" means. Refuses anything
   * else: retrying a READY document would silently re-run an expensive
   * embedding pass nobody asked for, and retrying a freshly-claimed in-flight
   * one would race whichever worker actually owns it.
   */
  async retry(id: string, actorId: string, permissions: readonly string[]): Promise<DocumentSource> {
    const source = await this.findOne(id, permissions);
    const isStaleClaim =
      STALE_CLAIM_STATUSES.includes(source.status) &&
      source.claimedAt !== null &&
      source.claimedAt.getTime() < Date.now() - STALE_CLAIM_MINUTES * 60_000;
    if (source.status !== 'FAILED' && !isStaleClaim) {
      throw new BadRequestException(
        `Only a FAILED source, or one stuck in-flight for more than ${STALE_CLAIM_MINUTES} minutes, can be retried (this one is ${source.status}).`,
      );
    }

    const updated = await this.prisma.documentSource.update({
      where: { id },
      data: { status: 'QUEUED', failureReason: null, attempts: 0, nextAttemptAt: null, claimedAt: null },
    });

    await this.audit.record({ actorId, action: 'rag.source_retried', entity: 'DocumentSource', entityId: id });
    return updated;
  }

  /**
   * L20 — an operator correcting a bad upload gets a real correction path,
   * not "delete then re-upload" (which doc 35 §3 rules out in spirit: the
   * doc wants old and new chunks to never coexist, which delete-then-recreate
   * already achieves, but at the cost of losing the row's own history for no
   * reason). The next ingestion pass's existing delete-then-insert in
   * `PgVectorStore.upsertChunks()` (keyed by `sourceId`) already removes the
   * stale chunks once the replacement is re-ingested — nothing new needed
   * there.
   */
  async replaceFile(id: string, params: { file: UploadedSourceFile; actorId: string; permissions: readonly string[] }): Promise<DocumentSource> {
    const source = await this.findOne(id, params.permissions);
    if (params.file.mimetype !== ALLOWED_TYPE) {
      throw new BadRequestException('Only PDF documents are supported today.');
    }

    const stored = await this.storage.putDocument({
      folder: 'rag-sources',
      filename: params.file.originalname,
      contentType: params.file.mimetype,
      body: params.file.buffer,
    });

    // Best-effort, matching `deleteSource()`'s own convention: an orphaned
    // old object is a storage-cleanup nuisance, never a reason to fail a
    // correction the operator is actively waiting on.
    await this.storage.delete(source.storageKey).catch(() => undefined);

    const updated = await this.prisma.documentSource.update({
      where: { id },
      data: {
        storageKey: stored.key,
        originalName: params.file.originalname,
        status: 'QUEUED',
        failureReason: null,
        pageCount: null,
        ingestedAt: null,
        attempts: 0,
        nextAttemptAt: null,
        claimedAt: null,
      },
    });

    await this.audit.record({
      actorId: params.actorId,
      action: 'rag.source_replaced',
      entity: 'DocumentSource',
      entityId: id,
      data: { corpus: source.corpus, originalName: params.file.originalname },
    });

    return updated;
  }

  /**
   * Removes the source and its file. `DocumentChunk` rows cascade
   * (`onDelete: Cascade`, rag.prisma) — the doc's own "a document that
   * should never have been indexed is removed via DocumentSource deletion,
   * cascading its chunks — never a soft 'hide it and hope.'" The stored
   * file itself is deleted too, so an erased source never survives as a
   * retrievable file behind a URL nobody indexes any more.
   */
  async deleteSource(id: string, actorId: string, permissions: readonly string[]): Promise<void> {
    const source = await this.findOne(id, permissions);
    await this.prisma.documentSource.delete({ where: { id } });
    await this.storage.delete(source.storageKey).catch(() => undefined);
    await this.audit.record({ actorId, action: 'rag.source_deleted', entity: 'DocumentSource', entityId: id, data: { originalName: source.originalName, corpus: source.corpus } });
  }
}
