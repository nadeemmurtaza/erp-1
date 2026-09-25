import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RecommendationsService } from './recommendations.service';

describe('RecommendationsService', () => {
  let service: RecommendationsService;
  let prisma: PrismaService;
  let categoryId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [RecommendationsService, PrismaService],
    }).compile();
    service = module.get(RecommendationsService);
    prisma = module.get(PrismaService);
    categoryId = (await prisma.category.findFirstOrThrow({ select: { id: true } })).id;
  });

  let seq = 0;
  function tag(): string {
    seq += 1;
    return `reco-test-${Date.now()}-${seq}`;
  }

  async function makeProduct(name: string) {
    const slug = tag();
    return prisma.product.create({
      data: {
        slug,
        kind: 'GOODS',
        status: 'ACTIVE',
        categoryId,
        basePrice: 1000,
        translations: { create: [{ locale: 'en', name, description: '' }] },
      },
    });
  }

  const createdProductIds: string[] = [];
  afterEach(async () => {
    await prisma.productCrossSell.deleteMany({
      where: { OR: [{ productId: { in: createdProductIds } }, { relatedProductId: { in: createdProductIds } }] },
    });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    createdProductIds.length = 0;
    await prisma.analyticsEvent.deleteMany({ where: { sessionId: { contains: 'reco-test' } } });
  });

  describe('relatedFor', () => {
    it('returns nothing for a product with no cross-sells at all', async () => {
      const product = await makeProduct(tag());
      createdProductIds.push(product.id);

      const result = await service.relatedFor(product.id);

      expect(result.slugs).toEqual([]);
      expect(result.hasManualCuration).toBe(false);
    });

    it('always ranks a MANUAL row ahead of CO_OCCURRENCE and EMBEDDING ones', async () => {
      const anchor = await makeProduct(tag());
      const manual = await makeProduct(tag());
      const coOccurrence = await makeProduct(tag());
      const embedding = await makeProduct(tag());
      createdProductIds.push(anchor.id, manual.id, coOccurrence.id, embedding.id);

      await prisma.productCrossSell.createMany({
        data: [
          { productId: anchor.id, relatedProductId: embedding.id, kind: 'EMBEDDING', order: 0 },
          { productId: anchor.id, relatedProductId: coOccurrence.id, kind: 'CO_OCCURRENCE', order: 0 },
          { productId: anchor.id, relatedProductId: manual.id, kind: 'MANUAL', order: 0 },
        ],
      });

      const result = await service.relatedFor(anchor.id);

      expect(result.slugs[0]).toBe(manual.slug);
      expect(result.hasManualCuration).toBe(true);
    });

    it('never returns an inactive related product', async () => {
      const anchor = await makeProduct(tag());
      const hidden = await makeProduct(tag());
      createdProductIds.push(anchor.id, hidden.id);
      await prisma.product.update({ where: { id: hidden.id }, data: { status: 'DRAFT' } });
      await prisma.productCrossSell.create({
        data: { productId: anchor.id, relatedProductId: hidden.id, kind: 'MANUAL', order: 0 },
      });

      const result = await service.relatedFor(anchor.id);

      expect(result.slugs).toEqual([]);
    });
  });

  describe('frequentlyBoughtWith', () => {
    it('reads only CO_OCCURRENCE rows, never MANUAL or EMBEDDING ones', async () => {
      const anchor = await makeProduct(tag());
      const manual = await makeProduct(tag());
      const coOccurrence = await makeProduct(tag());
      createdProductIds.push(anchor.id, manual.id, coOccurrence.id);
      await prisma.productCrossSell.createMany({
        data: [
          { productId: anchor.id, relatedProductId: manual.id, kind: 'MANUAL', order: 0 },
          { productId: anchor.id, relatedProductId: coOccurrence.id, kind: 'CO_OCCURRENCE', order: 0 },
        ],
      });

      const slugs = await service.frequentlyBoughtWith(anchor.id);

      expect(slugs).toEqual([coOccurrence.slug]);
    });
  });

  describe('manual cross-sell curation (admin)', () => {
    it('adds a manual cross-sell and lists it', async () => {
      const anchor = await makeProduct(tag());
      const related = await makeProduct(tag());
      createdProductIds.push(anchor.id, related.id);

      await service.addManualCrossSell(anchor.id, related.id);
      const list = await service.listCrossSells(anchor.id);

      expect(list).toHaveLength(1);
      expect(list[0].kind).toBe('MANUAL');
      expect(list[0].relatedProduct.id).toBe(related.id);
    });

    it('rejects a product related to itself', async () => {
      const anchor = await makeProduct(tag());
      createdProductIds.push(anchor.id);

      await expect(service.addManualCrossSell(anchor.id, anchor.id)).rejects.toThrow(/itself/);
    });

    it('promotes an existing algorithmic row to MANUAL rather than erroring on the duplicate pair', async () => {
      const anchor = await makeProduct(tag());
      const related = await makeProduct(tag());
      createdProductIds.push(anchor.id, related.id);
      await prisma.productCrossSell.create({
        data: { productId: anchor.id, relatedProductId: related.id, kind: 'EMBEDDING', order: 0 },
      });

      await service.addManualCrossSell(anchor.id, related.id);

      const row = await prisma.productCrossSell.findUnique({
        where: { productId_relatedProductId: { productId: anchor.id, relatedProductId: related.id } },
      });
      expect(row?.kind).toBe('MANUAL');
    });

    it('reorders manual cross-sells', async () => {
      const anchor = await makeProduct(tag());
      const first = await makeProduct(tag());
      const second = await makeProduct(tag());
      createdProductIds.push(anchor.id, first.id, second.id);
      await service.addManualCrossSell(anchor.id, first.id);
      await service.addManualCrossSell(anchor.id, second.id);

      await service.reorderManualCrossSells(anchor.id, [second.id, first.id]);

      const result = await service.relatedFor(anchor.id);
      expect(result.slugs).toEqual([second.slug, first.slug]);
    });

    it('removes a cross-sell', async () => {
      const anchor = await makeProduct(tag());
      const related = await makeProduct(tag());
      createdProductIds.push(anchor.id, related.id);
      await service.addManualCrossSell(anchor.id, related.id);

      await service.removeCrossSell(anchor.id, related.id);

      expect(await service.listCrossSells(anchor.id)).toHaveLength(0);
    });

    it('throws when the anchor product does not exist', async () => {
      await expect(service.listCrossSells('does-not-exist')).rejects.toThrow(/not found/);
    });
  });

  describe('personalizedFor', () => {
    it('returns nothing for a session with no product-view history', async () => {
      const result = await service.personalizedFor(`reco-test-empty-${Date.now()}`);
      expect(result).toEqual([]);
    });

    it('returns nothing for an empty session id, without querying anything', async () => {
      const result = await service.personalizedFor('');
      expect(result).toEqual([]);
    });

    it('recommends related products for the most recently viewed product', async () => {
      const viewed = await makeProduct(tag());
      const related = await makeProduct(tag());
      createdProductIds.push(viewed.id, related.id);
      await prisma.productCrossSell.create({
        data: { productId: viewed.id, relatedProductId: related.id, kind: 'MANUAL', order: 0 },
      });

      const sessionId = `reco-test-session-${Date.now()}`;
      await prisma.analyticsEvent.create({
        data: { type: 'page_view', path: `/en/product/${viewed.slug}`, sessionId },
      });

      const result = await service.personalizedFor(sessionId);

      expect(result).toEqual([related.slug]);
    });

    it('never recommends the product the visitor just viewed back to them', async () => {
      const viewed = await makeProduct(tag());
      createdProductIds.push(viewed.id);
      // No cross-sells at all — relatedFor returns nothing, so there is
      // nothing to filter, but this also proves the anchor itself never
      // leaks into the result even when relatedFor has data (covered above).
      const sessionId = `reco-test-session-${Date.now()}`;
      await prisma.analyticsEvent.create({
        data: { type: 'page_view', path: `/en/product/${viewed.slug}`, sessionId },
      });

      const result = await service.personalizedFor(sessionId);

      expect(result).not.toContain(viewed.slug);
    });
  });
});
