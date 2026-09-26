import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { AuditService } from '../../core/audit/audit.service';
import { RagAdminController } from './rag-admin.controller';
import { RagCorpusService } from './rag-corpus.service';
import { RagIngestionService } from './rag-ingestion.service';
import { RagRetrievalService } from './rag-retrieval.service';
import { RagGenerationService } from './rag-generation.service';

/** A real STAFF's shape (`ROLE_PERMISSION_SEED.STAFF`): both base rag.* grants and `suppliers.manage`, but neither `payroll.view` nor `accounting.view` (H1, security review). */
const staffUser: AuthenticatedUser = {
  id: 'staff1',
  roles: ['STAFF'],
  permissions: ['rag.ingest.manage', 'rag.query', 'suppliers.manage'],
  email: 'staff@example.com',
  phone: null,
};

const adminUser: AuthenticatedUser = {
  id: 'admin1',
  roles: ['ADMIN'],
  permissions: ['rag.ingest.manage', 'rag.query', 'payroll.view', 'accounting.view', 'suppliers.manage'],
  email: 'admin@example.com',
  phone: null,
};

describe('RagAdminController', () => {
  let controller: RagAdminController;
  let corpus: any;
  let ingestion: any;
  let retrieval: any;
  let generation: any;
  let audit: any;

  beforeEach(async () => {
    corpus = {
      list: jest.fn(),
      findOne: jest.fn(),
      getSourceFile: jest.fn(),
      chunkCount: jest.fn().mockResolvedValue(0),
      chunkCounts: jest.fn().mockResolvedValue({}),
      createSource: jest.fn(),
      replaceFile: jest.fn(),
      retry: jest.fn(),
      deleteSource: jest.fn(),
    };
    ingestion = { ingestOne: jest.fn().mockResolvedValue(true) };
    retrieval = { retrieve: jest.fn(), isAvailable: jest.fn().mockReturnValue(true) };
    generation = { answer: jest.fn(), isAvailable: jest.fn().mockReturnValue(true) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      controllers: [RagAdminController],
      providers: [
        { provide: RagCorpusService, useValue: corpus },
        { provide: RagIngestionService, useValue: ingestion },
        { provide: RagRetrievalService, useValue: retrieval },
        { provide: RagGenerationService, useValue: generation },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    controller = module.get(RagAdminController);
  });

  describe('query (H1, security review)', () => {
    it('403s a STAFF-shaped caller querying EMPLOYEE_DOCUMENTS', async () => {
      await expect(controller.query(staffUser, { query: 'salary?', corpus: 'EMPLOYEE_DOCUMENTS' } as any)).rejects.toThrow(
        ForbiddenException,
      );
      expect(retrieval.retrieve).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('succeeds for KNOWLEDGE_BASE with the same STAFF-shaped permissions, and audits the query', async () => {
      retrieval.retrieve.mockResolvedValue([{ id: 'c1', sourceId: 's1', pageFrom: 1, pageTo: 1, text: 't', score: 0.9 }]);

      const result = await controller.query(staffUser, { query: 'return policy', corpus: 'KNOWLEDGE_BASE' } as any);

      expect(result).toHaveLength(1);
      expect(retrieval.retrieve).toHaveBeenCalledWith('return policy', { organizationId: null, corpus: 'KNOWLEDGE_BASE' }, undefined);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: 'staff1', action: 'rag.query_executed', entity: 'RagQuery', data: expect.objectContaining({ corpus: 'KNOWLEDGE_BASE' }) }),
      );
    });
  });

  describe('ask (H1, security review)', () => {
    it('403s a STAFF-shaped caller asking BUSINESS_DOCUMENTS', async () => {
      await expect(controller.ask(staffUser, { query: 'revenue?', corpus: 'BUSINESS_DOCUMENTS' } as any)).rejects.toThrow(
        ForbiddenException,
      );
      expect(generation.answer).not.toHaveBeenCalled();
    });

    it('succeeds for KNOWLEDGE_BASE, and audits the generated answer', async () => {
      generation.answer.mockResolvedValue({ text: 'answer', citations: [{ sourceId: 's1', originalName: 'a.pdf', pageFrom: 1, pageTo: 1 }] });

      const result = await controller.ask(staffUser, { query: 'return window?', corpus: 'KNOWLEDGE_BASE' } as any);

      expect(result?.text).toBe('answer');
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'rag.answer_generated', data: expect.objectContaining({ resultSourceIds: ['s1'] }) }));
    });

    it('audits an empty resultSourceIds list when nothing was retrieved (a real "no answer")', async () => {
      generation.answer.mockResolvedValue(null);

      const result = await controller.ask(adminUser, { query: 'q', corpus: 'KNOWLEDGE_BASE' } as any);

      expect(result).toBeNull();
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ resultSourceIds: [] }) }));
    });
  });

  describe('uploadSource (H1/M4, security review)', () => {
    const file = { buffer: Buffer.from('%PDF'), originalname: 'a.pdf', mimetype: 'application/pdf' };

    it('403s a STAFF-shaped caller uploading into EMPLOYEE_DOCUMENTS', async () => {
      await expect(controller.uploadSource(staffUser, file, { corpus: 'EMPLOYEE_DOCUMENTS' } as any)).rejects.toThrow(
        ForbiddenException,
      );
      expect(corpus.createSource).not.toHaveBeenCalled();
    });

    it('succeeds for KNOWLEDGE_BASE, forcing organizationId to null regardless of the DTO (M4, security review)', async () => {
      corpus.createSource.mockResolvedValue({ id: 'src1', storageKey: 'rag-sources/a.pdf', corpus: 'KNOWLEDGE_BASE', status: 'QUEUED' });

      const result = await controller.uploadSource(staffUser, file, { corpus: 'KNOWLEDGE_BASE' } as any);

      expect(corpus.createSource).toHaveBeenCalledWith(expect.objectContaining({ organizationId: null, uploadedById: 'staff1' }));
      expect(result).not.toHaveProperty('storageKey');
    });

    it('rejects when no file is attached', async () => {
      await expect(controller.uploadSource(staffUser, undefined, { corpus: 'KNOWLEDGE_BASE' } as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('ingestNow (M12, security review)', () => {
    it('refuses when embedding is unavailable, without dispatching ingestion', async () => {
      corpus.findOne.mockResolvedValue({ id: 'src1', corpus: 'KNOWLEDGE_BASE', status: 'QUEUED' });
      retrieval.isAvailable.mockReturnValue(false);

      await expect(controller.ingestNow(adminUser, 'src1')).rejects.toThrow(ServiceUnavailableException);
      expect(ingestion.ingestOne).not.toHaveBeenCalled();
    });

    it('checks corpus access via corpus.findOne BEFORE dispatching (never claims a source the caller may not reach)', async () => {
      corpus.findOne.mockRejectedValue(new ForbiddenException("You don't have access to the EMPLOYEE_DOCUMENTS corpus."));

      await expect(controller.ingestNow(staffUser, 'src1')).rejects.toThrow(ForbiddenException);
      expect(ingestion.ingestOne).not.toHaveBeenCalled();
    });

    it('dispatches ingestion without awaiting it, and returns immediately with the current source state', async () => {
      corpus.findOne.mockResolvedValue({ id: 'src1', corpus: 'KNOWLEDGE_BASE', status: 'QUEUED', storageKey: 'k' });
      let resolveIngest!: (value: boolean) => void;
      ingestion.ingestOne.mockReturnValue(new Promise<boolean>((resolve) => { resolveIngest = resolve; }));

      const result = await controller.ingestNow(adminUser, 'src1');

      expect(result).toEqual({ accepted: true, source: expect.objectContaining({ id: 'src1', status: 'QUEUED' }) });
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'rag.ingest_triggered', entityId: 'src1' }));
      resolveIngest(true); // let the still-pending background promise settle so it doesn't leak into another test
    });
  });

  describe('permission threading (H1, security review)', () => {
    it('passes the caller\'s permissions through to corpus.list()', async () => {
      corpus.list.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
      await controller.listSources(staffUser, { page: 1, pageSize: 20 } as any);
      expect(corpus.list).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, staffUser.permissions);
    });

    it('passes the caller\'s permissions through to corpus.findOne()', async () => {
      corpus.findOne.mockResolvedValue({ id: 's1', storageKey: 'k' });
      await controller.getSource(staffUser, 's1');
      expect(corpus.findOne).toHaveBeenCalledWith('s1', staffUser.permissions);
    });

    it('passes the caller\'s permissions through to corpus.retry()', async () => {
      corpus.retry.mockResolvedValue({ id: 's1', storageKey: 'k', status: 'QUEUED' });
      await controller.retry(staffUser, 's1');
      expect(corpus.retry).toHaveBeenCalledWith('s1', staffUser.id, staffUser.permissions);
    });

    it('passes the caller\'s permissions through to corpus.deleteSource()', async () => {
      await controller.deleteSource(staffUser, 's1');
      expect(corpus.deleteSource).toHaveBeenCalledWith('s1', staffUser.id, staffUser.permissions);
    });

    it('passes the caller\'s permissions through to corpus.replaceFile()', async () => {
      corpus.replaceFile.mockResolvedValue({ id: 's1', storageKey: 'k', status: 'QUEUED' });
      const file = { buffer: Buffer.from('%PDF'), originalname: 'b.pdf', mimetype: 'application/pdf' };
      await controller.replaceSourceFile(staffUser, 's1', file);
      expect(corpus.replaceFile).toHaveBeenCalledWith('s1', expect.objectContaining({ actorId: staffUser.id, permissions: staffUser.permissions }));
    });
  });

  describe('downloadSourceFile (H2, security review)', () => {
    it('streams the file with a sanitized Content-Disposition filename, never storageKey', async () => {
      corpus.getSourceFile.mockResolvedValue({
        source: { id: 's1', originalName: 'a "quoted"; risky<name>.pdf' },
        buffer: Buffer.from('%PDF-bytes'),
      });
      const response = { setHeader: jest.fn(), send: jest.fn() };

      await controller.downloadSourceFile(staffUser, 's1', response as any);

      expect(corpus.getSourceFile).toHaveBeenCalledWith('s1', staffUser.permissions);
      expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      const disposition = response.setHeader.mock.calls.find((call: any[]) => call[0] === 'Content-Disposition')?.[1] as string;
      // The two wrapping quotes the header format itself adds are fine; a
      // stray one from the (attacker-controlled) filename is what matters.
      const innerFilename = /filename="(.*)"$/.exec(disposition)?.[1];
      expect(innerFilename).toBeDefined();
      expect(innerFilename).not.toContain('"');
      expect(innerFilename).not.toContain('<');
      expect(innerFilename).not.toContain(';');
      expect(response.send).toHaveBeenCalledWith(Buffer.from('%PDF-bytes'));
    });
  });
});
