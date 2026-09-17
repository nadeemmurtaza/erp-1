import { Global, Module } from '@nestjs/common';
import { ReplicationRegistry } from './replication.registry';
import { ReplicationLogService } from './replication-log.service';
import { ReplicationCursorService } from './replication-cursor.service';
import { ReplicationQuarantineService } from './replication-quarantine.service';
import { ReplicationApplyService } from './replication-apply.service';

/**
 * The replication engine (RETAIL-ERP.md Part 6, WO-20.1) — core platform,
 * not a feature module, the same standing as `EventsModule`. Every module
 * that replicates an entity injects `ReplicationRegistry`/
 * `ReplicationLogService` directly, with no import of this module needed
 * (it is `@Global()`), the same way `EventBusService` already works.
 */
@Global()
@Module({
  providers: [
    ReplicationRegistry,
    ReplicationLogService,
    ReplicationCursorService,
    ReplicationQuarantineService,
    ReplicationApplyService,
  ],
  exports: [
    ReplicationRegistry,
    ReplicationLogService,
    ReplicationCursorService,
    ReplicationQuarantineService,
    ReplicationApplyService,
  ],
})
export class ReplicationModule {}
