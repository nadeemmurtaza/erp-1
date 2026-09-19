import { ReplicationLogService } from './replication-log.service';
import { ReplicationRegistry } from './replication.registry';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';

describe('ReplicationLogService — WO-20.1', () => {
  let service: ReplicationLogService;
  let prisma: any;
  let config: any;
  let registry: ReplicationRegistry;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ value: 1n }]),
      replicationRecord: { create: jest.fn().mockResolvedValue({}) },
    };
    config = { isChainNode: true, nodeId: 'brand1' };
    registry = new ReplicationRegistry();
    service = new ReplicationLogService(prisma as PrismaService, config as AppConfigService, registry);
  });

  it('is a no-op under STANDALONE — R14, chain machinery invisible in Solo', async () => {
    config.isChainNode = false;
    registry.register('Order', { dataClass: 'FACT', direction: 'UP', apply: jest.fn() });

    await service.append('Order', 'ord1', 'UPSERT', { total: 100 }, 1, new Date());

    expect(prisma.replicationRecord.create).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('refuses to log an entity nobody registered', async () => {
    await expect(service.append('Unknown', 'x1', 'UPSERT', {}, 1, new Date())).rejects.toThrow(
      /not registered with ReplicationRegistry/,
    );
    expect(prisma.replicationRecord.create).not.toHaveBeenCalled();
  });

  it('logs a FACT with the registered classification, this node as origin, and the allocated sequence', async () => {
    registry.register('Order', { dataClass: 'FACT', direction: 'UP', apply: jest.fn() });
    const occurredAt = new Date('2026-01-01');

    await service.append('Order', 'ord1', 'UPSERT', { total: 100 }, 1, occurredAt);

    expect(prisma.replicationRecord.create).toHaveBeenCalledWith({
      data: {
        originNodeId: 'brand1',
        sequence: 1n,
        entity: 'Order',
        entityId: 'ord1',
        dataClass: 'FACT',
        direction: 'UP',
        op: 'UPSERT',
        payload: { total: 100 },
        schemaVersion: 1,
        occurredAt,
      },
    });
  });

  it('writes through a caller-supplied transaction instead of the default PrismaService', async () => {
    registry.register('Product', { dataClass: 'POLICY', direction: 'DOWN', apply: jest.fn() });
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ value: 5n }]),
      replicationRecord: { create: jest.fn().mockResolvedValue({}) },
    };

    await service.append('Product', 'p1', 'UPSERT', {}, 1, new Date(), tx);

    expect(tx.replicationRecord.create).toHaveBeenCalledTimes(1);
    expect(prisma.replicationRecord.create).not.toHaveBeenCalled();
  });
});
