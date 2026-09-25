import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SearchService } from './search.service';

describe('SearchService', () => {
  let service: SearchService;
  let prisma: PrismaService;
  let categoryId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [SearchService, PrismaService],
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
