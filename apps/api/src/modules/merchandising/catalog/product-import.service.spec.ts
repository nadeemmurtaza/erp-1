import { ProductImportService } from './product-import.service';

/**
 * WO-72.3 (admin-platform/72-fragmented-tool-consolidation-import.md) — the
 * dry-run mode retrofitted onto the pre-existing `ProductImportService`.
 * Focused on dry-run's own "writes nothing" guarantee; the surrounding
 * per-row validation (`importRow`'s own error messages) had no prior spec
 * and is not re-derived here beyond what dry-run itself needs to prove.
 */
describe('ProductImportService — dry run', () => {
  function makeService(overrides: { existingVariant?: unknown; sibling?: unknown } = {}) {
    const prisma = {
      category: { findMany: jest.fn().mockResolvedValue([]) },
      garmentType: { findMany: jest.fn().mockResolvedValue([]) },
      brand: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      productVariant: {
        findUnique: jest.fn().mockResolvedValue(overrides.existingVariant ?? null),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      product: {
        findFirst: jest.fn().mockResolvedValue(overrides.sibling ?? null),
        update: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const audit = { record: jest.fn() };
    const stockIntake = {
      defaultLocationId: jest.fn().mockResolvedValue('loc1'),
      recordIntake: jest.fn(),
    };
    const service = new ProductImportService(prisma as any, audit as any, stockIntake as any);
    return { service, prisma, audit, stockIntake };
  }

  const csv = 'sku,kind,status,name_en,name_ur,description_en,description_ur,price_pkr,compare_at_pkr,category_slug,brand,fabric,season,piece_count,fabric_meters,stitching_available,garment_type_key,size,color,stock,tags\nNEW-SKU-1,UNSTITCHED,DRAFT,Test Product,,,,1000,,,,,,,,,,M,Blue,10,\n';

  it('creates nothing for a brand-new SKU when dryRun is true', async () => {
    const { service, prisma, audit, stockIntake } = makeService();

    const summary = await service.import('actor1', csv, { dryRun: true });

    expect(summary.created).toBe(1);
    expect(summary.results[0]!.action).toBe('created');
    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(prisma.brand.create).not.toHaveBeenCalled();
    expect(stockIntake.recordIntake).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('updates nothing for an existing SKU when dryRun is true', async () => {
    const { service, prisma, stockIntake } = makeService({
      existingVariant: { id: 'v1', productId: 'p1', stock: 5 },
    });

    const summary = await service.import('actor1', csv, { dryRun: true });

    expect(summary.updated).toBe(1);
    expect(summary.results[0]!.action).toBe('updated');
    expect(prisma.productVariant.updateMany).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalled();
    expect(stockIntake.recordIntake).not.toHaveBeenCalled();
  });

  it('still writes when dryRun is omitted (the existing, non-preview behaviour)', async () => {
    const { service, prisma, audit } = makeService();
    prisma.product.create.mockResolvedValue({ id: 'p1', variants: [{ id: 'v1' }] });

    const summary = await service.import('actor1', csv);

    expect(summary.created).toBe(1);
    expect(prisma.product.create).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});
