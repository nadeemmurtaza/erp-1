import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ReplicationCursor, ReplicationDirection } from '../prisma/client';

/**
 * "The highest sequence I've already synced with this peer, in this
 * direction" — read by `ReplicationSyncAgent` (WO-20.2) before asking a
 * peer for what comes next, and advanced only after a batch is durably
 * applied. Keyed by `(peerNodeId, direction)` — see replication.prisma's
 * own comment on `ReplicationCursor` for why one row per peer isn't
 * enough. No peer is configured under `NODE_ROLE=STANDALONE`, so this sits
 * unused until a deployment actually joins a chain.
 */
@Injectable()
export class ReplicationCursorService {
  constructor(private readonly prisma: PrismaService) {}

  async get(peerNodeId: string, direction: ReplicationDirection): Promise<ReplicationCursor | null> {
    return this.prisma.replicationCursor.findUnique({
      where: { peerNodeId_direction: { peerNodeId, direction } },
    });
  }

  /**
   * Refuses to move a cursor backward — a peer's sync agent retrying an
   * already-applied batch (at-least-once delivery) must never un-advance
   * progress another concurrent apply already recorded.
   */
  async advance(peerNodeId: string, direction: ReplicationDirection, sequence: bigint): Promise<ReplicationCursor> {
    const existing = await this.get(peerNodeId, direction);
    if (existing && sequence <= existing.lastSequence) return existing;

    return this.prisma.replicationCursor.upsert({
      where: { peerNodeId_direction: { peerNodeId, direction } },
      create: { peerNodeId, direction, lastSequence: sequence, lastSyncAt: new Date() },
      update: { lastSequence: sequence, lastSyncAt: new Date() },
    });
  }
}
