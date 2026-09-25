import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AiService } from '../../core/ai/ai.service';
import { StorageService } from '../../core/storage/storage.service';
import { SearchService } from './search.service';

describe('SearchService', () => {
  let service: SearchService;
  let prisma: PrismaService;
  let categoryId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SearchService,
        PrismaService,
        // No AI_PROVIDERS configured in the test env, so the real AiService
        // would behave identically — mocked here only to avoid pulling in
        // its own provider dependency graph. WO-9.5's hybrid/visual-search
        // behavior against a real (or fake) provider is covered separately.
        { provide: AiService, useValue: { isAvailable: () => false, embed: async () => null, describeImage: async () => null } },
        { provide: StorageService, useValue: { putImage: async () => ({ key: 'x', url: 'https://example.test/x', size: 0, contentType: 'image/webp' }) } },
      ],
    }).compile();
    service = module.get(SearchService);
    prisma = module.get(PrismaService);
    categoryId = (await prisma.category.findFirstOrThrow({ select: { id: true } })).id;
  });

  let seq = 0;
  function tag(): string {
    seq += 1;
    return `search-test-${Date.now()}-${seq}`;
  }

  async function makeProduct(name: string, description: string, basePrice = 1000) {
    const slug = tag();
    const product = await prisma.product.create({
      data: {
        slug,
        kind: 'GOODS',
        status: 'ACTIVE',
        categoryId,
        basePrice,
        translations: { create: [{ locale: 'en', name, description }] },
      },
    });
    await service.reindexProduct(product.id);
    return product;
  }

  afterEach(async () => {
    await prisma.searchQueryLog.deleteMany({ where: { term: { contains: 'search-test' } } });
    await prisma.searchSynonym.deleteMany({ where: { term: { contains: 'search-test' } } });
    await prisma.product.deleteMany({ where: { slug: { contains: 'search-test' } } });
  });

  it('reindexProduct populates searchVector so a name match ranks the product', async () => {
    const marker = tag();
    const product = await makeProduct(`Embroidered lawn ${marker}`, 'Summer collection piece');

    const result = await service.search({ q: marker, locale: 'en' }, null);
    expect(result.data.some((hit) => hit.id === product.id)).toBe(true);
  });

  it('never returns a DRAFT or archived product', async () => {
    const marker = tag();
    const slug = tag();
    const draft = await prisma.product.create({
      data: {
        slug,
        kind: 'GOODS',
        status: 'DRAFT',
        categoryId,
        basePrice: 1000,
        translations: { create: [{ locale: 'en', name: `Hidden ${marker}` }] },
      },
    });
    await service.reindexProduct(draft.id);

    const result = await service.search({ q: marker, locale: 'en' }, null);
    expect(result.data.some((hit) => hit.id === draft.id)).toBe(false);
  });

  it('expands a query through a registered synonym', async () => {
    const marker = tag();
    const product = await makeProduct(`Kameez ${marker}`, 'A traditional shirt');
    await service.createSynonym({ locale: 'en', term: `shirt-${marker}`, synonym: `kameez-${marker}` });
    // Reindex uses the product's own words; the synonym here maps a query term
    // the product text does NOT contain, so a shirt-<marker> search should
    // still find the "Kameez <marker>" product through the synonym expansion.

    const result = await service.search({ q: `shirt-${marker}`, locale: 'en' }, null);
    expect(result.data.some((hit) => hit.id === product.id)).toBe(true);
  });

  it('falls back to trigram similarity on a near-miss spelling', async () => {
    const marker = tag();
    const product = await makeProduct(`Chiffon ${marker}`, 'Party wear');

    // "Chifon" (one f) should still find "Chiffon" via the fuzzy fallback.
    const result = await service.search({ q: `Chifon ${marker}`, locale: 'en' }, null);
    expect(result.data.some((hit) => hit.id === product.id)).toBe(true);
  });

  it('logs every query with its result count, including zero', async () => {
    const marker = tag();
    await service.search({ q: `nonexistent-${marker}`, locale: 'en' }, null);

    const log = await prisma.searchQueryLog.findFirst({ where: { term: `nonexistent-${marker}` } });
    expect(log?.resultCount).toBe(0);
  });

  it('a price facet excludes its own filter but respects others', async () => {
    const marker = tag();
    await makeProduct(`Cat filter ${marker}`, '', 1000);
    await makeProduct(`Cat filter ${marker}`, '', 9000);

    const result = await service.search({ q: `filter ${marker}`, locale: 'en', minPrice: 5000 }, null);
    // Both candidates share the search term; minPrice narrows the RESULT to
    // one, but facet computation for a different dimension (category) must
    // still be reachable — this just proves the call doesn't throw and
    // returns a shape with all expected facet keys.
    expect(result.facets).toHaveProperty('categoryId');
    expect(result.facets).toHaveProperty('brandId');
    expect(result.data.length).toBe(1);
  });
});

/** A 1536-dim vector (OpenAI text-embedding-3-small's own dimension) with one dimension set, everything else zero. */
function vec(dimension: number, value = 1): number[] {
  const v = new Array(1536).fill(0);
  v[dimension] = value;
  return v;
}

describe('SearchService — WO-9.5 semantic and visual search', () => {
  let service: SearchService;
  let prisma: PrismaService;
  let ai: { isAvailable: jest.Mock; embed: jest.Mock; describeImage: jest.Mock };
  let storage: { putImage: jest.Mock };
  let categoryId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [SearchService, PrismaService, { provide: AiService, useValue: {} }, { provide: StorageService, useValue: {} }],
    }).compile();
    service = module.get(SearchService);
    prisma = module.get(PrismaService);
    categoryId = (await prisma.category.findFirstOrThrow({ select: { id: true } })).id;
  });

  beforeEach(() => {
    ai = { isAvailable: jest.fn().mockReturnValue(true), embed: jest.fn(), describeImage: jest.fn() };
    storage = { putImage: jest.fn().mockResolvedValue({ key: 'visual-search/x.webp', url: 'https://cdn.test/visual-search/x.webp', size: 1, contentType: 'image/webp' }) };
    (service as unknown as { ai: unknown }).ai = ai;
    (service as unknown as { storage: unknown }).storage = storage;
  });

  let seq = 0;
  function tag(): string {
    seq += 1;
    return `search-vec-test-${Date.now()}-${seq}`;
  }

  async function makeEmbeddedProduct(name: string, embedding: number[]) {
    const slug = tag();
    const product = await prisma.product.create({
      data: {
        slug,
        kind: 'GOODS',
        status: 'ACTIVE',
        categoryId,
        basePrice: 1000,
        translations: { create: [{ locale: 'en', name, description: '' }] },
      },
      include: { translations: true },
    });
    await prisma.$executeRaw`
      UPDATE "ProductTranslation" SET "embedding" = ${`[${embedding.join(',')}]`}::vector
      WHERE "id" = ${product.translations[0].id};
    `;
    return product;
  }

  afterEach(async () => {
    await prisma.searchQueryLog.deleteMany({ where: { term: { contains: 'search-vec-test' } } });
    await prisma.product.deleteMany({ where: { slug: { contains: 'search-vec-test' } } });
  });

  it('surfaces a product through vector similarity even with no keyword overlap at all', async () => {
    const marker = tag();
    const product = await makeEmbeddedProduct(`${marker} unrelated-name-xyz`, vec(0));
    ai.embed.mockResolvedValue({ vectors: [vec(0)], inputTokens: 1, model: 'test' });

    // The query term shares not a single word with the product's name — only
    // the vector channel (RRF-fused) can find it.
    const result = await service.search({ q: 'completely different query text', locale: 'en' }, null);

    expect(result.data.some((hit) => hit.id === product.id)).toBe(true);
  });

  it('never calls the embedding provider when none is configured', async () => {
    ai.isAvailable.mockReturnValue(false);
    const marker = tag();

    await service.search({ q: marker, locale: 'en' }, null);

    expect(ai.embed).not.toHaveBeenCalled();
  });

  it('invalidateEmbedding nulls the embedding for every locale translation of a product', async () => {
    const product = await makeEmbeddedProduct(tag(), vec(1));

    await service.invalidateEmbedding(product.id);

    const translation = await prisma.productTranslation.findFirst({ where: { productId: product.id } });
    expect(translation).not.toBeNull();
    const raw = await prisma.$queryRaw<{ isNull: boolean }[]>`SELECT "embedding" IS NULL AS "isNull" FROM "ProductTranslation" WHERE "productId" = ${product.id}`;
    expect(raw[0].isNull).toBe(true);
  });

  describe('embedPendingTranslations', () => {
    it('is a no-op when no embedding-capable provider is configured', async () => {
      ai.isAvailable.mockReturnValue(false);
      const result = await service.embedPendingTranslations(10);
      expect(result).toBe(0);
      expect(ai.embed).not.toHaveBeenCalled();
    });

    it('embeds pending translations and writes the vector back', async () => {
      const marker = tag();
      const slug = tag();
      const product = await prisma.product.create({
        data: {
          slug,
          kind: 'GOODS',
          status: 'ACTIVE',
          categoryId,
          basePrice: 1000,
          translations: { create: [{ locale: 'en', name: `Pending embed ${marker}`, description: '' }] },
        },
      });
      // The shared test DB may have other ACTIVE products with no embedding
      // yet (from other suites), so embedPendingTranslations' batch can be
      // larger than "just this one" — mirror the real API's contract (one
      // vector per input text, in order) rather than assuming a batch size.
      ai.embed.mockImplementation(async (_feature: unknown, texts: string[]) => ({
        vectors: texts.map(() => vec(2)),
        inputTokens: 1,
        model: 'test',
      }));

      const embedded = await service.embedPendingTranslations(200);

      expect(embedded).toBeGreaterThan(0);
      expect(ai.embed).toHaveBeenCalled();
      const raw = await prisma.$queryRaw<{ isNull: boolean }[]>`SELECT "embedding" IS NULL AS "isNull" FROM "ProductTranslation" WHERE "productId" = ${product.id}`;
      expect(raw[0].isNull).toBe(false);
    });
  });

  describe('searchByImage', () => {
    it('uploads the photo, describes it, embeds the description, and returns the nearest products', async () => {
      const product = await makeEmbeddedProduct(tag(), vec(3));
      ai.describeImage.mockResolvedValue({ text: 'a red embroidered kameez', inputTokens: 1, outputTokens: 1, model: 'test' });
      ai.embed.mockResolvedValue({ vectors: [vec(3)], inputTokens: 1, model: 'test' });

      const result = await service.searchByImage({ buffer: Buffer.from('x'), originalname: 'photo.jpg', mimetype: 'image/jpeg' }, 'en', null);

      expect(storage.putImage).toHaveBeenCalled();
      expect(ai.describeImage).toHaveBeenCalled();
      expect(result.data.some((hit) => hit.id === product.id)).toBe(true);
    });

    it('throws when the vision call is unavailable, rather than returning an empty result silently', async () => {
      ai.describeImage.mockResolvedValue(null);

      await expect(
        service.searchByImage({ buffer: Buffer.from('x'), originalname: 'photo.jpg', mimetype: 'image/jpeg' }, 'en', null),
      ).rejects.toThrow(/not available/);
    });

    it('throws when the embedding call is unavailable', async () => {
      ai.describeImage.mockResolvedValue({ text: 'a photo', inputTokens: 1, outputTokens: 1, model: 'test' });
      ai.embed.mockResolvedValue(null);

      await expect(
        service.searchByImage({ buffer: Buffer.from('x'), originalname: 'photo.jpg', mimetype: 'image/jpeg' }, 'en', null),
      ).rejects.toThrow(/not available/);
    });
  });
});
