import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { StorageService } from '../../core/storage/storage.service';
import { AiService } from '../../core/ai/ai.service';
import { PdfExtractionService } from './pdf-extraction.service';
import { RagIngestionService } from './rag-ingestion.service';
import { VECTOR_STORE } from './vector-store';

describe('RagIngestionService', () => {
  let service: RagIngestionService;
  let prisma: any;
  let storage: any;
  let ai: any;
  let extraction: any;
  let vectorStore: any;

  const baseSource = {
    id: 'src1',
    status: 'EXTRACTING', // as it would read immediately after the atomic claim below
    storageKey: 'rag-sources/a.pdf',
    organizationId: null,
    corpus: 'KNOWLEDGE_BASE',
    attempts: 0,
  };

  beforeEach(async () => {
    prisma = {
      documentSource: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    storage = { get: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4')) };
    ai = { isAvailable: jest.fn().mockReturnValue(true), embed: jest.fn() };
    extraction = { extract: jest.fn() };
    vectorStore = { upsertChunks: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        RagIngestionService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: AiService, useValue: ai },
        { provide: PdfExtractionService, useValue: extraction },
        { provide: VECTOR_STORE, useValue: vectorStore },
      ],
    }).compile();
    service = module.get(RagIngestionService);
  });

  describe('processQueued', () => {
    it('never starts (the absent-collaborator rule) when no embedding-capable AiProvider is configured', async () => {
      ai.isAvailable.mockReturnValue(false);

      const result = await service.processQueued();

      expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0 });
      expect(prisma.documentSource.findMany).not.toHaveBeenCalled();
      expect(prisma.documentSource.updateMany).not.toHaveBeenCalled();
    });

    it('reaps stale in-flight claims before selecting new work (M7, security review)', async () => {
      prisma.documentSource.updateMany.mockResolvedValue({ count: 2 });
      prisma.documentSource.findMany.mockResolvedValue([]);

      await service.processQueued();

      expect(prisma.documentSource.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: { in: ['EXTRACTING', 'CHUNKING', 'EMBEDDING'] } }),
          data: { status: 'QUEUED', claimedAt: null },
        }),
      );
    });

    it('only selects QUEUED sources whose nextAttemptAt has passed or is unset (M8, security review)', async () => {
      prisma.documentSource.updateMany.mockResolvedValue({ count: 0 });
      prisma.documentSource.findMany.mockResolvedValue([]);

      await service.processQueued();

      const query = prisma.documentSource.findMany.mock.calls[0][0];
      expect(query.where.status).toBe('QUEUED');
      expect(query.where.OR).toEqual([{ nextAttemptAt: null }, { nextAttemptAt: { lte: expect.any(Date) } }]);
    });
  });

  describe('ingestOne', () => {
    it('is a no-op when the atomic claim fails — already claimed by another caller, or not QUEUED at all (M7, security review)', async () => {
      prisma.documentSource.updateMany.mockResolvedValue({ count: 0 });

      const succeeded = await service.ingestOne('src1');

      expect(succeeded).toBe(false);
      expect(prisma.documentSource.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(prisma.documentSource.update).not.toHaveBeenCalled();
    });

    it('claims atomically (a single compare-and-set), then extracts, chunks, embeds in batch, upserts once, and marks READY', async () => {
      prisma.documentSource.findUniqueOrThrow.mockResolvedValue({ ...baseSource });
      extraction.extract.mockResolvedValue({
        pageCount: 1,
        pages: [{ pageNumber: 1, text: 'a'.repeat(600), fromOcr: false }],
      });
      ai.embed.mockResolvedValue({ vectors: [Array(1536).fill(0.1)], inputTokens: 50, model: 'x' });

      const succeeded = await service.ingestOne('src1');

      expect(succeeded).toBe(true);
      expect(prisma.documentSource.updateMany).toHaveBeenCalledWith({
        where: { id: 'src1', status: 'QUEUED' },
        data: { status: 'EXTRACTING', claimedAt: expect.any(Date) },
      });
      expect(vectorStore.upsertChunks).toHaveBeenCalledTimes(1);
      const upserted = vectorStore.upsertChunks.mock.calls[0][0];
      expect(upserted.length).toBeGreaterThan(0);
      expect(upserted[0].organizationId).toBeNull();
      expect(upserted[0].corpus).toBe('KNOWLEDGE_BASE');

      const statuses = prisma.documentSource.update.mock.calls.map((call: any[]) => call[0].data.status).filter(Boolean);
      // EXTRACTING itself is set by the atomic claim above, not by update().
      expect(statuses).toEqual(['CHUNKING', 'EMBEDDING', 'READY']);
      const readyUpdate = prisma.documentSource.update.mock.calls.at(-1)[0].data;
      expect(readyUpdate).toEqual(
        expect.objectContaining({ status: 'READY', attempts: 0, nextAttemptAt: null }),
      );
    });

    it('backs off with an increasing delay (never FAILED on the first failure) when the AiProvider is unavailable mid-embedding, and never touches the vector store (M8, security review)', async () => {
      prisma.documentSource.findUniqueOrThrow.mockResolvedValue({ ...baseSource, attempts: 0 });
      extraction.extract.mockResolvedValue({ pageCount: 1, pages: [{ pageNumber: 1, text: 'a'.repeat(600), fromOcr: false }] });
      ai.embed.mockResolvedValue(null);

      const succeeded = await service.ingestOne('src1');

      expect(succeeded).toBe(false);
      expect(vectorStore.upsertChunks).not.toHaveBeenCalled();
      const lastUpdate = prisma.documentSource.update.mock.calls.at(-1)[0];
      expect(lastUpdate.data.status).toBe('QUEUED');
      expect(lastUpdate.data.attempts).toBe(1);
      expect(lastUpdate.data.nextAttemptAt).toBeInstanceOf(Date);
      expect(lastUpdate.data.claimedAt).toBeNull();
    });

    it('moves to FAILED instead of requeueing once MAX_EMBED_ATTEMPTS is exceeded (M8, security review)', async () => {
      prisma.documentSource.findUniqueOrThrow.mockResolvedValue({ ...baseSource, attempts: 5 });
      extraction.extract.mockResolvedValue({ pageCount: 1, pages: [{ pageNumber: 1, text: 'a'.repeat(600), fromOcr: false }] });
      ai.embed.mockResolvedValue(null);

      const succeeded = await service.ingestOne('src1');

      expect(succeeded).toBe(false);
      const lastUpdate = prisma.documentSource.update.mock.calls.at(-1)[0];
      expect(lastUpdate.data.status).toBe('FAILED');
      expect(lastUpdate.data.failureReason).toBe('Exceeded maximum embedding retry attempts.');
    });

    it('sets FAILED with a failureReason on an extraction error, and never calls the vector store', async () => {
      prisma.documentSource.findUniqueOrThrow.mockResolvedValue({ ...baseSource });
      extraction.extract.mockRejectedValue(new Error('corrupted PDF'));

      const succeeded = await service.ingestOne('src1');

      expect(succeeded).toBe(false);
      expect(vectorStore.upsertChunks).not.toHaveBeenCalled();
      const lastUpdate = prisma.documentSource.update.mock.calls.at(-1)[0];
      expect(lastUpdate.data.status).toBe('FAILED');
      expect(lastUpdate.data.failureReason).toContain('corrupted PDF');
    });

    it('redacts a URL or filesystem path out of failureReason, but still logs the original (L15, security review)', async () => {
      prisma.documentSource.findUniqueOrThrow.mockResolvedValue({ ...baseSource });
      extraction.extract.mockRejectedValue(new Error('could not fetch https://internal.example.com/rag-sources/secret-key.pdf at /var/data/secret'));

      await service.ingestOne('src1');

      const lastUpdate = prisma.documentSource.update.mock.calls.at(-1)[0];
      expect(lastUpdate.data.failureReason).not.toContain('https://internal.example.com');
      expect(lastUpdate.data.failureReason).not.toContain('/var/data/secret');
    });

    it('a document producing no chunks at all (a blank PDF) still reaches READY, having called the vector store with an empty array', async () => {
      prisma.documentSource.findUniqueOrThrow.mockResolvedValue({ ...baseSource });
      extraction.extract.mockResolvedValue({ pageCount: 1, pages: [{ pageNumber: 1, text: '', fromOcr: false }] });

      const succeeded = await service.ingestOne('src1');

      expect(succeeded).toBe(true);
      expect(ai.embed).not.toHaveBeenCalled();
      expect(vectorStore.upsertChunks).toHaveBeenCalledWith([]);
    });

    describe('corpus access (H1, security review)', () => {
      it('checks corpus access BEFORE claiming, and never claims the row when the caller may not reach it', async () => {
        prisma.documentSource.findUnique.mockResolvedValue({ corpus: 'EMPLOYEE_DOCUMENTS' });

        await expect(service.ingestOne('src1', ['rag.ingest.manage'])).rejects.toThrow(ForbiddenException);
        expect(prisma.documentSource.updateMany).not.toHaveBeenCalled();
      });

      it('proceeds normally when the caller may reach the corpus', async () => {
        prisma.documentSource.findUnique.mockResolvedValue({ corpus: 'KNOWLEDGE_BASE' });
        prisma.documentSource.findUniqueOrThrow.mockResolvedValue({ ...baseSource });
        extraction.extract.mockResolvedValue({ pageCount: 1, pages: [{ pageNumber: 1, text: '', fromOcr: false }] });

        const succeeded = await service.ingestOne('src1', ['rag.ingest.manage']);

        expect(succeeded).toBe(true);
      });

      it('is a no-op (never claims, never throws) for a permissions-scoped call whose source has already vanished', async () => {
        prisma.documentSource.findUnique.mockResolvedValue(null);

        const succeeded = await service.ingestOne('gone', ['rag.ingest.manage']);

        expect(succeeded).toBe(false);
        expect(prisma.documentSource.updateMany).not.toHaveBeenCalled();
      });

      it('skips the check entirely when permissions is omitted — the cron\'s own system-acting path', async () => {
        prisma.documentSource.findUniqueOrThrow.mockResolvedValue({ ...baseSource, corpus: 'EMPLOYEE_DOCUMENTS' });
        extraction.extract.mockResolvedValue({ pageCount: 1, pages: [{ pageNumber: 1, text: '', fromOcr: false }] });

        const succeeded = await service.ingestOne('src1');

        expect(succeeded).toBe(true);
        expect(prisma.documentSource.findUnique).not.toHaveBeenCalled();
      });
    });
  });
});
