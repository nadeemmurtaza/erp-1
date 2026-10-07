import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BundlesService } from './bundles.service';

describe('BundlesService', () => {
  let prisma: any;
  let audit: any;
  let inventory: any;
  let tx: any;
  let service: BundlesService;

  beforeEach(() => {
    tx = {
      productVariant: { findMany: jest.fn() },
      bundleComponent: { deleteMany: jest.fn(), createMany: jest.fn() },
      productBundle: { update: jest.fn() },
    };
    prisma = {
      productBundle: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
      productVariant: { findMany: jest.fn() },
      variantLocationStock: { findMany: jest.fn() },
      $transaction: jest.fn((work: (client: unknown) => unknown) => work(tx)),
    };
    audit = { record: jest.fn() };
    inventory = { move: jest.fn() };
    service = new BundlesService(prisma, audit, inventory);
  });

  describe('bundlesByVariantId', () => {
    it('returns an empty map for an empty input — no query at all', async () => {
      const result = await service.bundlesByVariantId([]);
      expect(result.size).toBe(0);
      expect(prisma.productBundle.findMany).not.toHaveBeenCalled();
    });

    it('keys the returned map by variantId, in one batched query', async () => {
      prisma.productBundle.findMany.mockResolvedValue([{ id: 'b1', variantId: 'v1', components: [] }]);

      const result = await service.bundlesByVariantId(['v1', 'v2']);

      expect(result.get('v1')?.id).toBe('b1');
      expect(result.has('v2')).toBe(false);
      expect(prisma.productBundle.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('sellBundle', () => {
    it('decrements every component once, using each component\'s own cost price', async () => {
      const bundle = {
        id: 'b1',
        variantId: 'bundle-v',
        components: [
          { componentVariantId: 'c1', quantity: 2 },
          { componentVariantId: 'c2', quantity: 1 },
        ],
      } as any;
      tx.productVariant.findMany.mockResolvedValue([
        { id: 'c1', costPrice: 100 },
        { id: 'c2', costPrice: 200 },
      ]);

      await service.sellBundle(bundle, 3, 'order-1', 'loc-1', tx);

      expect(inventory.move).toHaveBeenCalledTimes(2);
      expect(inventory.move).toHaveBeenCalledWith(
        expect.objectContaining({ variantId: 'c1', delta: -6, reason: 'SALE', refType: 'Order', refId: 'order-1', unitCost: 100 }),
        tx,
      );
      expect(inventory.move).toHaveBeenCalledWith(
        expect.objectContaining({ variantId: 'c2', delta: -3, unitCost: 200 }),
        tx,
      );
    });

    it('propagates InsufficientStockError from any one component — never a partial decrement', async () => {
      const bundle = { components: [{ componentVariantId: 'c1', quantity: 1 }] } as any;
      tx.productVariant.findMany.mockResolvedValue([{ id: 'c1', costPrice: 0 }]);
      inventory.move.mockRejectedValue(new Error('insufficient stock'));

      await expect(service.sellBundle(bundle, 1, 'order-1', 'loc-1', tx)).rejects.toThrow('insufficient stock');
    });
  });

  describe('restockBundle', () => {
    it('restocks every component with a positive delta, referencing the ReturnRequest', async () => {
      const bundle = {
        components: [
          { componentVariantId: 'c1', quantity: 2 },
          { componentVariantId: 'c2', quantity: 1 },
        ],
      } as any;

      await service.restockBundle(bundle, 3, 'RETURN', 'return-1', 'loc-1', 'user-1', tx);

      expect(inventory.move).toHaveBeenCalledTimes(2);
      expect(inventory.move).toHaveBeenCalledWith(
        expect.objectContaining({ variantId: 'c1', delta: 6, reason: 'RETURN', refType: 'ReturnRequest', refId: 'return-1', actorId: 'user-1' }),
        tx,
      );
    });
  });

  describe('bundleAvailableStock', () => {
    it('returns 0 for an unknown or inactive bundle variant', async () => {
      prisma.productBundle.findUnique.mockResolvedValue(null);
      await expect(service.bundleAvailableStock('missing', 'loc-1')).resolves.toBe(0);
    });

    it('is the minimum floor(componentStock / componentQuantity) across every component', async () => {
      prisma.productBundle.findUnique.mockResolvedValue({
        components: [
          { componentVariantId: 'c1', quantity: 2 }, // 10 in stock -> 5 sellable
          { componentVariantId: 'c2', quantity: 3 }, // 7 in stock -> 2 sellable (the binding constraint)
        ],
      });
      prisma.variantLocationStock.findMany.mockResolvedValue([
        { variantId: 'c1', quantity: 10 },
        { variantId: 'c2', quantity: 7 },
      ]);

      await expect(service.bundleAvailableStock('bundle-v', 'loc-1')).resolves.toBe(2);
    });

    it('treats a component with no stock row as zero, never undefined-crashes', async () => {
      prisma.productBundle.findUnique.mockResolvedValue({ components: [{ componentVariantId: 'c1', quantity: 1 }] });
      prisma.variantLocationStock.findMany.mockResolvedValue([]);

      await expect(service.bundleAvailableStock('bundle-v', 'loc-1')).resolves.toBe(0);
    });
  });

  describe('create', () => {
    const actor = { id: 'user-1' } as any;

    it('refuses a variant already used as a bundle', async () => {
      prisma.productBundle.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.create(actor, { variantId: 'v1', components: [{ componentVariantId: 'c1' }] })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses a bundle that lists itself as its own component', async () => {
      prisma.productBundle.findUnique.mockResolvedValue(null);
      await expect(
        service.create(actor, { variantId: 'v1', components: [{ componentVariantId: 'v1' }] }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.productBundle.create).not.toHaveBeenCalled();
    });

    it('creates the bundle and audits it', async () => {
      prisma.productBundle.findUnique.mockResolvedValue(null);
      prisma.productBundle.create.mockResolvedValue({ id: 'b1', variantId: 'v1', components: [{}] });

      await service.create(actor, { variantId: 'v1', components: [{ componentVariantId: 'c1', quantity: 2 }] });

      expect(prisma.productBundle.create).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'catalog.bundle_created' }));
    });
  });

  describe('update', () => {
    const actor = { id: 'user-1' } as any;

    it('throws NotFoundException for an unknown bundle', async () => {
      prisma.productBundle.findUnique.mockResolvedValue(null);
      await expect(service.update(actor, 'missing', {})).rejects.toThrow(NotFoundException);
    });

    it('refuses replacing components with the bundle itself listed as a component', async () => {
      prisma.productBundle.findUnique.mockResolvedValue({ id: 'b1', variantId: 'v1', isActive: true, components: [] });
      await expect(service.update(actor, 'b1', { components: [{ componentVariantId: 'v1' }] })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('replaces components inside one transaction', async () => {
      prisma.productBundle.findUnique.mockResolvedValue({ id: 'b1', variantId: 'v1', isActive: true, components: [] });
      tx.productBundle.update.mockResolvedValue({ id: 'b1', components: [] });

      await service.update(actor, 'b1', { components: [{ componentVariantId: 'c1' }] });

      expect(tx.bundleComponent.deleteMany).toHaveBeenCalledWith({ where: { bundleId: 'b1' } });
      expect(tx.bundleComponent.createMany).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws NotFoundException for an unknown bundle', async () => {
      prisma.productBundle.findUnique.mockResolvedValue(null);
      await expect(service.remove({ id: 'user-1' } as any, 'missing')).rejects.toThrow(NotFoundException);
    });

    it('deletes the bundle and audits the before-state', async () => {
      prisma.productBundle.findUnique.mockResolvedValue({ id: 'b1', variantId: 'v1', isActive: true, components: [] });

      await service.remove({ id: 'user-1' } as any, 'b1');

      expect(prisma.productBundle.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'catalog.bundle_removed' }));
    });
  });

  describe('list / get — WO-150.6 label enrichment', () => {
    const VARIANTS = [
      { id: 'bundle-v', sku: 'KIT-1', label: null, product: { translations: [{ name: 'Starter kit' }] } },
      { id: 'shirt-v', sku: 'SHIRT-M', label: 'Medium', product: { translations: [{ name: 'Cotton shirt' }] } },
    ];

    it('never returns a raw variant id — every reference is resolved to a display label', async () => {
      prisma.productBundle.findMany.mockResolvedValue([
        { id: 'b1', variantId: 'bundle-v', isActive: true, components: [{ id: 'c1', componentVariantId: 'shirt-v', quantity: 3 }] },
      ]);
      prisma.productVariant.findMany.mockResolvedValue(VARIANTS);

      const [bundle] = await service.list();

      expect(prisma.productVariant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: expect.arrayContaining(['bundle-v', 'shirt-v']) } } }),
      );
      expect(bundle!.variantLabel).toBe('Starter kit (KIT-1)');
      expect(bundle!.components[0]!.label).toBe('Cotton shirt — Medium (SHIRT-M)');
    });

    it('falls back to the raw id if a referenced variant no longer exists, rather than throwing', async () => {
      prisma.productBundle.findMany.mockResolvedValue([
        { id: 'b1', variantId: 'deleted-v', isActive: true, components: [] },
      ]);
      prisma.productVariant.findMany.mockResolvedValue([]);

      const [bundle] = await service.list();

      expect(bundle!.variantLabel).toBe('deleted-v');
    });

    it('get() enriches a single bundle the same way', async () => {
      prisma.productBundle.findUnique.mockResolvedValue({ id: 'b1', variantId: 'bundle-v', isActive: true, components: [] });
      prisma.productVariant.findMany.mockResolvedValue(VARIANTS);

      const bundle = await service.get('b1');

      expect(bundle.variantLabel).toBe('Starter kit (KIT-1)');
    });

    it('get() throws NotFoundException for an unknown bundle, never calling the label lookup', async () => {
      prisma.productBundle.findUnique.mockResolvedValue(null);
      await expect(service.get('missing')).rejects.toThrow(NotFoundException);
      expect(prisma.productVariant.findMany).not.toHaveBeenCalled();
    });
  });
});
