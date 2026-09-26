import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PgVectorStore } from './pg-vector.store';
import type { DocumentChunkInput } from './vector-store';

const DIMENSIONS = 1536;

/** A unit vector with a 1 at `axis` and 0 everywhere else — lets a test control exactly which chunk is the "closer" match by cosine distance. */
function axisVector(axis: number): number[] {
  const vector = new Array(DIMENSIONS).fill(0);
  vector[axis] = 1;
  return vector;
}

/**
 * Real Postgres, real pgvector — same "a plain `.spec.ts`, a real
 * `PrismaService`, no HTTP app" shape `rfm-scoring.cron.spec.ts` already
 * uses. This is WO-35.4's own acceptance proof: "A query scoped to
 * organization A never returns a chunk whose DocumentSource.organizationId
 * is B — proven by a spec that seeds both and asserts on the boundary, the
 * same isolation proof 16-pbac-row-scoping.md already requires elsewhere."
 * A mocked `$queryRaw` could only prove the SQL string was BUILT correctly;
 * this proves pgvector actually ENFORCES it.
 */
describe('PgVectorStore', () => {
  let prisma: PrismaService;
  let store: PgVectorStore;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ providers: [PgVectorStore, PrismaService] }).compile();
    store = module.get(PgVectorStore);
    prisma = module.get(PrismaService);
  });

  let seq = 0;
  function tag(): string {
    seq += 1;
    return `rag-pgvector-test-${Date.now()}-${seq}`;
  }

  async function createSource(
    organizationId: string | null,
    corpus: 'KNOWLEDGE_BASE' | 'EMPLOYEE_DOCUMENTS' | 'SUPPLIER_CATALOG' = 'KNOWLEDGE_BASE',
  ) {
    return prisma.documentSource.create({
      data: {
        organizationId,
        corpus,
        storageKey: tag(),
        originalName: `${tag()}.pdf`,
        status: 'READY',
      },
    });
  }

  afterEach(async () => {
    await prisma.documentSource.deleteMany({ where: { storageKey: { contains: 'rag-pgvector-test' } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('isolation (WO-35.4 acceptance)', () => {
    it('never returns organization B\'s chunk on a query scoped to organization A, even though B is the closer match', async () => {
      const sourceA = await createSource('org-A');
      const sourceB = await createSource('org-B');

      const queryEmbedding = axisVector(0);
      await store.upsertChunks([
        chunk(sourceA, 'org-A', 'KNOWLEDGE_BASE', axisVector(500)), // deliberately the FAR match
        chunk(sourceB, 'org-B', 'KNOWLEDGE_BASE', axisVector(0)), // deliberately the CLOSE match — the one a broken post-filter would leak
      ]);

      const resultsForA = await store.query(queryEmbedding, { organizationId: 'org-A' }, 10);
      expect(resultsForA).toHaveLength(1);
      expect(resultsForA[0].sourceId).toBe(sourceA.id);

      const resultsForB = await store.query(queryEmbedding, { organizationId: 'org-B' }, 10);
      expect(resultsForB).toHaveLength(1);
      expect(resultsForB[0].sourceId).toBe(sourceB.id);
      // The isolation proof itself: B's own (far) query embedding still only
      // ever surfaces B's own chunk — A's objectively closer chunk never
      // appears for a caller scoped to B.
      expect(resultsForA.some((hit) => hit.sourceId === sourceB.id)).toBe(false);
      expect(resultsForB.some((hit) => hit.sourceId === sourceA.id)).toBe(false);
    });

    it('a null-scoped (Solo/Chain) query never returns a populated-organizationId chunk, and vice versa', async () => {
      const sourceNull = await createSource(null);
      const sourceOrg = await createSource('org-C');
      const embedding = axisVector(1);

      await store.upsertChunks([
        chunk(sourceNull, null, 'KNOWLEDGE_BASE', embedding),
        chunk(sourceOrg, 'org-C', 'KNOWLEDGE_BASE', embedding),
      ]);

      const nullScoped = await store.query(embedding, { organizationId: null }, 10);
      expect(nullScoped.map((h) => h.sourceId)).toEqual([sourceNull.id]);

      const orgScoped = await store.query(embedding, { organizationId: 'org-C' }, 10);
      expect(orgScoped.map((h) => h.sourceId)).toEqual([sourceOrg.id]);
    });

    it('an HR assistant scoped to EMPLOYEE_DOCUMENTS never surfaces a SUPPLIER_CATALOG chunk in the same (or absent) organization', async () => {
      const hrSource = await createSource(null, 'EMPLOYEE_DOCUMENTS');
      const supplierSource = await createSource(null, 'SUPPLIER_CATALOG');
      const embedding = axisVector(2);

      await store.upsertChunks([
        chunk(hrSource, null, 'EMPLOYEE_DOCUMENTS', embedding),
        chunk(supplierSource, null, 'SUPPLIER_CATALOG', embedding),
      ]);

      const hrResults = await store.query(embedding, { organizationId: null, corpus: 'EMPLOYEE_DOCUMENTS' }, 10);
      expect(hrResults.map((h) => h.sourceId)).toEqual([hrSource.id]);
    });
  });

  describe('idempotent re-ingestion (WO-35.2/35.3 acceptance)', () => {
    it('replaces a source\'s chunks with no duplicates and no stale survivors', async () => {
      const source = await createSource(null);

      await store.upsertChunks([
        chunk(source, null, 'KNOWLEDGE_BASE', axisVector(0), 'v1-a'),
        chunk(source, null, 'KNOWLEDGE_BASE', axisVector(1), 'v1-b'),
      ]);
      const afterFirst = await prisma.documentChunk.count({ where: { sourceId: source.id } });
      expect(afterFirst).toBe(2);

      // Re-ingestion: a corrected PDF re-uploaded produces a different chunk set.
      await store.upsertChunks([chunk(source, null, 'KNOWLEDGE_BASE', axisVector(2), 'v2-a')]);

      const rows = await prisma.documentChunk.findMany({ where: { sourceId: source.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].text).toBe('v2-a');
    });

    it('a no-op call (zero chunks) never deletes an existing source\'s chunks', async () => {
      const source = await createSource(null);
      await store.upsertChunks([chunk(source, null, 'KNOWLEDGE_BASE', axisVector(0))]);

      await store.upsertChunks([]);

      const count = await prisma.documentChunk.count({ where: { sourceId: source.id } });
      expect(count).toBe(1);
    });
  });
});

function chunk(
  source: { id: string },
  organizationId: string | null,
  corpus: 'KNOWLEDGE_BASE' | 'EMPLOYEE_DOCUMENTS' | 'SUPPLIER_CATALOG',
  embedding: number[],
  text = 'chunk text',
): DocumentChunkInput {
  return {
    id: `${source.id}-${Math.random().toString(36).slice(2)}`,
    sourceId: source.id,
    organizationId,
    corpus,
    pageFrom: 1,
    pageTo: 1,
    text,
    embedding,
  };
}
