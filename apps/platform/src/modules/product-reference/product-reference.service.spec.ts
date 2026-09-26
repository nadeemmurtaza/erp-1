import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProductReferenceService } from './product-reference.service';

describe('ProductReferenceService', () => {
  let prisma: any;
  let tx: any;
  let service: ProductReferenceService;

  beforeEach(() => {
    tx = {
      globalProductReferenceTranslation: { deleteMany: jest.fn(), createMany: jest.fn() },
      globalProductReferenceImage: { deleteMany: jest.fn(), createMany: jest.fn() },
      globalProductReference: { update: jest.fn() },
    };
    prisma = {
      globalProductReference: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      globalProductReferenceLink: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
      globalProductReferenceFlag: { create: jest.fn() },
      $transaction: jest.fn((work: (client: unknown) => unknown) => work(tx)),
    };
    service = new ProductReferenceService(prisma);
  });

  describe('lookup', () => {
    it('returns null (never throws) when no reference matches the barcode', async () => {
      prisma.globalProductReference.findUnique.mockResolvedValue(null);
      await expect(service.lookup('12345678')).resolves.toBeNull();
    });

    it('returns the matching reference with its translations and images', async () => {
      const reference = { id: 'ref-1', barcode: '12345678', translations: [], images: [] };
      prisma.globalProductReference.findUnique.mockResolvedValue(reference);

      const result = await service.lookup('12345678');

      expect(result).toBe(reference);
      expect(prisma.globalProductReference.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { barcode: '12345678' } }),
      );
    });
  });

  describe('bulkLookup', () => {
    it('bounds the query to the requested barcodes, silently omitting non-matches', async () => {
      prisma.globalProductReference.findMany.mockResolvedValue([{ id: 'ref-1', barcode: '111' }]);

      const result = await service.bulkLookup(['111', '222']);

      expect(result).toEqual([{ id: 'ref-1', barcode: '111' }]);
      expect(prisma.globalProductReference.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { barcode: { in: ['111', '222'] } } }),
      );
    });
  });

  describe('register', () => {
    it('refuses to register a barcode that already has a reference', async () => {
      prisma.globalProductReference.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register('tenant-a', { barcode: '12345678', translations: [{ locale: 'en', name: 'Shirt' }] }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.globalProductReference.create).not.toHaveBeenCalled();
    });

    it('creates a new reference with the calling tenant as registeredByTenantId — never a caller-supplied one', async () => {
      prisma.globalProductReference.findUnique.mockResolvedValue(null);
      prisma.globalProductReference.create.mockResolvedValue({ id: 'ref-1' });

      await service.register('tenant-a', {
        barcode: '12345678',
        translations: [{ locale: 'en', name: 'Shirt' }],
        attributes: { fabric: 'lawn' },
      });

      const [[createArgs]] = prisma.globalProductReference.create.mock.calls;
      expect(createArgs.data.registeredByTenantId).toEqual('tenant-a');
      expect(createArgs.data.barcode).toEqual('12345678');
      expect(createArgs.data.attributes).toEqual({ fabric: 'lawn' });
    });
  });

  describe('update', () => {
    it('throws NotFoundException for an unknown reference', async () => {
      prisma.globalProductReference.findUnique.mockResolvedValue(null);
      await expect(service.update('tenant-a', 'ref-1', {})).rejects.toThrow(NotFoundException);
    });

    it('refuses an edit from any tenant other than the one that registered it — the toxic-pair guard', async () => {
      prisma.globalProductReference.findUnique.mockResolvedValue({ id: 'ref-1', registeredByTenantId: 'tenant-a' });

      await expect(service.update('tenant-b', 'ref-1', { attributes: { fabric: 'silk' } })).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('allows the registering tenant to replace translations and images inside one transaction', async () => {
      prisma.globalProductReference.findUnique.mockResolvedValue({ id: 'ref-1', registeredByTenantId: 'tenant-a' });
      tx.globalProductReference.update.mockResolvedValue({ id: 'ref-1' });

      await service.update('tenant-a', 'ref-1', {
        translations: [{ locale: 'en', name: 'Updated name' }],
        images: [{ url: 'https://cdn.test/1.jpg', altText: 'A shirt' }],
      });

      expect(tx.globalProductReferenceTranslation.deleteMany).toHaveBeenCalledWith({ where: { referenceId: 'ref-1' } });
      expect(tx.globalProductReferenceTranslation.createMany).toHaveBeenCalled();
      expect(tx.globalProductReferenceImage.deleteMany).toHaveBeenCalledWith({ where: { referenceId: 'ref-1' } });
      expect(tx.globalProductReferenceImage.createMany).toHaveBeenCalled();
    });
  });

  describe('link', () => {
    it('throws NotFoundException for an unknown reference', async () => {
      prisma.globalProductReference.findUnique.mockResolvedValue(null);
      await expect(service.link('tenant-b', 'ref-1', 'variant-1')).rejects.toThrow(NotFoundException);
    });

    it('upserts on (tenantId, variantRef) so a second link call re-points rather than duplicates', async () => {
      prisma.globalProductReference.findUnique.mockResolvedValue({ id: 'ref-1' });

      await service.link('tenant-b', 'ref-1', 'variant-1');

      expect(prisma.globalProductReferenceLink.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_variantRef: { tenantId: 'tenant-b', variantRef: 'variant-1' } },
        }),
      );
    });

    it('lets a tenant link to a reference it did not register — linking is not editing', async () => {
      prisma.globalProductReference.findUnique.mockResolvedValue({ id: 'ref-1', registeredByTenantId: 'tenant-a' });
      await expect(service.link('tenant-b', 'ref-1', 'variant-1')).resolves.toBeUndefined();
    });
  });

  describe('flag', () => {
    it('throws NotFoundException for an unknown reference', async () => {
      prisma.globalProductReference.findUnique.mockResolvedValue(null);
      await expect(service.flag('tenant-b', 'ref-1', 'wrong photo')).rejects.toThrow(NotFoundException);
    });

    it('records a flag without touching the canonical record — never auto-applied', async () => {
      prisma.globalProductReference.findUnique.mockResolvedValue({ id: 'ref-1' });

      await service.flag('tenant-b', 'ref-1', 'wrong photo');

      expect(prisma.globalProductReferenceFlag.create).toHaveBeenCalledWith({
        data: { referenceId: 'ref-1', flaggedByTenantId: 'tenant-b', reason: 'wrong photo' },
      });
      expect(prisma.globalProductReference.update).not.toHaveBeenCalled();
    });
  });

  describe('exportSince', () => {
    it('returns an empty array for a tenant with no links — never a full-table read', async () => {
      prisma.globalProductReferenceLink.findMany.mockResolvedValue([]);

      const result = await service.exportSince('tenant-a');

      expect(result).toEqual([]);
      expect(prisma.globalProductReference.findMany).not.toHaveBeenCalled();
    });

    it('scopes strictly to the calling tenant\'s own linked references', async () => {
      prisma.globalProductReferenceLink.findMany.mockResolvedValue([{ referenceId: 'ref-1' }, { referenceId: 'ref-2' }]);
      prisma.globalProductReference.findMany.mockResolvedValue([]);

      await service.exportSince('tenant-a');

      expect(prisma.globalProductReferenceLink.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'tenant-a' } }),
      );
      const [[findManyArgs]] = prisma.globalProductReference.findMany.mock.calls;
      expect(findManyArgs.where.id).toEqual({ in: ['ref-1', 'ref-2'] });
      expect(findManyArgs.where.updatedAt).toBeUndefined();
    });

    it('filters by updatedAt when a since cursor is given', async () => {
      prisma.globalProductReferenceLink.findMany.mockResolvedValue([{ referenceId: 'ref-1' }]);
      prisma.globalProductReference.findMany.mockResolvedValue([]);
      const since = new Date('2026-09-01T00:00:00Z');

      await service.exportSince('tenant-a', since);

      const [[findManyArgs]] = prisma.globalProductReference.findMany.mock.calls;
      expect(findManyArgs.where.updatedAt).toEqual({ gt: since });
    });
  });
});
