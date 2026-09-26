import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { StorageService } from '../../core/storage/storage.service';
import { AuditService } from '../../core/audit/audit.service';
import { RagCorpusService } from './rag-corpus.service';

const ADMIN_LIKE_PERMISSIONS = ['rag.ingest.manage', 'rag.query', 'payroll.view', 'accounting.view', 'suppliers.manage'];
/** A real STAFF's shape (`ROLE_PERMISSION_SEED.STAFF`): both base rag.* grants and `suppliers.manage`, but neither `payroll.view` nor `accounting.view` (H1, security review). */
const STAFF_LIKE_PERMISSIONS = ['rag.ingest.manage', 'rag.query', 'suppliers.manage'];

describe('RagCorpusService', () => {
  let service: RagCorpusService;
  let prisma: any;
  let storage: any;
  let audit: any;

  beforeEach(async () => {
    prisma = {
      documentSource: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
      documentChunk: { count: jest.fn(), groupBy: jest.fn() },
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
      await expect(service.retry('gone', 'u1', ADMIN_LIKE_PERMISSIONS)).rejects.toThrow(NotFoundException);
    });

    it('refuses to retry anything but a FAILED (or stale-claimed) source', async () => {
      prisma.documentSource.findUnique.mockResolvedValue({ id: 's1', status: 'READY', corpus: 'KNOWLEDGE_BASE', claimedAt: null });
      await expect(service.retry('s1', 'u1', ADMIN_LIKE_PERMISSIONS)).rejects.toThrow(BadRequestException);
      expect(prisma.documentSource.update).not.toHaveBeenCalled();
    });

    it('re-queues a FAILED source, clears its failureReason, and resets its embed-attempt state', async () => {
      prisma.documentSource.findUnique.mockResolvedValue({ id: 's1', status: 'FAILED', failureReason: 'corrupted PDF', corpus: 'KNOWLEDGE_BASE', claimedAt: null });
      prisma.documentSource.update.mockResolvedValue({ id: 's1', status: 'QUEUED', failureReason: null });

      const result = await service.retry('s1', 'u1', ADMIN_LIKE_PERMISSIONS);

      expect(result.status).toBe('QUEUED');
      expect(prisma.documentSource.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { status: 'QUEUED', failureReason: null, attempts: 0, nextAttemptAt: null, claimedAt: null },
      });
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'rag.source_retried' }));
    });

    it('also accepts a source stuck EXTRACTING/CHUNKING/EMBEDDING past the staleness threshold (M7, security review)', async () => {
      const staleClaim = new Date(Date.now() - 20 * 60_000); // 20 minutes ago, past the 15-minute threshold
      prisma.documentSource.findUnique.mockResolvedValue({ id: 's1', status: 'EMBEDDING', corpus: 'KNOWLEDGE_BASE', claimedAt: staleClaim });
      prisma.documentSource.update.mockResolvedValue({ id: 's1', status: 'QUEUED' });

      const result = await service.retry('s1', 'u1', ADMIN_LIKE_PERMISSIONS);

      expect(result.status).toBe('QUEUED');
    });

    it('refuses a source stuck in-flight that is NOT yet stale', async () => {
      const freshClaim = new Date(); // just claimed
      prisma.documentSource.findUnique.mockResolvedValue({ id: 's1', status: 'EMBEDDING', corpus: 'KNOWLEDGE_BASE', claimedAt: freshClaim });

      await expect(service.retry('s1', 'u1', ADMIN_LIKE_PERMISSIONS)).rejects.toThrow(BadRequestException);
    });

    it('403s a STAFF-shaped caller retrying an EMPLOYEE_DOCUMENTS source (H1, security review)', async () => {
      prisma.documentSource.findUnique.mockResolvedValue({ id: 's1', status: 'FAILED', corpus: 'EMPLOYEE_DOCUMENTS', claimedAt: null });

      await expect(service.retry('s1', 'u1', STAFF_LIKE_PERMISSIONS)).rejects.toThrow(ForbiddenException);
      expect(prisma.documentSource.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteSource', () => {
    it('deletes the DocumentSource row (cascading chunks) and the stored file, and audits it', async () => {
      prisma.documentSource.findUnique.mockResolvedValue({ id: 's1', storageKey: 'rag-sources/a.pdf', originalName: 'a.pdf', corpus: 'KNOWLEDGE_BASE' });

      await service.deleteSource('s1', 'u1', ADMIN_LIKE_PERMISSIONS);

      expect(prisma.documentSource.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
      expect(storage.delete).toHaveBeenCalledWith('rag-sources/a.pdf');
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'rag.source_deleted', entityId: 's1' }));
    });

    it('404s a source that does not exist', async () => {
      prisma.documentSource.findUnique.mockResolvedValue(null);
      await expect(service.deleteSource('gone', 'u1', ADMIN_LIKE_PERMISSIONS)).rejects.toThrow(NotFoundException);
    });

    it('403s a STAFF-shaped caller deleting a BUSINESS_DOCUMENTS source (H1, security review)', async () => {
      prisma.documentSource.findUnique.mockResolvedValue({ id: 's1', storageKey: 'k', originalName: 'a.pdf', corpus: 'BUSINESS_DOCUMENTS' });

      await expect(service.deleteSource('s1', 'u1', STAFF_LIKE_PERMISSIONS)).rejects.toThrow(ForbiddenException);
      expect(prisma.documentSource.delete).not.toHaveBeenCalled();
    });
  });

  describe('findOne (H1, security review)', () => {
    it('403s a STAFF-shaped caller loading an EMPLOYEE_DOCUMENTS source', async () => {
      prisma.documentSource.findUnique.mockResolvedValue({ id: 's1', corpus: 'EMPLOYEE_DOCUMENTS' });
      await expect(service.findOne('s1', STAFF_LIKE_PERMISSIONS)).rejects.toThrow(ForbiddenException);
    });

    it('succeeds for KNOWLEDGE_BASE with the same STAFF-shaped permissions', async () => {
      prisma.documentSource.findUnique.mockResolvedValue({ id: 's1', corpus: 'KNOWLEDGE_BASE' });
      await expect(service.findOne('s1', STAFF_LIKE_PERMISSIONS)).resolves.toEqual({ id: 's1', corpus: 'KNOWLEDGE_BASE' });
    });

    it('skips the check entirely when permissions is omitted — the internal, system-acting caller path', async () => {
      prisma.documentSource.findUnique.mockResolvedValue({ id: 's1', corpus: 'EMPLOYEE_DOCUMENTS' });
      await expect(service.findOne('s1')).resolves.toEqual({ id: 's1', corpus: 'EMPLOYEE_DOCUMENTS' });
    });
  });

  describe('list (H1, security review)', () => {
    it('constrains the query to visible corpora when the caller names none', async () => {
      prisma.documentSource.findMany.mockResolvedValue([]);
      prisma.documentSource.count.mockResolvedValue(0);

      await service.list({ page: 1, pageSize: 20 }, STAFF_LIKE_PERMISSIONS);

      const where = prisma.documentSource.findMany.mock.calls[0][0].where;
      expect(where.corpus).toEqual({ in: ['SUPPLIER_CATALOG', 'KNOWLEDGE_BASE'] });
    });

    it('403s when the caller names a corpus it may not see', async () => {
      await expect(service.list({ page: 1, pageSize: 20, corpus: 'EMPLOYEE_DOCUMENTS' }, STAFF_LIKE_PERMISSIONS)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.documentSource.findMany).not.toHaveBeenCalled();
    });
  });

  describe('chunkCounts (L18, security review)', () => {
    it('issues a single groupBy instead of one COUNT per source, and maps counts back by id', async () => {
      prisma.documentChunk.groupBy.mockResolvedValue([
        { sourceId: 's1', _count: 3 },
        { sourceId: 's2', _count: 0 },
      ]);

      const counts = await service.chunkCounts(['s1', 's2']);

      expect(prisma.documentChunk.groupBy).toHaveBeenCalledTimes(1);
      expect(counts).toEqual({ s1: 3, s2: 0 });
    });

    it('returns an empty map without querying for an empty id list', async () => {
      const counts = await service.chunkCounts([]);
      expect(counts).toEqual({});
      expect(prisma.documentChunk.groupBy).not.toHaveBeenCalled();
    });
  });
});
