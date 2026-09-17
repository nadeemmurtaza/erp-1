import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import type { ReplicationOp } from '../prisma/client';
import { ReplicationCursorService } from './replication-cursor.service';
import { ReplicationApplyService } from './replication-apply.service';

const SYNC_INTERVAL_MS = 10_000;
const PUSH_BATCH_SIZE = 100;

/** `'parent'` — a BRANCH or BRAND has exactly one parent, so nothing to disambiguate (see replication.prisma's own comment on `ReplicationCursor`). */
const PARENT_PEER_ID = 'parent';

interface PullResponse {
  originNodeId: string;
  records: Array<{
    sequence: string;
    entity: string;
    entityId: string;
    op: ReplicationOp;
    payload: unknown;
    schemaVersion: number;
    occurredAt: string;
  }>;
  hasMore: boolean;
}

/**
 * The child side of WO-20.2's transport: pushes this node's own FACT log up
 * to its parent, and pulls the parent's POLICY log down, on a timer.
 * Mirrors `OutboxDispatcher`'s `@Interval` + re-entrancy guard shape.
 *
 * A no-op tick whenever this node has no parent to sync with — every
 * deployment today (`isChainNode` false, or `PARENT_URL`/`PARENT_API_KEY`
 * unset, which `env.validation.ts` only allows together). Never throws: a
 * parent being unreachable must not crash the scheduler, the same
 * discipline `TradingPartnersService.pushOutbound()` already uses — it is
 * simply retried on the next tick, since neither cursor advances on
 * failure.
 */
@Injectable()
export class ReplicationSyncAgent {
  private readonly logger = new Logger(ReplicationSyncAgent.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly cursor: ReplicationCursorService,
    private readonly apply: ReplicationApplyService,
  ) {}

  @Interval(SYNC_INTERVAL_MS)
  async tick(): Promise<void> {
    if (this.running) return;
    if (!this.config.isChainNode || !this.config.parentUrl || !this.config.parentApiKey) return;

    this.running = true;
    try {
      await this.pushFacts();
      await this.pullPolicy();
    } finally {
      this.running = false;
    }
  }

  async pushFacts(): Promise<void> {
    const parentUrl = this.config.parentUrl!;
    const cursor = await this.cursor.get(PARENT_PEER_ID, 'UP');
    const since = cursor?.lastSequence ?? 0n;

    const rows = await this.prisma.replicationRecord.findMany({
      where: { originNodeId: this.config.nodeId, direction: 'UP', sequence: { gt: since } },
      orderBy: { sequence: 'asc' },
      take: PUSH_BATCH_SIZE,
    });
    if (rows.length === 0) return;

    try {
      const response = await fetch(`${trimTrailingSlash(parentUrl)}/api/v1/replication/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.parentApiKey}` },
        body: JSON.stringify({
          records: rows.map((row) => ({
            sequence: row.sequence.toString(),
            entity: row.entity,
            entityId: row.entityId,
            op: row.op,
            payload: row.payload,
            schemaVersion: row.schemaVersion,
            occurredAt: row.occurredAt.toISOString(),
          })),
        }),
      });
      if (!response.ok) {
        this.logger.warn(`Push to parent failed: HTTP ${response.status}`);
        return;
      }
      const maxSequence = rows[rows.length - 1].sequence;
      await this.cursor.advance(PARENT_PEER_ID, 'UP', maxSequence);
    } catch (error) {
      this.logger.warn(`Push to parent failed: ${describe(error)}`);
    }
  }

  async pullPolicy(): Promise<void> {
    const parentUrl = this.config.parentUrl!;
    const cursor = await this.cursor.get(PARENT_PEER_ID, 'DOWN');
    const since = cursor?.lastSequence ?? 0n;

    try {
      const response = await fetch(
        `${trimTrailingSlash(parentUrl)}/api/v1/replication/pull?since=${since.toString()}`,
        { headers: { Authorization: `Bearer ${this.config.parentApiKey}` } },
      );
      if (!response.ok) {
        this.logger.warn(`Pull from parent failed: HTTP ${response.status}`);
        return;
      }
      const body = (await response.json()) as PullResponse;
      if (body.records.length === 0) return;

      let maxSequence = since;
      for (const record of body.records) {
        const sequence = BigInt(record.sequence);
        await this.apply.apply({
          originNodeId: body.originNodeId,
          sequence,
          entity: record.entity,
          entityId: record.entityId,
          op: record.op,
          payload: record.payload,
          schemaVersion: record.schemaVersion,
          occurredAt: new Date(record.occurredAt),
        });
        if (sequence > maxSequence) maxSequence = sequence;
      }
      await this.cursor.advance(PARENT_PEER_ID, 'DOWN', maxSequence);
    } catch (error) {
      this.logger.warn(`Pull from parent failed: ${describe(error)}`);
    }
  }
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
