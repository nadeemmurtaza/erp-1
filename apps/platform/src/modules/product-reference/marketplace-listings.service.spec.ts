import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MarketplaceListingsService } from './marketplace-listings.service';

describe('MarketplaceListingsService — 165-cross-tenant-marketplace-directory.md WO-165.2', () => {
  let prisma: any;
  let service: MarketplaceListingsService;

  beforeEach(() => {
    prisma = {
      marketplaceListing: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    service = new MarketplaceListingsService(prisma);
  });

  describe('publish', () => {
    it('upserts on [tenantId, externalRef] — a re-publish updates, never duplicates', async () => {
      prisma.marketplaceListing.upsert.mockResolvedValue({ id: 'l1' });

      await service.publish('t1', {
        kind: 'PRODUCT',
        externalRef: 'variant-1',
        title: 'Lawn suit',
        description: 'Unstitched three-piece',
        visibleTo: ['RETAILER', 'DISTRIBUTOR'],
      });

      expect(prisma.marketplaceListing.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_externalRef: { tenantId: 't1', externalRef: 'variant-1' } },
          create: expect.objectContaining({ tenantId: 't1', engagementMode: 'DISCOVERY_ONLY' }),
          update: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
    });

    it('honours an explicit DISCOVERY_AND_TRANSACT choice — "let the client choose"', async () => {
      prisma.marketplaceListing.upsert.mockResolvedValue({ id: 'l1' });

      await service.publish('t1', {
        kind: 'SERVICE',
        externalRef: 'svc-1',
        title: 'Bridal stitching',
        description: 'Full bridal package',
        visibleTo: ['DIRECT_CUSTOMER'],
        engagementMode: 'DISCOVERY_AND_TRANSACT',
      });

      expect(prisma.marketplaceListing.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ engagementMode: 'DISCOVERY_AND_TRANSACT' }),
        }),
      );
    });
  });

  describe('the toxic pair — only the publishing tenant may change its own listing', () => {
    it('404s for a listing that does not exist', async () => {
      prisma.marketplaceListing.findUnique.mockResolvedValue(null);
      await expect(service.pause('t1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a tenant that did not publish this listing', async () => {
      prisma.marketplaceListing.findUnique.mockResolvedValue({ id: 'l1', tenantId: 't1' });
      await expect(service.pause('t2', 'l1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.marketplaceListing.update).not.toHaveBeenCalled();
    });

    it('the owning tenant CAN pause/resume/delist', async () => {
      prisma.marketplaceListing.findUnique.mockResolvedValue({ id: 'l1', tenantId: 't1' });
      prisma.marketplaceListing.update.mockImplementation(({ data }: any) => ({ id: 'l1', ...data }));

      expect((await service.pause('t1', 'l1')).status).toBe('PAUSED');
      expect((await service.resume('t1', 'l1')).status).toBe('ACTIVE');
      expect((await service.delist('t1', 'l1')).status).toBe('DELISTED');
    });
  });

  describe('delistAllForTenant — "the grant that ends itself"', () => {
    it('delists every non-delisted listing this tenant owns, in one statement', async () => {
      prisma.marketplaceListing.updateMany.mockResolvedValue({ count: 3 });

      const count = await service.delistAllForTenant('t1');

      expect(prisma.marketplaceListing.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 't1', status: { not: 'DELISTED' } },
        data: { status: 'DELISTED' },
      });
      expect(count).toBe(3);
    });
  });
});
