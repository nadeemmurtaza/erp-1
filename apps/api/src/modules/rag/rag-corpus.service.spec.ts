import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { StorageService } from '../../core/storage/storage.service';
import { AuditService } from '../../core/audit/audit.service';
import { RagCorpusService } from './rag-corpus.service';

describe('RagCorpusService', () => {
  let service: RagCorpusService;
  let prisma: any;
  let storage: any;
  let audit: any;

  beforeEach(async () => {
    prisma = {
      documentSource: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
      documentChunk: { count: jest.fn() },
    };
    storage = { putDocument: jest.fn(), delete: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        RagCorpusService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(RagCorpusService);
  });

  describe('createSource', () => {
    it('refuses a non-PDF upload', async () => {
      await expect(
        service.createSource({
          file: { buffer: Buffer.from('x'), originalname: 'a.docx', mimetype: 'application/msword' },
          corpus: 'KNOWLEDGE_BASE',
          organizationId: null,
          uploadedById: 'u1',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(storage.putDocument).not.toHaveBeenCalled();
    });

    it('stores the file, creates a QUEUED DocumentSource, and audits the upload', async () => {
      storage.putDocument.mockResolvedValue({ key: 'rag-sources/2026/09/a.pdf', url: 'https://x/a.pdf', size: 10, contentType: 'application/pdf' });
      prisma.documentSource.create.mockResolvedValue({ id: 'src1', status: 'QUEUED' });

      const result = await service.createSource({
        file: { buffer: Buffer.from('%PDF'), originalname: 'policy.pdf', mimetype: 'application/pdf' },
        corpus: 'KNOWLEDGE_BASE',
        organizationId: null,
        uploadedById: 'u1',
      });

      expect(result).toEqual({ id: 'src1', status: 'QUEUED' });
      expect(prisma.documentSource.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ storageKey: 'rag-sources/2026/09/a.pdf', corpus: 'KNOWLEDGE_BASE', status: 'QUEUED', uploadedById: 'u1' }) }),
      );
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'rag.source_uploaded', entityId: 'src1' }));
    });
  });

  describe('retry', () => {
    it('404s a source that does not exist', async () => {
      prisma.documentSource.findUnique.mockResolvedValue(null);
      await expect(service.retry('gone', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('refuses to retry anything but a FAILED source', async () => {
      prisma.documentSource.findUnique.mockResolvedValue({ id: 's1', status: 'READY' });
      await expect(service.retry('s1', 'u1')).rejects.toThrow(BadRequestException);
      expect(prisma.documentSource.update).not.toHaveBeenCalled();
    });

    it('re-queues a FAILED source and clears its failureReason', async () => {
      prisma.documentSource.findUnique.mockResolvedValue({ id: 's1', status: 'FAILED', failureReason: 'corrupted PDF' });
      prisma.documentSource.update.mockResolvedValue({ id: 's1', status: 'QUEUED', failureReason: null });

      const result = await service.retry('s1', 'u1');

      expect(result.status).toBe('QUEUED');
      expect(prisma.documentSource.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { status: 'QUEUED', failureReason: null } });
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'rag.source_retried' }));
    });
  });

  describe('deleteSource', () => {
    it('deletes the DocumentSource row (cascading chunks) and the stored file, and audits it', async () => {
      prisma.documentSource.findUnique.mockResolvedValue({ id: 's1', storageKey: 'rag-sources/a.pdf', originalName: 'a.pdf', corpus: 'KNOWLEDGE_BASE' });

      await service.deleteSource('s1', 'u1');

      expect(prisma.documentSource.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
      expect(storage.delete).toHaveBeenCalledWith('rag-sources/a.pdf');
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'rag.source_deleted', entityId: 's1' }));
    });

    it('404s a source that does not exist', async () => {
      prisma.documentSource.findUnique.mockResolvedValue(null);
      await expect(service.deleteSource('gone', 'u1')).rejects.toThrow(NotFoundException);
    });
  });
});
