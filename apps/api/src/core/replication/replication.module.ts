import { Global, Module } from '@nestjs/common';
import { ReplicationRegistry } from './replication.registry';
import { ReplicationLogService } from './replication-log.service';
import { ReplicationCursorService } from './replication-cursor.service';
import { ReplicationQuarantineService } from './replication-quarantine.service';
import { ReplicationApplyService } from './replication-apply.service';
import { NodeCredentialService } from './node-credential.service';
import { ReplicationController } from './replication.controller';
import { ReplicationSyncAgent } from './replication-sync.agent';

/**
 * The replication engine (RETAIL-ERP.md Part 6, WO-20.1/20.2) — core
 * platform, not a feature module, the same standing as `EventsModule`.
 * Every module that replicates an entity injects `ReplicationRegistry`/
 * `ReplicationLogService` directly, with no import of this module needed
 * (it is `@Global()`), the same way `EventBusService` already works.
 *
 * `ReplicationController` (WO-20.2) is this node's parent-side receiving
 * endpoint — what a child's own `ReplicationSyncAgent` calls. Both are
 * always registered; both are dormant no-ops under `STANDALONE`/`ORG` (no
 * parent to sync with) or for a node with no children calling in yet — see
 * `ReplicationSyncAgent`'s and `NodeCredentialService`'s own comments.
 */
@Global()
@Module({
  controllers: [ReplicationController],
  providers: [
    ReplicationRegistry,
    ReplicationLogService,
    ReplicationCursorService,
    ReplicationQuarantineService,
    ReplicationApplyService,
    NodeCredentialService,
    ReplicationSyncAgent,
  ],
  exports: [
    ReplicationRegistry,
    ReplicationLogService,
    ReplicationCursorService,
    ReplicationQuarantineService,
    ReplicationApplyService,
    NodeCredentialService,
  ],
})
export class ReplicationModule {}
