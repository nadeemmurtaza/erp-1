import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PricingService } from './pricing.service';

describe('PricingService', () => {
  let prisma: any;
  let tx: any;
  let audit: any;
  let service: PricingService;

  beforeEach(() => {
    tx = {
      priceListEntry: { deleteMany: jest.fn(), createMany: jest.fn() },
      priceList: { update: jest.fn() },
    };
    prisma = {
      priceListAssignment: { findFirst: jest.fn(), create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
      priceListEntry: { findMany: jest.fn() },
      contactTag: { findMany: jest.fn() },
      priceList: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      productVariant: { findMany: jest.fn() },
      $transaction: jest.fn((work: (client: unknown) => unknown) => work(tx)),
    };
    audit = { record: jest.fn() };
    service = new PricingService(prisma, audit);
  });

  describe('resolvePrices', () => {
    it('returns an empty map for a customer with no assignment — the byte-identical-when-off case', async () => {
      prisma.priceListAssignment.findFirst.mockResolvedValue(null);
      prisma.contactTag.findMany.mockResolvedValue([]);

      const result = await service.resolvePrices([{ variantId: 'v1', quantity: 5 }], 'contact-1');

      expect(result.size).toBe(0);
    });

    it('picks the highest minQuantity <= quantity — the quantity-break resolution', async () => {
      prisma.priceListAssignment.findFirst.mockResolvedValueOnce({ priceListId: 'pl-1' });
      prisma.priceListEntry.findMany.mockResolvedValue([
        { variantId: 'v1', minQuantity: 10, unitPriceMinor: 900 },
        { variantId: 'v1', minQuantity: 5, unitPriceMinor: 1000 },
        { variantId: 'v1', minQuantity: 1, unitPriceMinor: 1200 },
      ]);

      const result = await service.resolvePrices([{ variantId: 'v1', quantity: 7 }], 'contact-1');

      expect(result.get('v1')).toBe(1000);
    });

    it('a customer-specific assignment wins over a tag-based one', async () => {
      prisma.priceListAssignment.findFirst.mockResolvedValueOnce({ priceListId: 'direct-list' });
      prisma.priceListEntry.findMany.mockResolvedValue([{ variantId: 'v1', minQuantity: 1, unitPriceMinor: 500 }]);

      await service.resolvePrices([{ variantId: 'v1', quantity: 1 }], 'contact-1');

      // The direct lookup runs first; contactTag.findMany is never reached
      // because a direct assignment already resolved.
      expect(prisma.contactTag.findMany).not.toHaveBeenCalled();
    });

    it('falls through to tag-based assignment when there is no direct one', async () => {
      prisma.priceListAssignment.findFirst
        .mockResolvedValueOnce(null) // direct lookup
        .mockResolvedValueOnce({ priceListId: 'tag-list' }); // tag lookup
      prisma.contactTag.findMany.mockResolvedValue([{ tagId: 'wholesale-tag' }]);
      prisma.priceListEntry.findMany.mockResolvedValue([{ variantId: 'v1', minQuantity: 1, unitPriceMinor: 800 }]);

      const result = await service.resolvePrices([{ variantId: 'v1', quantity: 1 }], 'contact-1');

      expect(result.get('v1')).toBe(800);
    });

    it('with no customerId at all, resolves with no result — a guest cart', async () => {
      const result = await service.resolvePrices([{ variantId: 'v1', quantity: 1 }], null);
      expect(result.size).toBe(0);
      expect(prisma.priceListAssignment.findFirst).not.toHaveBeenCalled();
    });

    it('a variant absent from every entry is simply absent from the result, never zero or an error', async () => {
      prisma.priceListAssignment.findFirst.mockResolvedValueOnce({ priceListId: 'pl-1' });
      prisma.priceListEntry.findMany.mockResolvedValue([{ variantId: 'v-other', minQuantity: 1, unitPriceMinor: 500 }]);

      const result = await service.resolvePrices([{ variantId: 'v1', quantity: 1 }], 'contact-1');

      expect(result.has('v1')).toBe(false);
    });

    it('batches into exactly one entries query regardless of line count — never N+1', async () => {
      prisma.priceListAssignment.findFirst.mockResolvedValueOnce({ priceListId: 'pl-1' });
      prisma.priceListEntry.findMany.mockResolvedValue([]);

      await service.resolvePrices(
        [
          { variantId: 'v1', quantity: 1 },
          { variantId: 'v2', quantity: 1 },
          { variantId: 'v3', quantity: 1 },
        ],
        'contact-1',
      );

      expect(prisma.priceListEntry.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('resolvePrice', () => {
    it('is a thin wrapper over resolvePrices, returning null on no match', async () => {
      prisma.priceListAssignment.findFirst.mockResolvedValue(null);
      prisma.contactTag.findMany.mockResolvedValue([]);

      await expect(service.resolvePrice('v1', 1, 'contact-1')).resolves.toBeNull();
    });
  });

  describe('createPriceList', () => {
    const actor = { id: 'user-1' } as any;

    it('refuses a duplicate key', async () => {
      prisma.priceList.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.createPriceList(actor, { key: 'wholesale', name: 'Wholesale' }, true)).rejects.toThrow(BadRequestException);
    });

    it('refuses an entry below the variant\'s own base price without approval permission', async () => {
      prisma.priceList.findUnique.mockResolvedValue(null);
      prisma.productVariant.findMany.mockResolvedValue([{ id: 'v1', priceOverride: null, product: { basePrice: 1000 } }]);

      await expect(
        service.createPriceList(actor, { key: 'k', name: 'n', entries: [{ variantId: 'v1', unitPriceMinor: 900 }] }, false),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.priceList.create).not.toHaveBeenCalled();
    });

    it('allows an entry below base price when the caller holds the approval permission', async () => {
      prisma.priceList.findUnique.mockResolvedValue(null);
      prisma.priceList.create.mockResolvedValue({ id: 'pl-1', key: 'k', name: 'n' });

      await service.createPriceList(actor, { key: 'k', name: 'n', entries: [{ variantId: 'v1', unitPriceMinor: 900 }] }, true);

      expect(prisma.productVariant.findMany).not.toHaveBeenCalled();
      expect(prisma.priceList.create).toHaveBeenCalled();
    });

    it('allows an entry at or above base price with no approval permission', async () => {
      prisma.priceList.findUnique.mockResolvedValue(null);
      prisma.productVariant.findMany.mockResolvedValue([{ id: 'v1', priceOverride: null, product: { basePrice: 1000 } }]);
      prisma.priceList.create.mockResolvedValue({ id: 'pl-1' });

      await service.createPriceList(actor, { key: 'k', name: 'n', entries: [{ variantId: 'v1', unitPriceMinor: 1000 }] }, false);

      expect(prisma.priceList.create).toHaveBeenCalled();
    });
  });

  describe('updatePriceList', () => {
    const actor = { id: 'user-1' } as any;

    it('throws NotFoundException for an unknown price list', async () => {
      prisma.priceList.findUnique.mockResolvedValue(null);
      await expect(service.updatePriceList(actor, 'missing', {}, true)).rejects.toThrow(NotFoundException);
    });

    it('replaces entries inside one transaction', async () => {
      prisma.priceList.findUnique.mockResolvedValue({ id: 'pl-1', name: 'n', isActive: true, entries: [] });
      tx.priceList.update.mockResolvedValue({ id: 'pl-1', entries: [] });

      await service.updatePriceList(actor, 'pl-1', { entries: [{ variantId: 'v1', unitPriceMinor: 500 }] }, true);

      expect(tx.priceListEntry.deleteMany).toHaveBeenCalledWith({ where: { priceListId: 'pl-1' } });
      expect(tx.priceListEntry.createMany).toHaveBeenCalled();
    });
  });

  describe('setAssignment', () => {
    const actor = { id: 'user-1' } as any;

    it('refuses an assignment with neither customerId nor tagId', async () => {
      await expect(service.setAssignment(actor, 'pl-1', {})).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for an unknown price list', async () => {
      prisma.priceList.findUnique.mockResolvedValue(null);
      await expect(service.setAssignment(actor, 'missing', { customerId: 'c1' })).rejects.toThrow(NotFoundException);
    });

    it('creates the assignment and audits it', async () => {
      prisma.priceList.findUnique.mockResolvedValue({ id: 'pl-1' });

      await service.setAssignment(actor, 'pl-1', { customerId: 'c1' });

      expect(prisma.priceListAssignment.create).toHaveBeenCalledWith({ data: { priceListId: 'pl-1', customerId: 'c1', tagId: undefined } });
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe('removeAssignment', () => {
    const actor = { id: 'user-1' } as any;

    it('throws NotFoundException for an unknown assignment', async () => {
      prisma.priceListAssignment.findUnique.mockResolvedValue(null);
      await expect(service.removeAssignment(actor, 'missing')).rejects.toThrow(NotFoundException);
    });

    it('deletes the assignment and audits the before-state', async () => {
      prisma.priceListAssignment.findUnique.mockResolvedValue({ id: 'a1', customerId: 'c1', tagId: null });

      await service.removeAssignment(actor, 'a1');

      expect(prisma.priceListAssignment.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
      expect(audit.record).toHaveBeenCalled();
    });
  });
});
