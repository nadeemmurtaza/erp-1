import { NotFoundException } from '@nestjs/common';
import { StockVarianceService } from './stock-variance.service';
import { PrismaService } from '../../core/prisma/prisma.service';

describe('StockVarianceService — WO-21.3', () => {
  let service: StockVarianceService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      stockVariance: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
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
  });
});
