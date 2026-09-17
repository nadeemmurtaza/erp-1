import { Global, Module } from '@nestjs/common';
import { NodesService } from './nodes.service';

/**
 * The registry of this deployment's child nodes — see NodesService. Global,
 * like every other core module, so WO-18.5's drill-down dashboard injects it
 * directly without importing this module.
 */
@Global()
@Module({
  providers: [NodesService],
  exports: [NodesService],
})
export class TopologyModule {}
