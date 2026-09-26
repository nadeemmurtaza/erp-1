import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Prisma } from '../../core/prisma/client';
import type { DocumentChunkInput, VectorQueryFilter, VectorQueryHit, VectorStore } from './vector-store';

/**
 * WO-35.3's own (and only, today) `VectorStore` — `pgvector`, exactly
 * `09-ai-layer.md` WO-9.6's "no extra service" decision, applied to a second
 * table. Raw SQL for every statement touching `DocumentChunk.embedding`:
 * Prisma's query API has no way to read or write an `Unsupported("vector")`
 * column, the same constraint `search.service.ts` already documents for
 * `ProductTranslation.embedding` — this file mirrors that one's exact
 * idioms (`Prisma.sql`, a `[n,n,…]` vector literal, `<=>` cosine distance)
 * rather than inventing a second style for the same database feature.
 */
@Injectable()
export class PgVectorStore implements VectorStore {
  constructor(private readonly prisma: PrismaService) {}

  async upsertChunks(chunks: DocumentChunkInput[]): Promise<void> {
    if (chunks.length === 0) return;

    const sourceIds = [...new Set(chunks.map((chunk) => chunk.sourceId))];
    await this.prisma.$transaction(async (tx) => {
      // Delete-then-insert, both inside this one transaction — WO-35's own
      // idempotent-re-ingestion rule (§3): a redelivered or retried
      // ingestion job never leaves stale chunks answering alongside fresh
      // ones, and a reader never observes the moment between "old chunks
      // gone" and "new chunks written."
      await tx.documentChunk.deleteMany({ where: { sourceId: { in: sourceIds } } });

      for (const chunk of chunks) {
        const vectorLiteral = toVectorLiteral(chunk.embedding);
        await tx.$executeRaw`
          INSERT INTO "DocumentChunk"
            ("id", "sourceId", "organizationId", "corpus", "pageFrom", "pageTo", "text", "embedding", "createdAt")
          VALUES (
            ${chunk.id}, ${chunk.sourceId}, ${chunk.organizationId}, ${chunk.corpus}::"DocumentCorpus",
            ${chunk.pageFrom}, ${chunk.pageTo}, ${chunk.text}, ${vectorLiteral}::vector, now()
          );
        `;
      }
    });
  }

  /**
   * WO-35.4's own non-negotiable: `organizationId`/`corpus` are predicates
   * INSIDE this one query, never a filter applied to its results afterward
   * — the exact isolation-bug class the doc names (retrieving the nearest
   * chunks platform-wide, then discarding the wrong tenant's, still leaks
   * whatever the ranking already put in front of a human or a prompt if
   * anything downstream ever reads the unfiltered list first). `filter
   * .organizationId === null` still filters — `IS NULL`, not "no
   * restriction" — so a null-scoped caller never sees a populated-org
   * chunk and vice versa.
   */
  async query(embedding: number[], filter: VectorQueryFilter, topK: number): Promise<VectorQueryHit[]> {
    const vectorLiteral = toVectorLiteral(embedding);
    const orgFilter =
      filter.organizationId === null
        ? Prisma.sql`AND dc."organizationId" IS NULL`
        : Prisma.sql`AND dc."organizationId" = ${filter.organizationId}`;
    const corpusFilter = filter.corpus
      ? Prisma.sql`AND dc."corpus" = ${filter.corpus}::"DocumentCorpus"`
      : Prisma.empty;

    return this.prisma.$queryRaw<VectorQueryHit[]>`
      SELECT dc."id" AS "id", dc."sourceId" AS "sourceId", dc."pageFrom" AS "pageFrom",
             dc."pageTo" AS "pageTo", dc."text" AS "text",
             1 - (dc."embedding" <=> ${vectorLiteral}::vector) AS "score"
      FROM "DocumentChunk" dc
      WHERE true
        ${orgFilter}
        ${corpusFilter}
      ORDER BY dc."embedding" <=> ${vectorLiteral}::vector ASC
      LIMIT ${topK};
    `;
  }
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
