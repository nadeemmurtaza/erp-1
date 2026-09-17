import { ReplicationCursorService } from './replication-cursor.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReplicationCursorService — WO-20.1 / WO-20.2', () => {
  let service: ReplicationCursorService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      replicationCursor: { findUnique: jest.fn(), upsert: jest.fn() },
    };
    service = new ReplicationCursorService(prisma as PrismaService);
  });

  describe('get', () => {
    it('returns null when no cursor exists for the peer in that direction', async () => {
      prisma.replicationCursor.findUnique.mockResolvedValue(null);

      expect(await service.get('branch-lhr01', 'UP')).toBeNull();
      expect(prisma.replicationCursor.findUnique).toHaveBeenCalledWith({
        where: { peerNodeId_direction: { peerNodeId: 'branch-lhr01', direction: 'UP' } },
      });
    });
  });

  describe('advance', () => {
    it('creates a cursor for a peer/direction that has none yet', async () => {
      prisma.replicationCursor.findUnique.mockResolvedValue(null);
      prisma.replicationCursor.upsert.mockResolvedValue({ peerNodeId: 'brand1', direction: 'UP', lastSequence: 10n });

      await service.advance('brand1', 'UP', 10n);

      expect(prisma.replicationCursor.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { peerNodeId_direction: { peerNodeId: 'brand1', direction: 'UP' } },
          create: expect.objectContaining({ peerNodeId: 'brand1', direction: 'UP', lastSequence: 10n }),
        }),
      );
    });

    it('moves the cursor forward', async () => {
      prisma.replicationCursor.findUnique.mockResolvedValue({ peerNodeId: 'brand1', direction: 'UP', lastSequence: 10n });
      prisma.replicationCursor.upsert.mockResolvedValue({ peerNodeId: 'brand1', direction: 'UP', lastSequence: 15n });

      await service.advance('brand1', 'UP', 15n);

      expect(prisma.replicationCursor.upsert).toHaveBeenCalled();
    });

    it('refuses to move the cursor backward — a retried batch must not un-advance progress', async () => {
      const existing = { peerNodeId: 'brand1', direction: 'UP', lastSequence: 10n, lastSyncAt: new Date() };
      prisma.replicationCursor.findUnique.mockResolvedValue(existing);

      const result = await service.advance('brand1', 'UP', 5n);

      expect(result).toBe(existing);
      expect(prisma.replicationCursor.upsert).not.toHaveBeenCalled();
    });

    it('leaves the cursor unchanged when the sequence exactly repeats — idempotent retry', async () => {
      const existing = { peerNodeId: 'brand1', direction: 'UP', lastSequence: 10n, lastSyncAt: new Date() };
      prisma.replicationCursor.findUnique.mockResolvedValue(existing);

      const result = await service.advance('brand1', 'UP', 10n);

      expect(result).toBe(existing);
      expect(prisma.replicationCursor.upsert).not.toHaveBeenCalled();
    });

    it('advancing DOWN for a peer never reads or blocks on that same peer\'s UP cursor', async () => {
      prisma.replicationCursor.findUnique.mockResolvedValue(null);
      prisma.replicationCursor.upsert.mockResolvedValue({ peerNodeId: 'parent', direction: 'DOWN', lastSequence: 5n });

      await service.advance('parent', 'DOWN', 5n);

      expect(prisma.replicationCursor.findUnique).toHaveBeenCalledWith({
        where: { peerNodeId_direction: { peerNodeId: 'parent', direction: 'DOWN' } },
      });
    });
  });
});
