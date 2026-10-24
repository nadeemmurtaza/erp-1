import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import type { ReplicationOp } from '../prisma/client';
import { SloRecorderService } from '../slo/slo-recorder.service';
import { ReplicationCursorService } from './replication-cursor.service';
import { ReplicationApplyService } from './replication-apply.service';
import { PARENT_PEER_ID } from './replication.types';

const SYNC_INTERVAL_MS = 10_000;
const PUSH_BATCH_SIZE = 100;
/** Pages fetched per tick before yielding — a generous cap (the pull
 * endpoint's own page size is 100), not a real limit: it exists so a bug
 * that always reports `hasMore: true` degrades to "slow" on the next tick
 * instead of a tick that never returns. */
const MAX_PULL_PAGES_PER_TICK = 1000;

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
    private readonly slo: SloRecorderService,
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

    // 38-resilience-engineering.md §3, WO-38.3 — the till-parent sync SLO:
    // the age of the OLDEST still-unpushed fact right now, regardless of
    // whether this tick's own push attempt below succeeds. `rows[0]` is the
    // oldest pending record (the query orders by sequence ascending); no
    // pending rows means the branch is fully caught up (age 0).
    this.slo.recordReplicationTick(rows.length > 0 ? Date.now() - rows[0].occurredAt.getTime() : 0);

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

  /**
   * Drains every page the parent reports as `hasMore`, not just one — this
   * is what makes a fresh branch box's first tick a full bootstrap-from-
   * cloud (WO-20.5) rather than a trickle: a box starting at cursor 0
   * catches up to the parent's entire POLICY log before this method
   * returns, the same loop a resync (deleting the local cursor) replays.
   */
  async pullPolicy(): Promise<void> {
    for (let page = 0; page < MAX_PULL_PAGES_PER_TICK; page++) {
      const hasMore = await this.pullOnePage();
      if (!hasMore) return;
    }
    this.logger.warn(`Pull from parent stopped after ${MAX_PULL_PAGES_PER_TICK} pages in one tick — resuming next tick.`);
  }

  /** Fetches and applies one page. Returns whether the parent reports more waiting — false on any failure, so a broken parent cannot spin this in a tight loop. */
  private async pullOnePage(): Promise<boolean> {
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
        return false;
      }
      const body = (await response.json()) as PullResponse;
      if (body.records.length === 0) return false;

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
      return body.hasMore;
    } catch (error) {
      this.logger.warn(`Pull from parent failed: ${describe(error)}`);
      return false;
    }
  }
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
