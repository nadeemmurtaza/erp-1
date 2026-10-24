import { ReplicationSyncAgent } from './replication-sync.agent';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { ReplicationCursorService } from './replication-cursor.service';
import { ReplicationApplyService } from './replication-apply.service';

describe('ReplicationSyncAgent — WO-20.2 / WO-20.5', () => {
  let agent: ReplicationSyncAgent;
  let prisma: any;
  let config: any;
  let cursor: any;
  let apply: any;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = { replicationRecord: { findMany: jest.fn().mockResolvedValue([]) } };
    config = { isChainNode: true, nodeId: 'lhr-01', parentUrl: 'https://brand1.example', parentApiKey: 'parent_key' };
    cursor = { get: jest.fn().mockResolvedValue(null), advance: jest.fn().mockResolvedValue({}) };
    apply = { apply: jest.fn().mockResolvedValue(undefined) };
    fetchSpy = jest.spyOn(global, 'fetch');

    agent = new ReplicationSyncAgent(
      prisma as PrismaService,
      config as AppConfigService,
      cursor as ReplicationCursorService,
      apply as ReplicationApplyService,
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('tick', () => {
    it('does nothing when this node has no parent to sync with', async () => {
      config.isChainNode = false;

      await agent.tick();

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does nothing when PARENT_URL or PARENT_API_KEY is missing', async () => {
      config.parentApiKey = undefined;

      await agent.tick();

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('pushFacts', () => {
    it('does nothing when there is nothing new to push', async () => {
      prisma.replicationRecord.findMany.mockResolvedValue([]);

      await agent.pushFacts();

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('posts unpushed FACT rows to the parent and advances the UP cursor to the highest sequence sent', async () => {
      prisma.replicationRecord.findMany.mockResolvedValue([
        { sequence: 3n, entity: 'Order', entityId: 'o1', op: 'UPSERT', payload: { total: 100 }, schemaVersion: 1, occurredAt: new Date('2026-01-01') },
        { sequence: 4n, entity: 'Order', entityId: 'o2', op: 'UPSERT', payload: { total: 200 }, schemaVersion: 1, occurredAt: new Date('2026-01-02') },
      ]);
      fetchSpy.mockResolvedValue({ ok: true, status: 200 } as Response);

      await agent.pushFacts();

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://brand1.example/api/v1/replication/push',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer parent_key' }),
        }),
      );
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.records).toHaveLength(2);
      expect(body.records[0].sequence).toBe('3');
      expect(cursor.advance).toHaveBeenCalledWith('parent', 'UP', 4n);
    });

    it('only sends rows newer than the current UP cursor', async () => {
      cursor.get.mockResolvedValue({ lastSequence: 10n });

      await agent.pushFacts();

      expect(prisma.replicationRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ sequence: { gt: 10n } }) }),
      );
    });

    it('never throws and never advances the cursor on a non-2xx response', async () => {
      prisma.replicationRecord.findMany.mockResolvedValue([
        { sequence: 1n, entity: 'Order', entityId: 'o1', op: 'UPSERT', payload: {}, schemaVersion: 1, occurredAt: new Date() },
      ]);
      fetchSpy.mockResolvedValue({ ok: false, status: 500 } as Response);

      await expect(agent.pushFacts()).resolves.toBeUndefined();
      expect(cursor.advance).not.toHaveBeenCalled();
    });

    it('never throws when the parent is unreachable', async () => {
      prisma.replicationRecord.findMany.mockResolvedValue([
        { sequence: 1n, entity: 'Order', entityId: 'o1', op: 'UPSERT', payload: {}, schemaVersion: 1, occurredAt: new Date() },
      ]);
      fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(agent.pushFacts()).resolves.toBeUndefined();
      expect(cursor.advance).not.toHaveBeenCalled();
    });
  });

  describe('pullPolicy', () => {
    it('does nothing further when the parent returns no new records', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ originNodeId: 'brand1', records: [], hasMore: false }),
      } as Response);

      await agent.pullPolicy();

      expect(apply.apply).not.toHaveBeenCalled();
      expect(cursor.advance).not.toHaveBeenCalled();
    });

    it('applies every returned record with the parent\'s own nodeId as origin, then advances the DOWN cursor', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          originNodeId: 'brand1',
          records: [
            { sequence: '5', entity: 'Product', entityId: 'p1', op: 'UPSERT', payload: { name: 'Shirt' }, schemaVersion: 1, occurredAt: '2026-01-01T00:00:00.000Z' },
            { sequence: '6', entity: 'Product', entityId: 'p2', op: 'UPSERT', payload: { name: 'Trouser' }, schemaVersion: 1, occurredAt: '2026-01-02T00:00:00.000Z' },
          ],
          hasMore: false,
        }),
      } as Response);

      await agent.pullPolicy();

      expect(apply.apply).toHaveBeenCalledTimes(2);
      expect(apply.apply).toHaveBeenCalledWith(expect.objectContaining({ originNodeId: 'brand1', sequence: 5n }));
      expect(cursor.advance).toHaveBeenCalledWith('parent', 'DOWN', 6n);
    });

    it('requests since the current DOWN cursor', async () => {
      cursor.get.mockResolvedValue({ lastSequence: 12n });
      fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ originNodeId: 'brand1', records: [], hasMore: false }) } as Response);

      await agent.pullPolicy();

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://brand1.example/api/v1/replication/pull?since=12',
        expect.anything(),
      );
    });

    it('never throws on a non-2xx response', async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 401 } as Response);

      await expect(agent.pullPolicy()).resolves.toBeUndefined();
      expect(cursor.advance).not.toHaveBeenCalled();
    });

    it('never throws when the parent is unreachable', async () => {
      fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(agent.pullPolicy()).resolves.toBeUndefined();
    });

    it('drains every page while hasMore is true — WO-20.5 bootstrap-from-cloud, not one page per tick', async () => {
      const cursorState: Array<{ lastSequence: bigint } | null> = [null];
      cursor.get.mockImplementation(async () => cursorState[cursorState.length - 1]);
      cursor.advance.mockImplementation(async (_peer: string, _dir: string, sequence: bigint) => {
        cursorState.push({ lastSequence: sequence });
        return { lastSequence: sequence };
      });

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            originNodeId: 'brand1',
            records: [{ sequence: '1', entity: 'Product', entityId: 'p1', op: 'UPSERT', payload: {}, schemaVersion: 1, occurredAt: '2026-01-01T00:00:00.000Z' }],
            hasMore: true,
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            originNodeId: 'brand1',
            records: [{ sequence: '2', entity: 'Product', entityId: 'p2', op: 'UPSERT', payload: {}, schemaVersion: 1, occurredAt: '2026-01-02T00:00:00.000Z' }],
            hasMore: false,
          }),
        } as Response);

      await agent.pullPolicy();

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy).toHaveBeenNthCalledWith(1, 'https://brand1.example/api/v1/replication/pull?since=0', expect.anything());
      expect(fetchSpy).toHaveBeenNthCalledWith(2, 'https://brand1.example/api/v1/replication/pull?since=1', expect.anything());
      expect(apply.apply).toHaveBeenCalledTimes(2);
    });

    it('stops after a non-2xx page instead of looping forever on a broken parent', async () => {
      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ originNodeId: 'brand1', records: [{ sequence: '1', entity: 'Product', entityId: 'p1', op: 'UPSERT', payload: {}, schemaVersion: 1, occurredAt: '2026-01-01T00:00:00.000Z' }], hasMore: true }),
        } as Response)
        .mockResolvedValueOnce({ ok: false, status: 500 } as Response);

      await agent.pullPolicy();

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
