import { ReplicationCursorService } from './replication-cursor.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReplicationCursorService — WO-20.1', () => {
  let service: ReplicationCursorService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      replicationCursor: { findUnique: jest.fn(), upsert: jest.fn() },
    };
    service = new ReplicationCursorService(prisma as PrismaService);
  });

  describe('get', () => {
    it('returns null when no cursor exists for the peer', async () => {
      prisma.replicationCursor.findUnique.mockResolvedValue(null);

      expect(await service.get('branch-lhr01')).toBeNull();
    });
  });

  describe('advance', () => {
    it('creates a cursor for a peer that has none yet', async () => {
      prisma.replicationCursor.findUnique.mockResolvedValue(null);
      prisma.replicationCursor.upsert.mockResolvedValue({ peerNodeId: 'brand1', lastSequence: 10n });

      await service.advance('brand1', 10n);

      expect(prisma.replicationCursor.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { peerNodeId: 'brand1' },
          create: expect.objectContaining({ peerNodeId: 'brand1', lastSequence: 10n }),
        }),
      );
    });

    it('moves the cursor forward', async () => {
      prisma.replicationCursor.findUnique.mockResolvedValue({ peerNodeId: 'brand1', lastSequence: 10n });
      prisma.replicationCursor.upsert.mockResolvedValue({ peerNodeId: 'brand1', lastSequence: 15n });

      await service.advance('brand1', 15n);

      expect(prisma.replicationCursor.upsert).toHaveBeenCalled();
    });

    it('refuses to move the cursor backward — a retried batch must not un-advance progress', async () => {
      const existing = { peerNodeId: 'brand1', lastSequence: 10n, lastSyncAt: new Date() };
      prisma.replicationCursor.findUnique.mockResolvedValue(existing);

      const result = await service.advance('brand1', 5n);

      expect(result).toBe(existing);
      expect(prisma.replicationCursor.upsert).not.toHaveBeenCalled();
    });

    it('leaves the cursor unchanged when the sequence exactly repeats — idempotent retry', async () => {
      const existing = { peerNodeId: 'brand1', lastSequence: 10n, lastSyncAt: new Date() };
      prisma.replicationCursor.findUnique.mockResolvedValue(existing);

      const result = await service.advance('brand1', 10n);

      expect(result).toBe(existing);
      expect(prisma.replicationCursor.upsert).not.toHaveBeenCalled();
    });
  });
});
