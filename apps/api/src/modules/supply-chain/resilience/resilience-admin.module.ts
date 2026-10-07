import { Module } from '@nestjs/common';
import { ResilienceAdminController } from './resilience-admin.controller';

/**
 * 38-resilience-engineering.md. The admin read/tune surface for
 * `CircuitBreakerService` (`core/resilience/`) and `SloRecorderService`
 * (`core/slo/`) — both already global, so this module only wires the
 * controller, the same `core/*` vs `modules/*` split `feature-flags`
 * already establishes.
 */
@Module({
  controllers: [ResilienceAdminController],
})
export class ResilienceAdminModule {}
