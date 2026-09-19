import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ReplicationQuarantine } from '../prisma/client';
import type { ReplicationRecordLike } from './replication.types';

/**
 * Where a record that failed to apply lands — never dropped, never
 * retried forever (WO-20.1's own scope, see replication.prisma's header).
 * `resolve()` is a manual, audited step: nothing here auto-retries into a
 * database that may already have moved on past the record's own sequence.
 */
@Injectable()
export class ReplicationQuarantineService {
  constructor(private readonly prisma: PrismaService) {}

  async quarantine(record: ReplicationRecordLike, reason: string): Promise<ReplicationQuarantine> {
    return this.prisma.replicationQuarantine.create({
      data: {
        originNodeId: record.originNodeId,
        sequence: record.sequence,
        entity: record.entity,
        entityId: record.entityId,
        op: record.op,
        payload: record.payload as object,
        schemaVersion: record.schemaVersion,
        reason,
      },
    });
  }

  async listOpen(): Promise<ReplicationQuarantine[]> {
    return this.prisma.replicationQuarantine.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
    });
  }

  async resolve(id: string): Promise<ReplicationQuarantine> {
    const existing = await this.prisma.replicationQuarantine.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Quarantined record not found.');

    return this.prisma.replicationQuarantine.update({
      where: { id },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
  }
}
