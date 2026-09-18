import { ProductReplicationListener } from './product-replication.listener';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ReplicationRegistry } from '../../core/replication/replication.registry';
import { ReplicationLogService } from '../../core/replication/replication-log.service';
import type { ReplicationApplyInput } from '../../core/replication/replication.types';

describe('ProductReplicationListener — WO-20.3', () => {
  let listener: ProductReplicationListener;
  let prisma: any;
  let registry: any;
  let log: any;

  beforeEach(() => {
    prisma = { product: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) } };
    registry = { register: jest.fn() };
    log = { append: jest.fn().mockResolvedValue(undefined) };
    listener = new ProductReplicationListener(prisma as PrismaService, registry as ReplicationRegistry, log as ReplicationLogService);
  });

  describe('onModuleInit', () => {
    it('registers Product as a POLICY entity flowing DOWN', () => {
      listener.onModuleInit();

      expect(registry.register).toHaveBeenCalledWith(
        'Product',
        expect.objectContaining({ dataClass: 'POLICY', direction: 'DOWN', apply: expect.any(Function) }),
      );
    });
  });

  describe('onProductPublished', () => {
    it('logs the payload ProductAdminService already published, unchanged', async () => {
      const payload = { productId: 'p1', slug: 'shirt', nameEn: 'Shirt', basePriceMinor: 1000 };

      await listener.onProductPublished(payload);

      expect(log.append).toHaveBeenCalledWith('Product', 'p1', 'UPSERT', payload, 1, expect.any(Date));
    });
  });

  describe('onProductPriceChanged', () => {
    it('logs the price-change payload unchanged', async () => {
      const payload = { productId: 'p1', slug: 'shirt', nameEn: 'Shirt', oldPriceMinor: 1000, newPriceMinor: 1200 };

      await listener.onProductPriceChanged(payload);

      expect(log.append).toHaveBeenCalledWith('Product', 'p1', 'UPSERT', payload, 1, expect.any(Date));
    });
  });

  describe('applyIncoming (via the registered descriptor)', () => {
    async function apply(input: ReplicationApplyInput) {
      listener.onModuleInit();
      const descriptor = registry.register.mock.calls[0][1];
      return descriptor.apply(input);
    }

    it('updates basePrice on a product that already exists locally, from a price-change payload', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'p1' });

      await apply({
        entityId: 'p1',
        op: 'UPSERT',
        payload: { productId: 'p1', slug: 'shirt', nameEn: 'Shirt', oldPriceMinor: 1000, newPriceMinor: 1200 },
        schemaVersion: 1,
        originNodeId: 'brand1',
        occurredAt: new Date(),
      });

      expect(prisma.product.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { basePrice: 1200 } });
    });

    it('updates basePrice from a product-published payload too (basePriceMinor)', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'p1' });

      await apply({
        entityId: 'p1',
        op: 'UPSERT',
        payload: { productId: 'p1', slug: 'shirt', nameEn: 'Shirt', basePriceMinor: 900 },
        schemaVersion: 1,
        originNodeId: 'brand1',
        occurredAt: new Date(),
      });

      expect(prisma.product.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { basePrice: 900 } });
    });

    it('throws (quarantining, not silently creating) when the product does not exist locally yet', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        apply({
          entityId: 'unknown',
          op: 'UPSERT',
          payload: { productId: 'unknown', slug: 'new', nameEn: 'New', basePriceMinor: 500 },
          schemaVersion: 1,
          originNodeId: 'brand1',
          occurredAt: new Date(),
        }),
      ).rejects.toThrow(/not yet known locally/);
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('throws when the payload carries no price at all', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'p1' });

      await expect(
        apply({
          entityId: 'p1',
          op: 'UPSERT',
          payload: { productId: 'p1' },
          schemaVersion: 1,
          originNodeId: 'brand1',
          occurredAt: new Date(),
        }),
      ).rejects.toThrow(/carries no price/);
    });
  });
});
