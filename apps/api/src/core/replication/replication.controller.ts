import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators';
import { bearerToken } from '../auth/bearer-token';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { NodeCredentialService } from './node-credential.service';
import { ReplicationCursorService } from './replication-cursor.service';
import { ReplicationApplyService } from './replication-apply.service';
import { PushReplicationDto } from './dto/push-replication.dto';

const MAX_PULL_BATCH = 100;

/**
 * What a child node's own sync agent calls (WO-20.2) — authenticated by a
 * node credential (`NodeCredentialService`), never a user session, so both
 * routes are `@Public()` and verify the key themselves. Mirrors
 * `TradingPartnerPortalController`'s shape exactly, one tier up.
 */
@ApiTags('Replication')
@Controller('replication')
export class ReplicationController {
  constructor(
    private readonly nodeCredential: NodeCredentialService,
    private readonly cursor: ReplicationCursorService,
    private readonly apply: ReplicationApplyService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * A child pushes its own FACT log up. Never trusts the payload's own
   * `entity` classification — `ReplicationApplyService` re-derives it from
   * this node's own `ReplicationRegistry`, so a stale or malicious child
   * cannot claim a POLICY is a FACT to smuggle it past R2's direction rule.
   * `originNodeId` is always the authenticated caller's own `nodeId`, never
   * anything the payload names.
   */
  @Post('push')
  @Public()
  @ApiOperation({ summary: "A child's own FACT records, pushed up" })
  async push(@Headers('authorization') authorization: string | undefined, @Body() dto: PushReplicationDto) {
    const node = await this.nodeCredential.verify(bearerToken(authorization));

    let maxSequence = 0n;
    for (const record of dto.records) {
      const sequence = BigInt(record.sequence);
      await this.apply.apply({
        originNodeId: node.nodeId,
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

    if (maxSequence > 0n) {
      await this.cursor.advance(node.nodeId, 'UP', maxSequence);
    }
    return { applied: dto.records.length };
  }

  /**
   * A child pulls this node's own POLICY log down — every child sees the
   * same page, since policy is broadcast identically (R2), never scoped
   * per caller. `dataClass`/`direction` are read straight off the stored
   * row (this node's own log already carries the correct classification
   * from `ReplicationLogService.append()`), not re-derived.
   */
  @Get('pull')
  @Public()
  @ApiOperation({ summary: "This node's own POLICY records since a cursor, pulled down" })
  async pull(
    @Headers('authorization') authorization: string | undefined,
    @Query('since') since: string | undefined,
  ) {
    await this.nodeCredential.verify(bearerToken(authorization));
    const sinceSequence = since ? BigInt(since) : 0n;

    const rows = await this.prisma.replicationRecord.findMany({
      where: { direction: 'DOWN', dataClass: 'POLICY', sequence: { gt: sinceSequence } },
      orderBy: { sequence: 'asc' },
      take: MAX_PULL_BATCH + 1,
    });
    const hasMore = rows.length > MAX_PULL_BATCH;
    const page = hasMore ? rows.slice(0, MAX_PULL_BATCH) : rows;

    return {
      // This node's own nodeId — the puller has no other way to learn who
      // it just pulled from, and needs it to apply each record correctly.
      originNodeId: this.config.nodeId,
      records: page.map((row) => ({
        sequence: row.sequence.toString(),
        entity: row.entity,
        entityId: row.entityId,
        op: row.op,
        payload: row.payload,
        schemaVersion: row.schemaVersion,
        occurredAt: row.occurredAt.toISOString(),
      })),
      hasMore,
    };
  }
}
