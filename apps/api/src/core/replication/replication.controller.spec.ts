import { UnauthorizedException } from '@nestjs/common';
import { ReplicationController } from './replication.controller';

describe('ReplicationController — WO-20.2', () => {
  let controller: ReplicationController;
  let nodeCredential: any;
  let cursor: any;
  let apply: any;
  let prisma: any;
  let config: any;

  beforeEach(() => {
    nodeCredential = { verify: jest.fn().mockResolvedValue({ id: '1', nodeId: 'lhr-01', status: 'ACTIVE' }) };
    cursor = { advance: jest.fn().mockResolvedValue({}) };
    apply = { apply: jest.fn().mockResolvedValue(undefined) };
    prisma = { replicationRecord: { findMany: jest.fn().mockResolvedValue([]) } };
    config = { nodeId: 'brand1' };
    controller = new ReplicationController(nodeCredential, cursor, apply, prisma, config);
  });

  describe('push', () => {
    it('refuses a request with no Authorization header before calling anything', async () => {
      await expect(controller.push(undefined, { records: [] })).rejects.toBeInstanceOf(UnauthorizedException);
      expect(nodeCredential.verify).not.toHaveBeenCalled();
    });

    it('applies each record with originNodeId always the authenticated caller\'s own nodeId, never the payload\'s', async () => {
      await controller.push('Bearer node_raw', {
        records: [
          {
            sequence: '5',
            entity: 'Order',
            entityId: 'ord1',
            op: 'UPSERT',
            payload: { spoofedOrigin: 'someone-else' },
            schemaVersion: 1,
            occurredAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });

      expect(apply.apply).toHaveBeenCalledWith(
        expect.objectContaining({ originNodeId: 'lhr-01', sequence: 5n, entity: 'Order' }),
      );
    });

    it('advances the UP cursor to the highest sequence pushed', async () => {
      await controller.push('Bearer node_raw', {
        records: [
          { sequence: '3', entity: 'Order', entityId: 'o1', op: 'UPSERT', payload: {}, schemaVersion: 1, occurredAt: '2026-01-01T00:00:00.000Z' },
          { sequence: '7', entity: 'Order', entityId: 'o2', op: 'UPSERT', payload: {}, schemaVersion: 1, occurredAt: '2026-01-01T00:00:00.000Z' },
        ],
      });

      expect(cursor.advance).toHaveBeenCalledWith('lhr-01', 'UP', 7n);
    });

    it('does not advance the cursor for an empty push', async () => {
      await controller.push('Bearer node_raw', { records: [] });

      expect(cursor.advance).not.toHaveBeenCalled();
    });
  });

  describe('pull', () => {
    it('refuses a request with no Authorization header', async () => {
      await expect(controller.pull(undefined, undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns this node\'s own DOWN/POLICY records newer than the cursor, with this node\'s own nodeId', async () => {
      prisma.replicationRecord.findMany.mockResolvedValue([
        {
          sequence: 9n,
          entity: 'Product',
          entityId: 'p1',
          op: 'UPSERT',
          payload: { name: 'Shirt' },
          schemaVersion: 1,
          occurredAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const result = await controller.pull('Bearer node_raw', '3');

      expect(prisma.replicationRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { direction: 'DOWN', dataClass: 'POLICY', sequence: { gt: 3n } },
        }),
      );
      expect(result.originNodeId).toBe('brand1');
      expect(result.records[0]).toMatchObject({ sequence: '9', entity: 'Product' });
      expect(result.hasMore).toBe(false);
    });

    it('defaults since to 0 when omitted', async () => {
      await controller.pull('Bearer node_raw', undefined);

      expect(prisma.replicationRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ sequence: { gt: 0n } }) }),
      );
    });
  });
});
