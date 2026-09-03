import { PrismaService } from '../src/core/prisma/prisma.service';
import { backfillProductOptions } from '../prisma/backfill-product-options';

/**
 * WO-3.1's own acceptance requirement (03-variants-sku-seo.md, Blocker B2):
 * "every variant that had a size or color has the matching number of join
 * rows, and every label matches what the old columns would have produced.
 * Write that as a test that runs against the backfilled data."
 */
describe('backfillProductOptions', () => {
  const prisma = new PrismaService();
  let productId: string;
  const variantIds: string[] = [];

  beforeAll(async () => {
    const category = await prisma.category.findFirstOrThrow({ select: { id: true } });
    const product = await prisma.product.create({
      data: {
        slug: `b2-test-${Date.now()}`,
        kind: 'STITCHED',
        status: 'DRAFT',
        categoryId: category.id,
        basePrice: 100000,
        translations: { create: [{ locale: 'en', name: 'B2 Backfill Test Product' }] },
      },
    });
    productId = product.id;

    const variants = await Promise.all([
      // Two distinct sizes, one shared color — proves dedup, not just count.
      prisma.productVariant.create({
        data: { productId, sku: `B2-${Date.now()}-1`, size: 'M', color: 'Blue', colorHex: '#0000ff' },
      }),
      prisma.productVariant.create({
        data: { productId, sku: `B2-${Date.now()}-2`, size: 'L', color: 'Blue', colorHex: '#0000ff' },
      }),
      // Size only, no color — must not get a colour join row.
      prisma.productVariant.create({
        data: { productId, sku: `B2-${Date.now()}-3`, size: 'M', color: null },
      }),
      // Neither axis — must be left alone entirely (label stays null).
      prisma.productVariant.create({
        data: { productId, sku: `B2-${Date.now()}-4`, size: null, color: null },
      }),
    ]);
    variantIds.push(...variants.map((v) => v.id));
  });

  afterAll(async () => {
    await prisma.product.delete({ where: { id: productId } });
    await prisma.$disconnect();
  });

  it('creates the matching number of join rows and a label matching the old size/color format', async () => {
    await backfillProductOptions(prisma);

    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { optionValues: { include: { value: true } } },
      orderBy: { sku: 'asc' },
    });

    const [mBlue, lBlue, mOnly, neither] = variants;

    expect(mBlue.optionValues).toHaveLength(2);
    expect(mBlue.label).toBe('M / Blue');
    expect(lBlue.optionValues).toHaveLength(2);
    expect(lBlue.label).toBe('L / Blue');
    expect(mOnly.optionValues).toHaveLength(1);
    expect(mOnly.label).toBe('M');
    expect(neither.optionValues).toHaveLength(0);
    expect(neither.label).toBeNull();
  });

  it('dedupes a colour shared by two variants into one ProductOptionValue', async () => {
    const colorOption = await prisma.productOption.findUniqueOrThrow({
      where: { productId_key: { productId, key: 'color' } },
      include: { values: true },
    });
    expect(colorOption.values).toHaveLength(1);
    expect(colorOption.values[0].key).toBe('Blue');
    expect(colorOption.values[0].swatchHex).toBe('#0000ff');
  });

  it('carries the size option display as BUTTON and colour as SWATCH', async () => {
    const sizeOption = await prisma.productOption.findUniqueOrThrow({
      where: { productId_key: { productId, key: 'size' } },
    });
    const colorOption = await prisma.productOption.findUniqueOrThrow({
      where: { productId_key: { productId, key: 'color' } },
    });
    expect(sizeOption.display).toBe('BUTTON');
    expect(colorOption.display).toBe('SWATCH');
  });

  it('is idempotent — a second run creates no new rows', async () => {
    const before = {
      options: await prisma.productOption.count({ where: { productId } }),
      values: await prisma.productOptionValue.count({ where: { option: { productId } } }),
      joins: await prisma.productVariantOptionValue.count({ where: { variantId: { in: variantIds } } }),
    };

    await backfillProductOptions(prisma);

    const after = {
      options: await prisma.productOption.count({ where: { productId } }),
      values: await prisma.productOptionValue.count({ where: { option: { productId } } }),
      joins: await prisma.productVariantOptionValue.count({ where: { variantId: { in: variantIds } } }),
    };

    expect(after).toEqual(before);
  });
});
