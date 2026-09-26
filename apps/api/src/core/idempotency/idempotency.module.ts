import { Global, Module } from '@nestjs/common';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyCron } from './idempotency.cron';

/**
 * architecture-patterns/157-client-request-idempotency-keys.md. Core
 * infrastructure, not an optional module — `IdempotencyInterceptor` is
 * bound globally in `app.module.ts` (`APP_INTERCEPTOR`); this module only
 * provides it (and the purge/reaper cron) for injection.
 */
@Global()
@Module({
  providers: [IdempotencyInterceptor, IdempotencyCron],
  exports: [IdempotencyInterceptor],
})
export class IdempotencyModule {}
