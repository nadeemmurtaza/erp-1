import { NotFoundException } from '@nestjs/common';
import { ReplicationQuarantineService } from './replication-quarantine.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReplicationQuarantineService — WO-20.1', () => {
  let service: ReplicationQuarantineService;
  let prisma: any;

  const RECORD = {
    originNodeId: 'branch-lhr01',
    sequence: 42n,
    entity: 'Order',
    entityId: 'ord1',
    op: 'UPSERT' as const,
    payload: { total: 100 },
    schemaVersion: 1,
  };

  beforeEach(() => {
    prisma = {
      replicationQuarantine: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    };
    service = new ReplicationQuarantineService(prisma as PrismaService);
  });

  it('stores a quarantined record with its reason, OPEN by default', async () => {
    prisma.replicationQuarantine.create.mockResolvedValue({ id: 'q1' });

    await service.quarantine(RECORD, 'No applier registered for "Order".');

    expect(prisma.replicationQuarantine.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        originNodeId: 'branch-lhr01',
        sequence: 42n,
        entity: 'Order',
        reason: 'No applier registered for "Order".',
      }),
    });
  });

  it('lists only OPEN records, oldest first', async () => {
    await service.listOpen();

    expect(prisma.replicationQuarantine.findMany).toHaveBeenCalledWith({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
    });
  });

  describe('resolve', () => {
    it('404s for a record that does not exist', async () => {
      prisma.replicationQuarantine.findUnique.mockResolvedValue(null);

      await expect(service.resolve('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.replicationQuarantine.update).not.toHaveBeenCalled();
    });

    it('marks it RESOLVED', async () => {
      prisma.replicationQuarantine.findUnique.mockResolvedValue({ id: 'q1', status: 'OPEN' });
      prisma.replicationQuarantine.update.mockResolvedValue({ id: 'q1', status: 'RESOLVED' });

      const result = await service.resolve('q1');

      expect(result.status).toBe('RESOLVED');
      expect(prisma.replicationQuarantine.update).toHaveBeenCalledWith({
        where: { id: 'q1' },
        data: { status: 'RESOLVED', resolvedAt: expect.any(Date) },
      });
    });
  });
});
