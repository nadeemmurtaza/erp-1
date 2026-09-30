import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RecommendationsCron } from './recommendations.cron';

describe('RecommendationsCron', () => {
  let cron: RecommendationsCron;
  let prisma: PrismaService;
  let categoryId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [RecommendationsCron, PrismaService],
    }).compile();
    cron = module.get(RecommendationsCron);
    prisma = module.get(PrismaService);
    categoryId = (await prisma.category.findFirstOrThrow({ select: { id: true } })).id;
  });

  let seq = 0;
  function tag(): string {
    seq += 1;
    return `reco-cron-test-${Date.now()}-${seq}`;
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

  async function makeOrderWith(productIds: string[], status: 'DELIVERED' | 'CANCELLED' = 'DELIVERED') {
    return prisma.order.create({
      data: {
        number: tag(),
        status,
        shippingAddress: {},
        itemsSubtotal: 1000 * productIds.length,
        grandTotal: 1000 * productIds.length,
        items: {
          create: productIds.map((productId) => ({
            productId,
            kind: 'GOODS',
            nameEn: 'x',
            unitPrice: 1000,
            lineTotal: 1000,
          })),
        },
      },
    });
  }

  const createdProductIds: string[] = [];
  const createdOrderIds: string[] = [];
  afterEach(async () => {
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    await prisma.productCrossSell.deleteMany({
      where: { OR: [{ productId: { in: createdProductIds } }, { relatedProductId: { in: createdProductIds } }] },
    });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    createdOrderIds.length = 0;
    createdProductIds.length = 0;
  });

  it('writes a CO_OCCURRENCE row for two products bought together at least twice', async () => {
    const a = await makeProduct(tag());
    const b = await makeProduct(tag());
    createdProductIds.push(a.id, b.id);
    const order1 = await makeOrderWith([a.id, b.id]);
    const order2 = await makeOrderWith([a.id, b.id]);
    createdOrderIds.push(order1.id, order2.id);

    await cron.recompute();

    const row = await prisma.productCrossSell.findUnique({
      where: { productId_relatedProductId: { productId: a.id, relatedProductId: b.id } },
    });
    expect(row?.kind).toBe('CO_OCCURRENCE');
    const reverse = await prisma.productCrossSell.findUnique({
      where: { productId_relatedProductId: { productId: b.id, relatedProductId: a.id } },
    });
    expect(reverse?.kind).toBe('CO_OCCURRENCE');
  });

  it('never writes a co-occurrence row below the minimum order count', async () => {
    const a = await makeProduct(tag());
    const b = await makeProduct(tag());
    createdProductIds.push(a.id, b.id);
    const order = await makeOrderWith([a.id, b.id]); // only once
    createdOrderIds.push(order.id);

    await cron.recompute();

    const row = await prisma.productCrossSell.findUnique({
      where: { productId_relatedProductId: { productId: a.id, relatedProductId: b.id } },
    });
    expect(row).toBeNull();
  });

  it('excludes a cancelled order from the co-occurrence signal', async () => {
    const a = await makeProduct(tag());
    const b = await makeProduct(tag());
    createdProductIds.push(a.id, b.id);
    const order1 = await makeOrderWith([a.id, b.id], 'CANCELLED');
    const order2 = await makeOrderWith([a.id, b.id], 'CANCELLED');
    createdOrderIds.push(order1.id, order2.id);

    await cron.recompute();

    const row = await prisma.productCrossSell.findUnique({
      where: { productId_relatedProductId: { productId: a.id, relatedProductId: b.id } },
    });
    expect(row).toBeNull();
  });

  it('never overwrites an existing MANUAL row with a CO_OCCURRENCE one for the same pair', async () => {
    const a = await makeProduct(tag());
    const b = await makeProduct(tag());
    createdProductIds.push(a.id, b.id);
    await prisma.productCrossSell.create({ data: { productId: a.id, relatedProductId: b.id, kind: 'MANUAL', order: 0 } });
    const order1 = await makeOrderWith([a.id, b.id]);
    const order2 = await makeOrderWith([a.id, b.id]);
    createdOrderIds.push(order1.id, order2.id);

    await cron.recompute();

    const row = await prisma.productCrossSell.findUnique({
      where: { productId_relatedProductId: { productId: a.id, relatedProductId: b.id } },
    });
    expect(row?.kind).toBe('MANUAL');
  });

  it('prunes a stale CO_OCCURRENCE row once the pair no longer qualifies', async () => {
    const a = await makeProduct(tag());
    const b = await makeProduct(tag());
    createdProductIds.push(a.id, b.id);
    // A row from a "previous run" that no current order history supports.
    await prisma.productCrossSell.create({ data: { productId: a.id, relatedProductId: b.id, kind: 'CO_OCCURRENCE', order: 0 } });

    await cron.recompute();

    const row = await prisma.productCrossSell.findUnique({
      where: { productId_relatedProductId: { productId: a.id, relatedProductId: b.id } },
    });
    expect(row).toBeNull();
  });

  it('computes an EMBEDDING fallback only for a product with no other signal yet', async () => {
    const anchor = await makeProduct(tag());
    const nearest = await makeProduct(tag());
    const covered = await makeProduct(tag()); // already has a MANUAL row — must be skipped
    const coveredRelated = await makeProduct(tag());
    createdProductIds.push(anchor.id, nearest.id, covered.id, coveredRelated.id);

    const vectorLiteral = `[${Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0)).join(',')}]`;
    await prisma.$executeRaw`UPDATE "ProductTranslation" SET "embedding" = ${vectorLiteral}::vector WHERE "productId" = ${anchor.id} AND "locale" = 'en'`;
    await prisma.$executeRaw`UPDATE "ProductTranslation" SET "embedding" = ${vectorLiteral}::vector WHERE "productId" = ${nearest.id} AND "locale" = 'en'`;
    await prisma.productCrossSell.create({ data: { productId: covered.id, relatedProductId: coveredRelated.id, kind: 'MANUAL', order: 0 } });

    await cron.recompute();

    const row = await prisma.productCrossSell.findUnique({
      where: { productId_relatedProductId: { productId: anchor.id, relatedProductId: nearest.id } },
    });
    expect(row?.kind).toBe('EMBEDDING');
    const coveredRows = await prisma.productCrossSell.findMany({ where: { productId: covered.id, kind: 'EMBEDDING' } });
    expect(coveredRows).toHaveLength(0);
  });
});
