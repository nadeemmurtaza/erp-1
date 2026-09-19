import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import type { PrismaLike } from '../events/event-bus.service';
import type { ReplicationOp } from '../prisma/client';
import { ReplicationRegistry } from './replication.registry';

/**
 * The log's write side (WO-20.1). Appends one row per fact/policy change
 * this node originated, classified by whatever `ReplicationRegistry` says
 * about `entity` — never by the caller, so two call sites can never
 * disagree about whether "Order" is a FACT.
 *
 * A deliberate no-op under `NODE_ROLE=STANDALONE` (`AppConfigService
 * .isChainNode`) — R14's "every tier concept must be invisible in Solo".
 * Every deployment today is STANDALONE, so this never writes a row yet;
 * the point of building it now is that a caller wired up later (WO-20.4)
 * needs no changes when a deployment actually joins a chain.
 */
@Injectable()
export class ReplicationLogService {
  private readonly logger = new Logger(ReplicationLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly registry: ReplicationRegistry,
  ) {}

  async append(
    entity: string,
    entityId: string,
    op: ReplicationOp,
    payload: unknown,
    schemaVersion: number,
    occurredAt: Date,
    tx: PrismaLike = this.prisma,
  ): Promise<void> {
    if (!this.config.isChainNode) return;

    const descriptor = this.registry.describe(entity);
    if (!descriptor) {
      throw new Error(`"${entity}" is not registered with ReplicationRegistry — cannot log it for replication.`);
    }

    const originNodeId = this.config.nodeId;
    const sequence = await this.nextSequence(tx, originNodeId);

    await tx.replicationRecord.create({
      data: {
        originNodeId,
        sequence,
        entity,
        entityId,
        dataClass: descriptor.dataClass,
        direction: descriptor.direction,
        op,
        payload: payload as object,
        schemaVersion,
        occurredAt,
      },
    });
    this.logger.debug(`logged ${descriptor.dataClass} ${entity}#${entityId} (seq ${sequence})`);
  }

  /**
   * `INSERT … ON CONFLICT … DO UPDATE … RETURNING`, the same shape
   * `nextJournalNumber` (accounting.service.ts) uses for a gapless-within-
   * one-transaction counter — cheaper than a MAX-scan over a log table that
   * only grows across a chain's whole lifetime.
   */
  private async nextSequence(tx: PrismaLike, nodeId: string): Promise<bigint> {
    const [{ value }] = await tx.$queryRaw<Array<{ value: bigint }>>`
      INSERT INTO "ReplicationSequenceCounter" ("nodeId", "value") VALUES (${nodeId}, 1)
      ON CONFLICT ("nodeId") DO UPDATE SET "value" = "ReplicationSequenceCounter"."value" + 1
      RETURNING "value"
    `;
    return value;
  }
}
