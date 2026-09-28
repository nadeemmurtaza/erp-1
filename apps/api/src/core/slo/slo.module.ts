import { Global, Module } from '@nestjs/common';
import { RequestOutcomePruneCron } from './request-outcome-prune.cron';
import { SloRecorderService } from './slo-recorder.service';

/**
 * 38-resilience-engineering.md §3, WO-38.3. Global, like `ResilienceModule` —
 * `OrdersService`, `PosSalesService` and `ReplicationSyncAgent` inject
 * `SloRecorderService` directly. The admin read surface lives separately in
 * `apps/api/src/modules/resilience/`.
 */
@Global()
@Module({
  providers: [SloRecorderService, RequestOutcomePruneCron],
  exports: [SloRecorderService],
})
export class SloModule {}
