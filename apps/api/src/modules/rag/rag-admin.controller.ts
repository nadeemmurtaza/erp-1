import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { AuditService } from '../../core/audit/audit.service';
import { RagCorpusService, toPublicSource, type PublicDocumentSource } from './rag-corpus.service';
import { RagIngestionService } from './rag-ingestion.service';
import { RagRetrievalService } from './rag-retrieval.service';
import { RagGenerationService } from './rag-generation.service';
import { assertCorpusAccess } from './rag-corpus-access';
import { ListSourcesQueryDto, RagQueryDto, UploadSourceDto } from './dto/rag.dto';

/** Uploaded file as Multer hands it over — same local shape `catalog-admin.controller.ts`'s own `UploadedImage` uses, rather than the global `Express.Multer.File` this codebase's tsconfig does not have typed. */
interface UploadedFileLike {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

/**
 * H2 (security review) — `originalName` is user-supplied at upload time;
 * strips anything but word characters, dots, hyphens and spaces before it
 * reaches a `Content-Disposition` header, since header injection via a
 * crafted filename is a real bug class.
 */
function sanitizeFilenameForHeader(name: string): string {
  const cleaned = name.replace(/[^\w.\- ]/g, '_').slice(0, 200);
  return cleaned || 'document.pdf';
}

/** L13 (security review) — a synthetic id for an audit entry with no single entity of its own (a query touches a corpus, not one row). */
function syntheticQueryId(): string {
  return `query-${randomBytes(8).toString('hex')}`;
}

/**
 * WO-35.1/35.4/35.5/35.6 — corpus/source administration
 * (`rag.ingest.manage`) and the query-test console
 * (`rag.query`). Split by permission exactly the way the doc's own
 * "Whose rows, and which columns" lens draws it: administering WHAT is
 * indexed is a different capability from READING what retrieval finds.
 *
 * H1 (security review) — neither permission alone says WHICH corpus a
 * caller may reach; every route below also runs `assertCorpusAccess()` (a
 * corpus named directly) or relies on `RagCorpusService`'s own internal
 * check (a specific `DocumentSource` loaded by id) before touching a
 * corpus's actual content.
 */
@ApiTags('admin/rag')
@Controller('admin/rag')
export class RagAdminController {
  private readonly logger = new Logger(RagAdminController.name);

  constructor(
    private readonly corpus: RagCorpusService,
    private readonly ingestion: RagIngestionService,
    private readonly retrieval: RagRetrievalService,
    private readonly generation: RagGenerationService,
    private readonly audit: AuditService,
  ) {}

  @Get('status')
  @RequirePermission('rag.ingest.manage', 'rag.query')
  @ApiOperation({ summary: 'Whether retrieval/generation are available — the absent-AiProvider case the query console hides itself for' })
  status() {
    return {
      retrievalAvailable: this.retrieval.isAvailable(),
      generationAvailable: this.generation.isAvailable(),
    };
  }

  // --- Corpus / source administration ----------------------------------------

  @Get('sources')
  @RequirePermission('rag.ingest.manage')
  @ApiOperation({ summary: 'The ingestion queue: every DocumentSource and its status — constrained to corpora this caller may see (H1)' })
  async listSources(@CurrentUser() user: AuthenticatedUser, @Query() query: ListSourcesQueryDto) {
    const page = await this.corpus.list(query, user.permissions);
    const counts = await this.corpus.chunkCounts(page.data.map((source) => source.id));
    return { ...page, data: page.data.map((source) => ({ ...toPublicSource(source), chunkCount: counts[source.id] ?? 0 })) };
  }

  @Get('sources/:id')
  @RequirePermission('rag.ingest.manage')
  @ApiOperation({ summary: 'One DocumentSource, with its chunk count' })
  async getSource(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const source = await this.corpus.findOne(id, user.permissions);
    const chunkCount = await this.corpus.chunkCount(id);
    return { ...toPublicSource(source), chunkCount };
  }

  @Get('sources/:id/file')
  @RequirePermission('rag.ingest.manage')
  @ApiOperation({ summary: 'Download the original stored PDF — the only authenticated path to its bytes (H2, security review)' })
  async downloadSourceFile(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() response: Response) {
    const { source, buffer } = await this.corpus.getSourceFile(id, user.permissions);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilenameForHeader(source.originalName)}"`);
    response.send(buffer);
  }

  @Post('sources')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, corpus: { type: 'string' } } } })
  @UseInterceptors(FileInterceptor('file'))
  @RequirePermission('rag.ingest.manage')
  @ApiOperation({ summary: 'Upload a PDF into a corpus — queued for the next ingestion pass' })
  async uploadSource(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body() dto: UploadSourceDto,
  ): Promise<PublicDocumentSource> {
    if (!file) throw new BadRequestException('Choose a PDF file to upload.');
    // H1 (security review) — checked directly against the DTO's own corpus
    // field: there is no row to load yet.
    assertCorpusAccess(user.permissions, dto.corpus);

    const source = await this.corpus.createSource({
      file: { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype },
      corpus: dto.corpus,
      // M4 (security review) — this deployment has no Organization-tier
      // context resolver yet (`rag.prisma`'s own header comment), so every
      // write is scoped to this deployment's own implicit single
      // organization (`null`), exactly `WalletAccount.organizationId`'s
      // established convention. A future Organization-tier context replaces
      // this one line, never a client-supplied field — see `UploadSourceDto`.
      organizationId: null,
      uploadedById: user.id,
    });
    return toPublicSource(source);
  }

  @Post('sources/:id/file')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file'))
  @RequirePermission('rag.ingest.manage')
  @ApiOperation({ summary: "Replace a source's file — corrects a bad upload without a delete-then-recreate round trip (L20, security review)" })
  async replaceSourceFile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: UploadedFileLike | undefined,
  ): Promise<PublicDocumentSource> {
    if (!file) throw new BadRequestException('Choose a replacement PDF file to upload.');
    const updated = await this.corpus.replaceFile(id, {
      file: { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype },
      actorId: user.id,
      permissions: user.permissions,
    });
    return toPublicSource(updated);
  }

  @Post('sources/:id/retry')
  @RequirePermission('rag.ingest.manage')
  @ApiOperation({ summary: 'Re-queue a FAILED source, or one stuck in-flight past the staleness threshold' })
  async retry(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<PublicDocumentSource> {
    const updated = await this.corpus.retry(id, user.id, user.permissions);
    return toPublicSource(updated);
  }

  /**
   * A manual "run it now" for the admin screen — the cron already does this
   * every five minutes; this exists so a retried document does not need a
   * five-minute wait to prove it worked.
   *
   * M12 (security review) — never awaited: several sequential vision calls
   * can run well past any HTTP request timeout, and this used to skip the
   * `isAvailable('embed')` guard `processQueued()` itself applies. The
   * response reflects the source's current (still QUEUED) state; the admin
   * screen watches it move through the pipeline via `GET sources/:id`.
   */
  @Post('sources/:id/ingest-now')
  @HttpCode(202)
  @RequirePermission('rag.ingest.manage')
  @ApiOperation({ summary: 'Queue immediate, in-background ingestion for one QUEUED source, without waiting for the cron' })
  async ingestNow(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<{ accepted: true; source: PublicDocumentSource }> {
    // Loads the row (404 if missing) and checks corpus access (403) BEFORE
    // anything is dispatched — a fire-and-forget call could otherwise only
    // ever report a rejection into the log, never back to this response.
    const source = await this.corpus.findOne(id, user.permissions);
    if (!this.retrieval.isAvailable()) {
      throw new ServiceUnavailableException('Embedding is not available right now — try again shortly.');
    }

    void this.ingestion.ingestOne(id, user.permissions).catch((error) => {
      this.logger.error(`Manual ingest-now failed for DocumentSource ${id}: ${error instanceof Error ? error.message : String(error)}`);
    });

    await this.audit.record({ actorId: user.id, action: 'rag.ingest_triggered', entity: 'DocumentSource', entityId: id, data: { corpus: source.corpus } });

    return { accepted: true, source: toPublicSource(source) };
  }

  @Delete('sources/:id')
  @RequirePermission('rag.ingest.manage')
  @ApiOperation({ summary: 'Remove a source and its chunks — never indexed again unless re-uploaded' })
  async deleteSource(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.corpus.deleteSource(id, user.id, user.permissions);
    return { deleted: true };
  }

  // --- Query-test console (WO-35.4/35.5) --------------------------------------

  @Post('query')
  @RequirePermission('rag.query')
  // L17 (security review) — a code-guessing/scraping throttle, the same
  // reasoning already applied to `payments.controller.ts`'s own redemption
  // endpoint.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: "Dry run: the retrieved chunks for a query, with no generation step (the doc's own tuning tool)" })
  async query(@CurrentUser() user: AuthenticatedUser, @Body() dto: RagQueryDto) {
    assertCorpusAccess(user.permissions, dto.corpus);
    const hits = await this.retrieval.retrieve(dto.query, { organizationId: null, corpus: dto.corpus }, dto.topK);

    // L13 (security review) — who read what, from a corpus that can be
    // confidential, is itself part of the audit trail.
    await this.audit.record({
      actorId: user.id,
      action: 'rag.query_executed',
      entity: 'RagQuery',
      entityId: syntheticQueryId(),
      data: { corpus: dto.corpus, query: dto.query.slice(0, 200), resultSourceIds: [...new Set(hits.map((hit) => hit.sourceId))] },
    });

    return hits;
  }

  @Post('ask')
  @RequirePermission('rag.query')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Retrieval + a generated, cited answer — an internal staff read, no draft-confirm gate (09-ai-layer.md §5)' })
  async ask(@CurrentUser() user: AuthenticatedUser, @Body() dto: RagQueryDto) {
    assertCorpusAccess(user.permissions, dto.corpus);
    const answer = await this.generation.answer(dto.query, { organizationId: null, corpus: dto.corpus }, dto.topK);

    await this.audit.record({
      actorId: user.id,
      action: 'rag.answer_generated',
      entity: 'RagQuery',
      entityId: syntheticQueryId(),
      data: { corpus: dto.corpus, query: dto.query.slice(0, 200), resultSourceIds: answer ? [...new Set(answer.citations.map((citation) => citation.sourceId))] : [] },
    });

    return answer;
  }
}
