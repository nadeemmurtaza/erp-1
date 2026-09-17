import { Injectable, Logger } from '@nestjs/common';
import { ReplicationRegistry } from './replication.registry';
import { ReplicationQuarantineService } from './replication-quarantine.service';
import type { ReplicationRecordLike } from './replication.types';

/**
 * Applies one incoming record — WO-20.2's HTTP receiving side is the only
 * intended caller once it exists; nothing calls this yet under
 * `STANDALONE`, which has no peers to receive from. Never throws: an
 * entity nobody registered, or a registered `apply()` that throws, both
 * quarantine the record rather than failing whatever pulled the batch —
 * the same "a partner being unreachable must not fail the caller"
 * discipline `TradingPartnersService.pushOutbound()` already uses.
 */
@Injectable()
export class ReplicationApplyService {
  private readonly logger = new Logger(ReplicationApplyService.name);

  constructor(
    private readonly registry: ReplicationRegistry,
    private readonly quarantine: ReplicationQuarantineService,
  ) {}

  async apply(record: ReplicationRecordLike & { occurredAt: Date }): Promise<void> {
    const descriptor = this.registry.describe(record.entity);
    if (!descriptor) {
      await this.quarantine.quarantine(record, `No applier registered for "${record.entity}".`);
      this.logger.warn(`Quarantined ${record.entity}#${record.entityId} — no applier registered.`);
      return;
    }

    try {
      await descriptor.apply({
        entityId: record.entityId,
        op: record.op,
        payload: record.payload,
        schemaVersion: record.schemaVersion,
        originNodeId: record.originNodeId,
        occurredAt: record.occurredAt,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.quarantine.quarantine(record, reason);
      this.logger.warn(`Quarantined ${record.entity}#${record.entityId} (seq ${record.sequence}): ${reason}`);
    }
  }
}
