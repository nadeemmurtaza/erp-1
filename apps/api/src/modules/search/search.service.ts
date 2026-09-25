import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { isLocale } from '@newax/shared';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AiService } from '../../core/ai/ai.service';
import { StorageService } from '../../core/storage/storage.service';
import { AiFeature, Prisma } from '../../core/prisma/client';
import type { CreateSynonymDto, SearchQueryDto } from './dto/search.dto';

const CANDIDATE_LIMIT = 500;
const VISUAL_SEARCH_LIMIT = 24;
/** Reciprocal Rank Fusion constant — the standard IR default, not a tuned value. */
const RRF_K = 60;
const VISUAL_SEARCH_PROMPT =
  'Describe this product photo in one or two plain sentences for a search query: garment or item ' +
  'type, colour, fabric or material texture, pattern, and style. Do not mention that it is a photo.';

interface RankedId {
  productId: string;
  rank: number;
}

/**
 * Merges ranked candidate lists into one score per id, by RANK POSITION
 * rather than raw score — ts_rank (small floats, unbounded) and cosine
 * similarity (0-1) are not on comparable scales, and RRF sidesteps having to
 * normalise them against each other. Standard IR technique, not invented
 * here.
 */
function reciprocalRankFusion(lists: RankedId[][]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((item, index) => {
      scores.set(item.productId, (scores.get(item.productId) ?? 0) + 1 / (RRF_K + index + 1));
    });
  }
  return scores;
}

const productInclude = {
  translations: true,
  images: { where: { isPrimary: true }, take: 1 },
  brand: { include: { translations: true } },
  category: { include: { translations: true } },
} satisfies Prisma.ProductInclude;

/**
 * WO-8.3. Postgres full-text search, not Elasticsearch — the doc's own
 * instruction. Full-text matching (ts_rank, the tsvector column) and
 * catalogue filtering/faceting are deliberately two phases: the first is raw
 * SQL against ProductTranslation.searchVector (Prisma has no query builder
 * for tsvector), the second is ordinary Prisma `where`/`groupBy` on Product
 * — keeping the one part that has to be raw SQL as small as possible.
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly storage: StorageService,
  ) {}

  // --- Indexing -----------------------------------------------------------

  /** Recomputes searchVector for every locale translation of one product. */
  async reindexProduct(productId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "ProductTranslation" pt
      SET "searchVector" = sub."vector"
      FROM (
        SELECT
          pt2."id" AS "pt_id",
          setweight(to_tsvector(CASE WHEN pt2."locale" = 'en' THEN 'english'::regconfig ELSE 'simple'::regconfig END, coalesce(pt2."name", '')), 'A') ||
          setweight(to_tsvector(
            CASE WHEN pt2."locale" = 'en' THEN 'english'::regconfig ELSE 'simple'::regconfig END,
            coalesce(array_to_string(p."tags", ' '), '') || ' ' || coalesce(bt."name", '') || ' ' || coalesce(ct."name", '') || ' ' || coalesce(p."fabric", '')
          ), 'B') ||
          setweight(to_tsvector(CASE WHEN pt2."locale" = 'en' THEN 'english'::regconfig ELSE 'simple'::regconfig END, coalesce(pt2."description", '')), 'C')
            AS "vector"
        FROM "ProductTranslation" pt2
        JOIN "Product" p ON p."id" = pt2."productId"
        LEFT JOIN "Brand" b ON b."id" = p."brandId"
        LEFT JOIN "BrandTranslation" bt ON bt."brandId" = b."id" AND bt."locale" = pt2."locale"
        LEFT JOIN "Category" c ON c."id" = p."categoryId"
        LEFT JOIN "CategoryTranslation" ct ON ct."categoryId" = c."id" AND ct."locale" = pt2."locale"
        WHERE p."id" = ${productId}
      ) sub
      WHERE sub."pt_id" = pt."id";
    `;
  }

  /** WO-9.5 — nulls the (now stale) embedding for every locale translation of one product; SearchEmbeddingCron re-embeds it. */
  async invalidateEmbedding(productId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "ProductTranslation" SET "embedding" = NULL WHERE "productId" = ${productId};
    `;
  }

  // --- Public search --------------------------------------------------------

  async search(query: SearchQueryDto, userId: string | null) {
    const locale = query.locale && isLocale(query.locale) ? query.locale : 'en';
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 24, 100);
    const term = query.q?.trim();

    let rankById: Map<string, number> | null = null;
    if (term) {
      // WO-9.5 — hybrid ranking: ts_rank and vector similarity run
      // concurrently and are fused by rank position (RRF), never one
      // replacing the other. "Pure vector search is worse than keyword
      // search for exact SKU and brand lookups" (the doc's own words) is
      // exactly why this is a fusion, not a fallback chain, whenever both
      // sources return anything at all.
      const [keyword, vector] = await Promise.all([
        this.rankedMatch(term, locale),
        this.vectorCandidatesForText(term, locale),
      ]);

      if (keyword.length > 0 || vector.length > 0) {
        rankById = reciprocalRankFusion([keyword, vector]);
      } else {
        const fuzzy = await this.fuzzyMatch(term, locale);
        rankById = new Map(fuzzy.map((r) => [r.productId, r.rank]));
      }
    }

    const baseWhere = this.buildWhere(query, rankById ? [...rankById.keys()] : null);
    const [products, total, facets] = await Promise.all([
      this.prisma.product.findMany({ where: baseWhere, include: productInclude }),
      this.prisma.product.count({ where: baseWhere }),
      this.computeFacets(query, rankById ? [...rankById.keys()] : null),
    ]);

    const sorted = rankById
      ? [...products].sort((a, b) => (rankById!.get(b.id) ?? 0) - (rankById!.get(a.id) ?? 0))
      : [...products].sort((a, b) => b.featuredRank - a.featuredRank);
    const page_ = sorted.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

    await this.prisma.searchQueryLog.create({
      data: { locale, term: term ?? '', resultCount: total, userId },
    });

    return {
      data: page_.map((p) => this.toHit(p, locale)),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      facets,
    };
  }

  private toHit(product: Prisma.ProductGetPayload<{ include: typeof productInclude }>, locale: string) {
    const translation =
      product.translations.find((t) => t.locale === locale) ?? product.translations.find((t) => t.locale === 'en');
    return {
      id: product.id,
      slug: product.slug,
      name: translation?.name ?? product.slug,
      basePrice: product.basePrice,
      compareAtPrice: product.compareAtPrice,
      imageUrl: product.images[0]?.url ?? null,
      brand: product.brand ? pickName(product.brand.translations, locale) : null,
      category: product.category ? pickName(product.category.translations, locale) : null,
    };
  }

  /**
   * ts_rank over the tsvector column, expanded with any matching synonyms.
   * Every word (the term itself and each synonym alternate) goes through
   * plainto_tsquery as an ordinary bound parameter — never string-built into
   * the query — and the resulting tsquery VALUES are OR'd together with `||`,
   * so a synonym phrase with punctuation can never break the query syntax.
   */
  private async rankedMatch(term: string, locale: string): Promise<RankedId[]> {
    const config = locale === 'en' ? 'english' : 'simple';
    const synonyms = await this.prisma.searchSynonym.findMany({
      where: { locale, OR: [{ term: { equals: term, mode: 'insensitive' } }, { synonym: { equals: term, mode: 'insensitive' } }] },
    });
    const alternates = Array.from(
      new Set(synonyms.flatMap((s) => [s.term, s.synonym]).filter((w) => w.toLowerCase() !== term.toLowerCase())),
    );

    const words = [term, ...alternates];
    const tsqueryFragments = words.map((word) => Prisma.sql`plainto_tsquery(${config}::regconfig, ${word})`);
    const combinedQuery = Prisma.join(tsqueryFragments, ' || ');

    const rows = await this.prisma.$queryRaw<{ productId: string; rank: number }[]>`
      SELECT pt."productId" AS "productId", ts_rank(pt."searchVector", (${combinedQuery})) AS rank
      FROM "ProductTranslation" pt
      JOIN "Product" p ON p."id" = pt."productId"
      WHERE pt."locale" = ${locale}
        AND p."status" = 'ACTIVE'
        AND pt."searchVector" @@ (${combinedQuery})
      ORDER BY rank DESC
      LIMIT ${CANDIDATE_LIMIT};
    `;
    return rows;
  }

  /** Trigram similarity fallback — typo tolerance when the tsquery matched nothing. */
  private async fuzzyMatch(term: string, locale: string): Promise<RankedId[]> {
    const rows = await this.prisma.$queryRaw<{ productId: string; rank: number }[]>`
      SELECT pt."productId" AS "productId", similarity(pt."name", ${term}) AS rank
      FROM "ProductTranslation" pt
      JOIN "Product" p ON p."id" = pt."productId"
      WHERE pt."locale" = ${locale}
        AND p."status" = 'ACTIVE'
        AND similarity(pt."name", ${term}) > 0.2
      ORDER BY rank DESC
      LIMIT ${CANDIDATE_LIMIT};
    `;
    return rows;
  }

  // --- Semantic and visual search (WO-9.5) -----------------------------------

  /** Embeds `term` and runs vectorMatch — [] whenever no embedding provider is configured or the call fails, never thrown. */
  private async vectorCandidatesForText(term: string, locale: string): Promise<RankedId[]> {
    if (!this.ai.isAvailable('embed')) return [];
    const result = await this.ai.embed(AiFeature.SEMANTIC_SEARCH, [term]);
    if (!result) return [];
    return this.vectorMatch(result.vectors[0], locale, CANDIDATE_LIMIT);
  }

  /** Cosine similarity (pgvector `<=>`) against every embedded translation in `locale`, nearest first. */
  private async vectorMatch(embedding: number[], locale: string, limit: number): Promise<RankedId[]> {
    const vectorLiteral = `[${embedding.join(',')}]`;
    const rows = await this.prisma.$queryRaw<{ productId: string; rank: number }[]>`
      SELECT pt."productId" AS "productId", 1 - (pt."embedding" <=> ${vectorLiteral}::vector) AS rank
      FROM "ProductTranslation" pt
      JOIN "Product" p ON p."id" = pt."productId"
      WHERE pt."locale" = ${locale}
        AND p."status" = 'ACTIVE'
        AND pt."embedding" IS NOT NULL
      ORDER BY pt."embedding" <=> ${vectorLiteral}::vector ASC
      LIMIT ${limit};
    `;
    return rows;
  }

  /**
   * Upload a photo, find the nearest products (WO-9.5's own words). There is
   * no direct image-embedding call in this codebase's AiProvider extension
   * point — only `describeImage` (vision -> text) and `embed` (text ->
   * vector) — so this describes the photo, embeds that description, and
   * compares it against the SAME ProductTranslation.embedding space text
   * search already uses, rather than standing up a second, separate
   * image-embedding pipeline the doc's own "no extra service" framing argues
   * against.
   */
  async searchByImage(file: { buffer: Buffer; originalname: string; mimetype: string }, locale: string, userId: string | null) {
    const stored = await this.storage.putImage({
      folder: 'visual-search',
      filename: file.originalname,
      contentType: file.mimetype,
      body: file.buffer,
    });

    const described = await this.ai.describeImage(AiFeature.VISUAL_SEARCH, stored.url, VISUAL_SEARCH_PROMPT);
    if (!described) {
      throw new ServiceUnavailableException('Photo search is not available right now — try searching by text instead.');
    }
    const embedded = await this.ai.embed(AiFeature.VISUAL_SEARCH, [described.text]);
    if (!embedded) {
      throw new ServiceUnavailableException('Photo search is not available right now — try searching by text instead.');
    }

    const matches = await this.vectorMatch(embedded.vectors[0], locale, VISUAL_SEARCH_LIMIT);
    const products = await this.prisma.product.findMany({
      where: { id: { in: matches.map((m) => m.productId) }, status: 'ACTIVE' },
      include: productInclude,
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const ordered = matches
      .map((m) => byId.get(m.productId))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);

    await this.prisma.searchQueryLog.create({
      data: { locale, term: '[photo search]', resultCount: ordered.length, userId },
    });

    return {
      data: ordered.map((p) => this.toHit(p, locale)),
      meta: { page: 1, pageSize: ordered.length, total: ordered.length, totalPages: 1 },
    };
  }

  /**
   * "Re-embed on product change, in the background, batched" (the doc's own
   * words) — SearchEmbeddingCron calls this on a timer; SearchReindexListener
   * only ever nulls `embedding` out (cheap, synchronous, alongside
   * searchVector), it never calls the AI provider itself. A no-op (returns 0)
   * whenever no embedding-capable provider is configured, same "start
   * without a model" contract as every other WO-9.x feature.
   */
  async embedPendingTranslations(batchSize: number): Promise<number> {
    if (!this.ai.isAvailable('embed')) return 0;

    const pending = await this.prisma.$queryRaw<{ id: string; text: string }[]>`
      SELECT pt."id" AS "id",
        coalesce(pt."name", '') || '. ' ||
        coalesce(p."fabric", '') || ' ' || coalesce(array_to_string(p."tags", ' '), '') || ' ' ||
        coalesce(bt."name", '') || ' ' || coalesce(ct."name", '') || '. ' ||
        coalesce(pt."description", '') AS "text"
      FROM "ProductTranslation" pt
      JOIN "Product" p ON p."id" = pt."productId"
      LEFT JOIN "Brand" b ON b."id" = p."brandId"
      LEFT JOIN "BrandTranslation" bt ON bt."brandId" = b."id" AND bt."locale" = pt."locale"
      LEFT JOIN "Category" c ON c."id" = p."categoryId"
      LEFT JOIN "CategoryTranslation" ct ON ct."categoryId" = c."id" AND ct."locale" = pt."locale"
      WHERE pt."embedding" IS NULL AND p."status" = 'ACTIVE'
      LIMIT ${batchSize};
    `;
    if (pending.length === 0) return 0;

    const result = await this.ai.embed(AiFeature.SEMANTIC_SEARCH, pending.map((p) => p.text));
    if (!result) return 0;

    for (let i = 0; i < pending.length; i += 1) {
      const vectorLiteral = `[${result.vectors[i].join(',')}]`;
      await this.prisma.$executeRaw`
        UPDATE "ProductTranslation" SET "embedding" = ${vectorLiteral}::vector WHERE "id" = ${pending[i].id};
      `;
    }
    return pending.length;
  }

  private buildWhere(query: SearchQueryDto, matchedIds: string[] | null, excludeDimension?: string): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = { status: 'ACTIVE' };
    if (matchedIds) where.id = { in: matchedIds };
    if (query.category && excludeDimension !== 'category') where.categoryId = query.category;
    if (query.brand && excludeDimension !== 'brand') where.brandId = query.brand;
    if (query.fabric && excludeDimension !== 'fabric') where.fabric = query.fabric;
    if (query.season && excludeDimension !== 'season') where.season = query.season;
    if (query.inStock && excludeDimension !== 'inStock') where.variants = { some: { stock: { gt: 0 }, isActive: true } };
    if ((query.minPrice !== undefined || query.maxPrice !== undefined) && excludeDimension !== 'price') {
      where.basePrice = { ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}), ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}) };
    }
    return where;
  }

  /**
   * One dimension's counts reflect every OTHER active filter, never its own
   * — the doc's own requirement. Size/colour faceting is a named, sequenced
   * follow-on: both need a ProductVariant/ProductOptionValue join beyond
   * product-level filtering, not built here (Phase 8 status note).
   */
  private async computeFacets(query: SearchQueryDto, matchedIds: string[] | null) {
    const [categories, brands, fabrics, seasons] = await Promise.all([
      this.prisma.product.groupBy({ by: ['categoryId'], where: { ...this.buildWhere(query, matchedIds, 'category'), categoryId: { not: null } }, _count: true }),
      this.prisma.product.groupBy({ by: ['brandId'], where: { ...this.buildWhere(query, matchedIds, 'brand'), brandId: { not: null } }, _count: true }),
      this.prisma.product.groupBy({ by: ['fabric'], where: { ...this.buildWhere(query, matchedIds, 'fabric'), fabric: { not: null } }, _count: true }),
      this.prisma.product.groupBy({ by: ['season'], where: { ...this.buildWhere(query, matchedIds, 'season'), season: { not: null } }, _count: true }),
    ]);
    const inStockCount = await this.prisma.product.count({
      where: { ...this.buildWhere(query, matchedIds, 'inStock'), variants: { some: { stock: { gt: 0 }, isActive: true } } },
    });

    return {
      categoryId: categories.map((c) => ({ value: c.categoryId, count: c._count })),
      brandId: brands.map((b) => ({ value: b.brandId, count: b._count })),
      fabric: fabrics.map((f) => ({ value: f.fabric, count: f._count })),
      season: seasons.map((s) => ({ value: s.season, count: s._count })),
      inStock: inStockCount,
    };
  }

  // --- Synonyms (admin) -----------------------------------------------------

  listSynonyms(locale?: string) {
    return this.prisma.searchSynonym.findMany({ where: locale ? { locale } : undefined, orderBy: { term: 'asc' } });
  }

  createSynonym(dto: CreateSynonymDto) {
    return this.prisma.searchSynonym.create({ data: dto });
  }

  async deleteSynonym(id: string): Promise<void> {
    await this.prisma.searchSynonym.delete({ where: { id } });
  }

  // --- Zero-result report (admin) --------------------------------------------

  /** The single most useful merchandising report there is — the doc's own words. */
  async zeroResultReport(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60_000);
    const rows = await this.prisma.searchQueryLog.groupBy({
      by: ['term', 'locale'],
      where: { resultCount: 0, createdAt: { gte: since }, term: { not: '' } },
      _count: { term: true },
      orderBy: { _count: { term: 'desc' } },
      take: 100,
    });
    return rows.map((r) => ({ term: r.term, locale: r.locale, count: r._count.term }));
  }
}

function pickName(translations: { locale: string; name: string }[], locale: string): string | null {
  return translations.find((t) => t.locale === locale)?.name ?? translations[0]?.name ?? null;
}
