import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StockVarianceService } from './stock-variance.service';
import { PrismaService } from '../../core/prisma/prisma.service';

describe('StockVarianceService — WO-21.3', () => {
  let service: StockVarianceService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      stockVariance: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      posShift: { findUniqueOrThrow: jest.fn() },
    };
    service = new StockVarianceService(prisma as PrismaService);
  });

  it('lists only OPEN variances, oldest first', async () => {
    await service.listOpen();

    expect(prisma.stockVariance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'OPEN' }, orderBy: { createdAt: 'asc' } }),
    );
  });

  describe('resolve', () => {
    it('404s for a variance that does not exist', async () => {
      prisma.stockVariance.findUnique.mockResolvedValue(null);

      await expect(service.resolve('missing', 'u1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.stockVariance.update).not.toHaveBeenCalled();
    });

    it('marks it RESOLVED with the resolver and an optional note', async () => {
      prisma.stockVariance.findUnique.mockResolvedValue({ id: 'v1', status: 'OPEN' });
      prisma.stockVariance.update.mockResolvedValue({ id: 'v1', status: 'RESOLVED' });

      await service.resolve('v1', 'u2', 'counted the shelf, matches');

      expect(prisma.stockVariance.update).toHaveBeenCalledWith({
        where: { id: 'v1' },
        data: {
          status: 'RESOLVED',
          resolvedAt: expect.any(Date),
          resolvedByUserId: 'u2',
          resolutionNote: 'counted the shelf, matches',
        },
      });
    });

    it('never reverses or re-posts anything — it only flips status', async () => {
      prisma.stockVariance.findUnique.mockResolvedValue({ id: 'v1', status: 'OPEN' });
      prisma.stockVariance.update.mockResolvedValue({ id: 'v1', status: 'RESOLVED' });

      await service.resolve('v1', 'u2');

      expect(prisma.stockVariance.update).toHaveBeenCalledTimes(1);
    });

    // 156-single-employee-branch-loss-prevention.md §2 — the toxic-pair
    // refusal: the employee whose shift is linked to a variance can never
    // resolve it themselves, whether they opened or closed that shift.
    it('refuses when the resolver is the shift OPENER', async () => {
      prisma.stockVariance.findUnique.mockResolvedValue({ id: 'v1', status: 'OPEN', posShiftId: 's1' });
      prisma.posShift.findUniqueOrThrow.mockResolvedValue({ id: 's1', openedByUserId: 'u1', closedByUserId: null });

      await expect(service.resolve('v1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.stockVariance.update).not.toHaveBeenCalled();
    });

    it('refuses when the resolver is the shift CLOSER', async () => {
      prisma.stockVariance.findUnique.mockResolvedValue({ id: 'v1', status: 'OPEN', posShiftId: 's1' });
      prisma.posShift.findUniqueOrThrow.mockResolvedValue({ id: 's1', openedByUserId: 'u1', closedByUserId: 'u2' });

      await expect(service.resolve('v1', 'u2')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.stockVariance.update).not.toHaveBeenCalled();
    });

    it('allows a third party to resolve a variance linked to someone else\'s shift', async () => {
      prisma.stockVariance.findUnique.mockResolvedValue({ id: 'v1', status: 'OPEN', posShiftId: 's1' });
      prisma.posShift.findUniqueOrThrow.mockResolvedValue({ id: 's1', openedByUserId: 'u1', closedByUserId: 'u1' });
      prisma.stockVariance.update.mockResolvedValue({ id: 'v1', status: 'RESOLVED' });

      await service.resolve('v1', 'manager1');

      expect(prisma.stockVariance.update).toHaveBeenCalledTimes(1);
    });

    it('needs no shift check at all when the variance was never attributed to one', async () => {
      prisma.stockVariance.findUnique.mockResolvedValue({ id: 'v1', status: 'OPEN', posShiftId: null });
      prisma.stockVariance.update.mockResolvedValue({ id: 'v1', status: 'RESOLVED' });

      await service.resolve('v1', 'u1');

      expect(prisma.posShift.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(prisma.stockVariance.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('listByShift', () => {
    it('only returns variances that were attributed to a shift', async () => {
      await service.listByShift('loc1');

      expect(prisma.stockVariance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { locationId: 'loc1', posShiftId: { not: null } } }),
      );
    });
  });
});
