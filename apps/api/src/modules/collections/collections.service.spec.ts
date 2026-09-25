import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CollectionsService } from './collections.service';

describe('CollectionsService', () => {
  let service: CollectionsService;
  let prisma: PrismaService;
  let categoryId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [CollectionsService, PrismaService],
    }).compile();
    service = module.get(CollectionsService);
    prisma = module.get(PrismaService);
    categoryId = (await prisma.category.findFirstOrThrow({ select: { id: true } })).id;
  });

  let seq = 0;
  function tag(): string {
    seq += 1;
    return `collections-test-${Date.now()}-${seq}`;
  }

  async function makeProduct(basePrice: number, opts: { costPrice?: number } = {}) {
    const slug = tag();
    const product = await prisma.product.create({
      data: {
        slug,
        kind: 'GOODS',
        status: 'ACTIVE',
        categoryId,
        basePrice,
        translations: { create: [{ locale: 'en', name: slug }] },
        ...(opts.costPrice !== undefined
          ? { variants: { create: [{ sku: `${slug}-v`, costPrice: opts.costPrice }] } }
          : {}),
      },
    });
    return product;
  }

  afterEach(async () => {
    await prisma.collection.deleteMany({ where: { slug: { contains: 'collections-test' } } });
    await prisma.product.deleteMany({ where: { slug: { contains: 'collections-test' } } });
  });

  it('paginates and orders a manual collection by CollectionProduct.order', async () => {
    const p1 = await makeProduct(1000);
    const p2 = await makeProduct(2000);
    const collection = await service.createCollection({
      slug: tag(),
      translations: [{ locale: 'en', name: 'Manual set' }],
    });
    await service.addProduct(collection.id, { productId: p2.id, order: 0 });
    await service.addProduct(collection.id, { productId: p1.id, order: 1 });

    const result = await service.getPublishedBySlug(collection.slug, 'en', 1, 24);
    expect(result.productSlugs).toEqual([p2.slug, p1.slug]);
    expect(result.total).toBe(2);
  });

  it('resolves a rule-based collection by price and sorts PRICE_ASC', async () => {
    const cheap = await makeProduct(1000);
    const expensive = await makeProduct(9000);
    await makeProduct(20000); // outside the rule's range — must be excluded

    const collection = await service.createCollection({
      slug: tag(),
      sortStrategy: 'PRICE_ASC',
      rule: { all: [{ field: 'price', operator: 'lt', value: 10000 }] },
      translations: [{ locale: 'en', name: 'Under 100' }],
    });

    const result = await service.getPublishedBySlug(collection.slug, 'en', 1, 24);
    expect(result.productSlugs).toEqual([cheap.slug, expensive.slug]);
  });

  it('sorts BEST_SELLING by units actually sold', async () => {
    const bestseller = await makeProduct(1000);
    const slowMover = await makeProduct(1000);
    const contact = await prisma.contact.create({ data: { name: tag(), phoneE164: null } });
    const order = await prisma.order.create({
      data: {
        number: tag(),
        status: 'DELIVERED',
        contactId: contact.id,
        shippingAddress: {},
        itemsSubtotal: 5000,
        grandTotal: 5000,
        items: {
          create: [
            { productId: bestseller.id, kind: 'GOODS', nameEn: 'x', quantity: 5, unitPrice: 1000, lineTotal: 5000 },
            { productId: slowMover.id, kind: 'GOODS', nameEn: 'y', quantity: 1, unitPrice: 1000, lineTotal: 1000 },
          ],
        },
      },
    });

    const collection = await service.createCollection({
      slug: tag(),
      sortStrategy: 'BEST_SELLING',
      translations: [{ locale: 'en', name: 'Bestsellers' }],
    });
    await service.addProduct(collection.id, { productId: slowMover.id });
    await service.addProduct(collection.id, { productId: bestseller.id });

    const result = await service.getPublishedBySlug(collection.slug, 'en', 1, 24);
    expect(result.productSlugs[0]).toBe(bestseller.slug);

    await prisma.order.delete({ where: { id: order.id } });
    await prisma.contact.delete({ where: { id: contact.id } });
  });

  it('rejects a malformed rule', async () => {
    await expect(
      service.createCollection({
        slug: tag(),
        rule: { not_all: [] },
        translations: [{ locale: 'en', name: 'Bad rule' }],
      }),
    ).rejects.toThrow();
  });

  it('throws on an unknown collection slug', async () => {
    await expect(service.getPublishedBySlug('does-not-exist', 'en', 1, 24)).rejects.toThrow(NotFoundException);
  });

  it('excludes an inactive collection from public reads', async () => {
    const collection = await service.createCollection({
      slug: tag(),
      isActive: false,
      translations: [{ locale: 'en', name: 'Hidden' }],
    });
    await expect(service.getPublishedBySlug(collection.slug, 'en', 1, 24)).rejects.toThrow(NotFoundException);
  });
});
