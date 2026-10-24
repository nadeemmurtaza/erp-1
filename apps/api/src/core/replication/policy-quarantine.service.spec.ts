import { NotFoundException } from '@nestjs/common';
import { PolicyQuarantineService } from './policy-quarantine.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PolicyQuarantineService — WO-23.3c/e, RETAIL-ERP.md R9, ADR-023', () => {
  let service: PolicyQuarantineService;
  let prisma: any;

  const INPUT = {
    originNodeId: 'branch-lhr01',
    entity: 'GoodsReceipt',
    entityId: 'gr1',
    policyKey: 'allowBranchLocalPurchasing',
    retailBrandId: 'b1',
    payload: { scopeLevel: 'BRANCH' },
    reason: 'Branch "branch-lhr01" raised a GoodsReceipt at BRANCH scope, but its brand disallows it.',
  };

  beforeEach(() => {
    prisma = {
      policyQuarantine: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    };
    service = new PolicyQuarantineService(prisma as PrismaService);
  });

  it('stores a quarantined record with its policyKey and reason, OPEN by default', async () => {
    prisma.policyQuarantine.create.mockResolvedValue({ id: 'q1' });

    await service.quarantine(INPUT);

    expect(prisma.policyQuarantine.create).toHaveBeenCalledWith({
      data: {
        originNodeId: 'branch-lhr01',
        entity: 'GoodsReceipt',
        entityId: 'gr1',
        policyKey: 'allowBranchLocalPurchasing',
        retailBrandId: 'b1',
        payload: { scopeLevel: 'BRANCH' },
        reason: INPUT.reason,
      },
    });
  });

  it('lists only OPEN records, oldest first', async () => {
    await service.listOpen();

    expect(prisma.policyQuarantine.findMany).toHaveBeenCalledWith({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
    });
  });

  describe('resolve', () => {
    it('404s for a record that does not exist', async () => {
      prisma.policyQuarantine.findUnique.mockResolvedValue(null);

      await expect(service.resolve('missing', 'user1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.policyQuarantine.update).not.toHaveBeenCalled();
    });

    it('marks it RESOLVED with the reviewing actor and their note', async () => {
      prisma.policyQuarantine.findUnique.mockResolvedValue({ id: 'q1', status: 'OPEN' });
      prisma.policyQuarantine.update.mockResolvedValue({ id: 'q1', status: 'RESOLVED' });

      const result = await service.resolve('q1', 'user1', 'Confirmed with the branch manager — approved.');

      expect(result.status).toBe('RESOLVED');
      expect(prisma.policyQuarantine.update).toHaveBeenCalledWith({
        where: { id: 'q1' },
        data: {
          status: 'RESOLVED',
          resolvedAt: expect.any(Date),
          resolvedById: 'user1',
          resolvedNote: 'Confirmed with the branch manager — approved.',
        },
      });
    });
  });
});
