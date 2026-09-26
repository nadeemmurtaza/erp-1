import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { StorageService } from '../../core/storage/storage.service';
import { AuditService } from '../../core/audit/audit.service';
import { paginated, type PaginatedResult } from '../../core/common/dto/pagination.dto';
import type { DocumentCorpus, DocumentSource, IngestStatus } from '../../core/prisma/client';

const ALLOWED_TYPE = 'application/pdf';

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

  async list(query: {
    page: number;
    pageSize: number;
    corpus?: DocumentCorpus;
    status?: IngestStatus;
  }): Promise<PaginatedResult<DocumentSource>> {
    const where = { corpus: query.corpus, status: query.status };
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

  async findOne(id: string): Promise<DocumentSource> {
    const source = await this.prisma.documentSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Document source not found.');
    return source;
  }

  /** Chunk count for the admin screen's own "N chunks" column — a cheap count, never the chunks themselves. */
  async chunkCount(sourceId: string): Promise<number> {
    return this.prisma.documentChunk.count({ where: { sourceId } });
  }

  /**
   * FAILED -> QUEUED, so the next cron pass picks it back up — the doc's
   * own "visible on an admin ingestion-queue screen with a manual retry."
   * Refuses anything not currently FAILED: retrying a READY document would
   * silently re-run an expensive embedding pass nobody asked for, and
   * retrying an in-flight one would race the cron that already owns it.
   */
  async retry(id: string, actorId: string): Promise<DocumentSource> {
    const source = await this.findOne(id);
    if (source.status !== 'FAILED') {
      throw new BadRequestException(`Only a FAILED source can be retried (this one is ${source.status}).`);
    }

    const updated = await this.prisma.documentSource.update({
      where: { id },
      data: { status: 'QUEUED', failureReason: null },
    });

    await this.audit.record({ actorId, action: 'rag.source_retried', entity: 'DocumentSource', entityId: id });
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
  async deleteSource(id: string, actorId: string): Promise<void> {
    const source = await this.findOne(id);
    await this.prisma.documentSource.delete({ where: { id } });
    await this.storage.delete(source.storageKey).catch(() => undefined);
    await this.audit.record({ actorId, action: 'rag.source_deleted', entity: 'DocumentSource', entityId: id, data: { originalName: source.originalName, corpus: source.corpus } });
  }
}
