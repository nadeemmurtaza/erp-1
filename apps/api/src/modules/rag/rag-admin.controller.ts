import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { RagCorpusService } from './rag-corpus.service';
import { RagIngestionService } from './rag-ingestion.service';
import { RagRetrievalService } from './rag-retrieval.service';
import { RagGenerationService } from './rag-generation.service';
import { ListSourcesQueryDto, RagQueryDto, UploadSourceDto } from './dto/rag.dto';

/** Uploaded file as Multer hands it over — same local shape `catalog-admin.controller.ts`'s own `UploadedImage` uses, rather than the global `Express.Multer.File` this codebase's tsconfig does not have typed. */
interface UploadedFileLike {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

/**
 * WO-35.1/35.4/35.5/35.6 — corpus/source administration
 * (`rag.ingest.manage`) and the query-test console
 * (`rag.query`). Split by permission exactly the way the doc's own
 * "Whose rows, and which columns" lens draws it: administering WHAT is
 * indexed is a different capability from READING what retrieval finds.
 */
@ApiTags('admin/rag')
@Controller('admin/rag')
export class RagAdminController {
  constructor(
    private readonly corpus: RagCorpusService,
    private readonly ingestion: RagIngestionService,
    private readonly retrieval: RagRetrievalService,
    private readonly generation: RagGenerationService,
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
  @ApiOperation({ summary: 'The ingestion queue: every DocumentSource and its status' })
  async listSources(@Query() query: ListSourcesQueryDto) {
    const page = await this.corpus.list(query);
    const withChunkCounts = await Promise.all(
      page.data.map(async (source) => ({ ...source, chunkCount: await this.corpus.chunkCount(source.id) })),
    );
    return { ...page, data: withChunkCounts };
  }

  @Get('sources/:id')
  @RequirePermission('rag.ingest.manage')
  @ApiOperation({ summary: 'One DocumentSource, with its chunk count' })
  async getSource(@Param('id') id: string) {
    const source = await this.corpus.findOne(id);
    const chunkCount = await this.corpus.chunkCount(id);
    return { ...source, chunkCount };
  }

  @Post('sources')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, corpus: { type: 'string' }, organizationId: { type: 'string' } } } })
  @UseInterceptors(FileInterceptor('file'))
  @RequirePermission('rag.ingest.manage')
  @ApiOperation({ summary: 'Upload a PDF into a corpus — queued for the next ingestion pass' })
  async uploadSource(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body() dto: UploadSourceDto,
  ) {
    if (!file) throw new BadRequestException('Choose a PDF file to upload.');
    return this.corpus.createSource({
      file: { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype },
      corpus: dto.corpus,
      organizationId: dto.organizationId ?? null,
      uploadedById: user.id,
    });
  }

  @Post('sources/:id/retry')
  @RequirePermission('rag.ingest.manage')
  @ApiOperation({ summary: 'Re-queue a FAILED source' })
  retry(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.corpus.retry(id, user.id);
  }

  /** A manual "run it now" for the admin screen — the cron already does this every five minutes; this exists so a retried document does not need a five-minute wait to prove it worked. */
  @Post('sources/:id/ingest-now')
  @RequirePermission('rag.ingest.manage')
  @ApiOperation({ summary: 'Run ingestion for one QUEUED source immediately, without waiting for the cron' })
  async ingestNow(@Param('id') id: string) {
    const succeeded = await this.ingestion.ingestOne(id);
    return this.corpus.findOne(id).then((source) => ({ succeeded, source }));
  }

  @Delete('sources/:id')
  @RequirePermission('rag.ingest.manage')
  @ApiOperation({ summary: 'Remove a source and its chunks — never indexed again unless re-uploaded' })
  async deleteSource(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.corpus.deleteSource(id, user.id);
    return { deleted: true };
  }

  // --- Query-test console (WO-35.4/35.5) --------------------------------------

  @Post('query')
  @RequirePermission('rag.query')
  @ApiOperation({ summary: "Dry run: the retrieved chunks for a query, with no generation step (the doc's own tuning tool)" })
  query(@Body() dto: RagQueryDto) {
    return this.retrieval.retrieve(dto.query, { organizationId: dto.organizationId ?? null, corpus: dto.corpus }, dto.topK);
  }

  @Post('ask')
  @RequirePermission('rag.query')
  @ApiOperation({ summary: 'Retrieval + a generated, cited answer — an internal staff read, no draft-confirm gate (09-ai-layer.md §5)' })
  ask(@Body() dto: RagQueryDto) {
    return this.generation.answer(dto.query, { organizationId: dto.organizationId ?? null, corpus: dto.corpus }, dto.topK);
  }
}
