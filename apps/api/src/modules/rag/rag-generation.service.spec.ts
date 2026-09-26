import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AiService } from '../../core/ai/ai.service';
import { RagRetrievalService } from './rag-retrieval.service';
import { RagGenerationService } from './rag-generation.service';

describe('RagGenerationService', () => {
  let service: RagGenerationService;
  let prisma: { documentSource: { findMany: jest.Mock } };
  let ai: { isAvailable: jest.Mock; complete: jest.Mock };
  let retrieval: { retrieve: jest.Mock };

  beforeEach(async () => {
    prisma = { documentSource: { findMany: jest.fn() } };
    ai = { isAvailable: jest.fn(), complete: jest.fn() };
    retrieval = { retrieve: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        RagGenerationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: ai },
        { provide: RagRetrievalService, useValue: retrieval },
      ],
    }).compile();
    service = module.get(RagGenerationService);
  });

  describe('answer', () => {
    it('returns null (a real "no answer") when nothing was retrieved — never fabricates one', async () => {
      retrieval.retrieve.mockResolvedValue([]);

      const result = await service.answer('anything', { organizationId: null, corpus: 'KNOWLEDGE_BASE' });

      expect(result).toBeNull();
      expect(ai.complete).not.toHaveBeenCalled();
    });

    it('never returns a bare answer with no citation — every hit handed to the model is listed', async () => {
      retrieval.retrieve.mockResolvedValue([
        { id: 'c1', sourceId: 's1', pageFrom: 3, pageTo: 4, text: 'Returns accepted within 14 days.', score: 0.9 },
        { id: 'c2', sourceId: 's2', pageFrom: 1, pageTo: 1, text: 'Damaged goods policy.', score: 0.8 },
      ]);
      prisma.documentSource.findMany.mockResolvedValue([
        { id: 's1', originalName: 'return-policy.pdf' },
        { id: 's2', originalName: 'damage-policy.pdf' },
      ]);
      ai.complete.mockResolvedValue({ text: 'You may return within 14 days [1].', inputTokens: 10, outputTokens: 5, model: 'x' });

      const result = await service.answer('what is the return window', { organizationId: 'org1', corpus: 'KNOWLEDGE_BASE' });

      expect(result?.text).toBe('You may return within 14 days [1].');
      expect(result?.citations).toEqual([
        { sourceId: 's1', originalName: 'return-policy.pdf', pageFrom: 3, pageTo: 4 },
        { sourceId: 's2', originalName: 'damage-policy.pdf', pageFrom: 1, pageTo: 1 },
      ]);
    });

    it('degrades to ServiceUnavailableException when completion is unavailable, having already retrieved real chunks', async () => {
      retrieval.retrieve.mockResolvedValue([{ id: 'c1', sourceId: 's1', pageFrom: 1, pageTo: 1, text: 't', score: 0.5 }]);
      prisma.documentSource.findMany.mockResolvedValue([{ id: 's1', originalName: 'doc.pdf' }]);
      ai.complete.mockResolvedValue(null);

      await expect(service.answer('q', { organizationId: null, corpus: 'KNOWLEDGE_BASE' })).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('propagates retrieval\'s own ServiceUnavailableException unchanged', async () => {
      retrieval.retrieve.mockRejectedValue(new ServiceUnavailableException('nope'));

      await expect(service.answer('q', { organizationId: null, corpus: 'KNOWLEDGE_BASE' })).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('isAvailable', () => {
    it('requires both embed and complete capability', () => {
      ai.isAvailable.mockImplementation((cap: string) => cap === 'embed');
      expect(service.isAvailable()).toBe(false);
    });
  });
});
