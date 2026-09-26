import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AiService } from '../../core/ai/ai.service';
import { RagRetrievalService } from './rag-retrieval.service';
import { VECTOR_STORE } from './vector-store';

describe('RagRetrievalService', () => {
  let service: RagRetrievalService;
  let ai: { isAvailable: jest.Mock; embed: jest.Mock };
  let vectorStore: { query: jest.Mock };

  beforeEach(async () => {
    ai = { isAvailable: jest.fn(), embed: jest.fn() };
    vectorStore = { query: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        RagRetrievalService,
        { provide: AiService, useValue: ai },
        { provide: VECTOR_STORE, useValue: vectorStore },
      ],
    }).compile();
    service = module.get(RagRetrievalService);
  });

  describe('isAvailable', () => {
    it('mirrors AiService.isAvailable("embed") — the absent-collaborator gate', () => {
      ai.isAvailable.mockReturnValue(true);
      expect(service.isAvailable()).toBe(true);
      expect(ai.isAvailable).toHaveBeenCalledWith('embed');
    });
  });

  describe('retrieve', () => {
    it('embeds the query, then scopes the vector query by organizationId and corpus', async () => {
      ai.embed.mockResolvedValue({ vectors: [[1, 2, 3]], inputTokens: 5, model: 'x' });
      vectorStore.query.mockResolvedValue([{ id: 'c1', sourceId: 's1', pageFrom: 1, pageTo: 1, text: 't', score: 0.9 }]);

      const hits = await service.retrieve('what is the return policy', { organizationId: 'org1', corpus: 'KNOWLEDGE_BASE' }, 5);

      expect(ai.embed).toHaveBeenCalledWith('RAG_RETRIEVAL', ['what is the return policy']);
      expect(vectorStore.query).toHaveBeenCalledWith([1, 2, 3], { organizationId: 'org1', corpus: 'KNOWLEDGE_BASE' }, 5);
      expect(hits).toHaveLength(1);
    });

    it('degrades to ServiceUnavailableException — never a bare 500 — when embedding fails (no provider, budget exhausted, timeout)', async () => {
      ai.embed.mockResolvedValue(null);

      await expect(service.retrieve('query', { organizationId: null, corpus: 'KNOWLEDGE_BASE' })).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(vectorStore.query).not.toHaveBeenCalled();
    });

    it('degrades to ServiceUnavailableException — never a raw 500 — when the vector store itself throws (L16, security review)', async () => {
      ai.embed.mockResolvedValue({ vectors: [[1, 2, 3]], inputTokens: 5, model: 'x' });
      vectorStore.query.mockRejectedValue(new Error('connection reset'));

      await expect(service.retrieve('query', { organizationId: null, corpus: 'KNOWLEDGE_BASE' })).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('scopes to organizationId: null for a Solo/Chain deployment', async () => {
      ai.embed.mockResolvedValue({ vectors: [[0]], inputTokens: 1, model: 'x' });
      vectorStore.query.mockResolvedValue([]);

      await service.retrieve('query', { organizationId: null, corpus: 'SUPPLIER_CATALOG' });

      expect(vectorStore.query).toHaveBeenCalledWith([0], { organizationId: null, corpus: 'SUPPLIER_CATALOG' }, 8);
    });
  });
});
