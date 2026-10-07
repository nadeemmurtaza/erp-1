import { Global, Module } from '@nestjs/common';
import { CircuitBreakerService } from './circuit-breaker.service';

/**
 * 38-resilience-engineering.md (WO-38.2). Global, like `MetricsModule` and
 * `FeatureFlagsModule` — `AiService`, `PaymentsService` and the `rag`
 * module's retrieval/ingestion services all inject `CircuitBreakerService`
 * directly, with no import of this module. The admin read/tune surface
 * lives separately in `apps/api/src/modules/supply-chain/resilience/`, the same
 * `core/*` vs `modules/*` split `feature-flags` already establishes.
 */
@Global()
@Module({
  providers: [CircuitBreakerService],
  exports: [CircuitBreakerService],
})
export class ResilienceModule {}
