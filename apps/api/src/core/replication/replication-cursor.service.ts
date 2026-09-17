import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ReplicationCursor } from '../prisma/client';

/**
 * "The highest sequence I've already applied from this peer" — read by the
 * pull/push agent (WO-20.2, does not exist yet) before asking a peer for
 * what comes next, and advanced only after a batch is durably applied. No
 * peer is configured under `NODE_ROLE=STANDALONE`, so this sits unused
 * until a deployment actually joins a chain — see replication.prisma's own
 * header.
 */
@Injectable()
export class ReplicationCursorService {
  constructor(private readonly prisma: PrismaService) {}

  async get(peerNodeId: string): Promise<ReplicationCursor | null> {
    return this.prisma.replicationCursor.findUnique({ where: { peerNodeId } });
  }

  /**
   * Refuses to move a cursor backward — a peer's sync agent retrying an
   * already-applied batch (WO-20.2's at-least-once delivery) must never
   * un-advance progress another concurrent apply already recorded.
   */
  async advance(peerNodeId: string, sequence: bigint): Promise<ReplicationCursor> {
    const existing = await this.get(peerNodeId);
    if (existing && sequence <= existing.lastSequence) return existing;

    return this.prisma.replicationCursor.upsert({
      where: { peerNodeId },
      create: { peerNodeId, lastSequence: sequence, lastSyncAt: new Date() },
      update: { lastSequence: sequence, lastSyncAt: new Date() },
    });
  }
}
