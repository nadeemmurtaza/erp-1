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
  let fetchMock: jest.Mock;

  const baseSource = {
    id: 'src1',
    status: 'QUEUED',
    storageKey: 'rag-sources/a.pdf',
    organizationId: null,
    corpus: 'KNOWLEDGE_BASE',
  };

  beforeEach(async () => {
    prisma = { documentSource: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() } };
    storage = { urlFor: jest.fn().mockReturnValue('https://files.local/rag-sources/a.pdf') };
    ai = { isAvailable: jest.fn().mockReturnValue(true), embed: jest.fn() };
    extraction = { extract: jest.fn() };
    vectorStore = { upsertChunks: jest.fn().mockResolvedValue(undefined) };

    fetchMock = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new TextEncoder().encode('%PDF-1.4').buffer });
    (global as any).fetch = fetchMock;

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
    });
  });

  describe('ingestOne', () => {
    it('is a no-op for a source that is not QUEUED (already in flight, or terminal)', async () => {
      prisma.documentSource.findUnique.mockResolvedValue({ ...baseSource, status: 'READY' });

      const succeeded = await service.ingestOne('src1');

      expect(succeeded).toBe(false);
      expect(prisma.documentSource.update).not.toHaveBeenCalled();
    });

    it('extracts, chunks, embeds in batch, upserts once, and marks READY', async () => {
      prisma.documentSource.findUnique.mockResolvedValue({ ...baseSource });
      extraction.extract.mockResolvedValue({
        pageCount: 1,
        pages: [{ pageNumber: 1, text: 'a'.repeat(600), fromOcr: false }],
      });
      ai.embed.mockResolvedValue({ vectors: [Array(1536).fill(0.1)], inputTokens: 50, model: 'x' });

      const succeeded = await service.ingestOne('src1');

      expect(succeeded).toBe(true);
      expect(vectorStore.upsertChunks).toHaveBeenCalledTimes(1);
      const upserted = vectorStore.upsertChunks.mock.calls[0][0];
      expect(upserted.length).toBeGreaterThan(0);
      expect(upserted[0].organizationId).toBeNull();
      expect(upserted[0].corpus).toBe('KNOWLEDGE_BASE');

      const statuses = prisma.documentSource.update.mock.calls.map((call: any[]) => call[0].data.status).filter(Boolean);
      expect(statuses).toEqual(['EXTRACTING', 'CHUNKING', 'EMBEDDING', 'READY']);
    });

    it('reverts to QUEUED (never FAILED) when the AiProvider is unavailable mid-embedding, and never touches the vector store', async () => {
      prisma.documentSource.findUnique.mockResolvedValue({ ...baseSource });
      extraction.extract.mockResolvedValue({ pageCount: 1, pages: [{ pageNumber: 1, text: 'a'.repeat(600), fromOcr: false }] });
      ai.embed.mockResolvedValue(null);

      const succeeded = await service.ingestOne('src1');

      expect(succeeded).toBe(false);
      expect(vectorStore.upsertChunks).not.toHaveBeenCalled();
      const lastUpdate = prisma.documentSource.update.mock.calls.at(-1)[0];
      expect(lastUpdate.data.status).toBe('QUEUED');
    });

    it('sets FAILED with a failureReason on an extraction error, and never calls the vector store', async () => {
      prisma.documentSource.findUnique.mockResolvedValue({ ...baseSource });
      extraction.extract.mockRejectedValue(new Error('corrupted PDF'));

      const succeeded = await service.ingestOne('src1');

      expect(succeeded).toBe(false);
      expect(vectorStore.upsertChunks).not.toHaveBeenCalled();
      const lastUpdate = prisma.documentSource.update.mock.calls.at(-1)[0];
      expect(lastUpdate.data.status).toBe('FAILED');
      expect(lastUpdate.data.failureReason).toContain('corrupted PDF');
    });

    it('a document producing no chunks at all (a blank PDF) still reaches READY, having called the vector store with an empty array', async () => {
      prisma.documentSource.findUnique.mockResolvedValue({ ...baseSource });
      extraction.extract.mockResolvedValue({ pageCount: 1, pages: [{ pageNumber: 1, text: '', fromOcr: false }] });

      const succeeded = await service.ingestOne('src1');

      expect(succeeded).toBe(true);
      expect(ai.embed).not.toHaveBeenCalled();
      expect(vectorStore.upsertChunks).toHaveBeenCalledWith([]);
    });
  });
});
