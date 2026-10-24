import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SpotCheckService } from './spot-check.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { InventoryService } from './inventory.service';

describe('SpotCheckService — 156-single-employee-branch-loss-prevention.md §3', () => {
  let service: SpotCheckService;
  let prisma: any;
  let tx: any;
  let inventory: any;

  beforeEach(() => {
    tx = {
      spotCheck: { findUnique: jest.fn(), update: jest.fn() },
      productVariant: { findUnique: jest.fn() },
      spotCheckLine: { findUnique: jest.fn(), update: jest.fn() },
      variantLocationStock: { findMany: jest.fn() },
    };
    prisma = {
      spotCheckPolicy: { findMany: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      spotCheck: { findFirst: jest.fn(), create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
      location: { findMany: jest.fn() },
      $queryRaw: jest.fn(),
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    inventory = { moveMany: jest.fn() };
    service = new SpotCheckService(prisma as PrismaService, inventory as InventoryService);
  });

  describe('dueForRandomCheck — the unpredictability rule', () => {
    it('is never due before its own frequency window has elapsed', () => {
      const policy = { frequencyDays: 3 };
      const lastScheduledFor = new Date('2026-01-01T00:00:00Z');
      const now = new Date('2026-01-02T00:00:00Z'); // 1 day later, of 3

      expect(service.dueForRandomCheck(policy, lastScheduledFor, now, () => 0)).toBe(false);
    });

    it('can fire once overdue, but only probabilistically — never guaranteed on the very first overdue tick', () => {
      const policy = { frequencyDays: 3 };
      const lastScheduledFor = new Date('2026-01-01T00:00:00Z');
      const now = new Date('2026-01-05T00:00:00Z'); // overdue

      expect(service.dueForRandomCheck(policy, lastScheduledFor, now, () => 0)).toBe(true); // rng returns 0, always fires
      expect(service.dueForRandomCheck(policy, lastScheduledFor, now, () => 0.999999)).toBe(false); // rng near 1, never fires
    });

    it('samples many runs and lands on a spread of hours, never a fixed one', () => {
      const policy = { frequencyDays: 1 };
      const lastScheduledFor = new Date('2026-01-01T00:00:00Z');
      const fireHours = new Set<number>();

      for (let hour = 24; hour < 24 * 10; hour++) {
        const now = new Date(lastScheduledFor.getTime() + hour * 60 * 60 * 1000);
        // A seeded, varying rng standing in for Math.random — deterministic
        // across a test run but different per call, the same property real
        // randomness gives the unpredictability the document requires.
        const rng = () => (hour * 2654435761) % 1000 / 1000;
        if (service.dueForRandomCheck(policy, lastScheduledFor, now, rng)) {
          fireHours.add(hour % 24);
        }
      }

      // Never fires only ever at the same hour-of-day, across many overdue ticks.
      expect(fireHours.size).toBeGreaterThan(1);
    });

    it('settles a policy with no history into the same cadence as an overdue one, never firing on the very first tick unconditionally', () => {
      const policy = { frequencyDays: 5 };
      expect(service.dueForRandomCheck(policy, null, new Date(), () => 0.999999)).toBe(false);
      expect(service.dueForRandomCheck(policy, null, new Date(), () => 0)).toBe(true);
    });
  });

  describe('maybeTriggerDueChecks — idempotency', () => {
    it('never doubles a check already PENDING or IN_PROGRESS for the same policy+location', async () => {
      prisma.spotCheckPolicy.findMany.mockResolvedValue([{ id: 'p1', locationId: 'loc1', isActive: true, frequencyDays: 3, minSkusPerCheck: 5 }]);
      prisma.spotCheck.findFirst.mockResolvedValue({ id: 'existing', status: 'PENDING', scheduledFor: new Date() });

      const created = await service.maybeTriggerDueChecks(new Date());

      expect(created).toEqual([]);
      expect(prisma.spotCheck.create).not.toHaveBeenCalled();
    });

    it('creates nothing when no location has any VariantLocationStock to sample', async () => {
      prisma.spotCheckPolicy.findMany.mockResolvedValue([{ id: 'p1', locationId: 'loc1', isActive: true, frequencyDays: 3, minSkusPerCheck: 5 }]);
      prisma.spotCheck.findFirst.mockResolvedValue(null);
      prisma.$queryRaw.mockResolvedValue([]);

      const created = await service.maybeTriggerDueChecks(new Date(Date.now() + 100 * 24 * 60 * 60 * 1000));

      expect(created).toEqual([]);
      expect(prisma.spotCheck.create).not.toHaveBeenCalled();
    });
  });

  describe('complete — posts variance against CURRENT stock, never `expected`', () => {
    it('a sale mid-check does not read as shrinkage — variance is counted minus CURRENT, not minus expected', async () => {
      tx.spotCheck.findUnique.mockResolvedValue({
        id: 'sc1',
        status: 'IN_PROGRESS',
        locationId: 'loc1',
        lines: [{ id: 'l1', variantId: 'v1', expected: 10, counted: 7 }],
      });
      // Current stock has since dropped to 8 (a sale happened mid-check) — a
      // naive counted-minus-expected (7-10=-3) would read as -3 shrinkage;
      // the correct variance against CURRENT stock is 7-8=-1.
      tx.variantLocationStock.findMany.mockResolvedValue([{ variantId: 'v1', quantity: 8 }]);
      tx.spotCheckLine.update.mockResolvedValue({});
      tx.spotCheck.update.mockResolvedValue({ id: 'sc1', status: 'COMPLETED' });

      await service.complete('sc1', 'u1');

      expect(tx.spotCheckLine.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { variance: -1 } });
      expect(inventory.moveMany).toHaveBeenCalledWith(
        [expect.objectContaining({ variantId: 'v1', locationId: 'loc1', delta: -1, reason: 'COUNT', refType: 'SpotCheck', refId: 'sc1' })],
        tx,
      );
    });

    it('writes zero movements when every counted line matches current stock exactly', async () => {
      tx.spotCheck.findUnique.mockResolvedValue({
        id: 'sc1',
        status: 'IN_PROGRESS',
        locationId: 'loc1',
        lines: [{ id: 'l1', variantId: 'v1', expected: 10, counted: 10 }],
      });
      tx.variantLocationStock.findMany.mockResolvedValue([{ variantId: 'v1', quantity: 10 }]);
      tx.spotCheck.update.mockResolvedValue({ id: 'sc1', status: 'COMPLETED' });

      await service.complete('sc1', 'u1');

      expect(inventory.moveMany).not.toHaveBeenCalled();
    });

    it('refuses to complete a check that is not IN_PROGRESS', async () => {
      tx.spotCheck.findUnique.mockResolvedValue({ id: 'sc1', status: 'PENDING', locationId: 'loc1', lines: [] });

      await expect(service.complete('sc1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404s for a spot check that does not exist', async () => {
      tx.spotCheck.findUnique.mockResolvedValue(null);

      await expect(service.complete('missing', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
