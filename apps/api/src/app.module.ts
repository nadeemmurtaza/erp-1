import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard, PermissionsGuard } from './core/auth/guards';
import { AllExceptionsFilter } from './core/common/filters/all-exceptions.filter';
import { CoreModule } from './core/core.module';
import { IdempotencyInterceptor } from './core/idempotency/idempotency.interceptor';
import { RedisModule } from './core/redis/redis.module';
import { RedisService } from './core/redis/redis.service';
import { AppThrottlerGuard } from './core/throttling/app-throttler.guard';
import { GLOBAL_THROTTLE } from './core/throttling/global-throttle';
import { SharedThrottlerStorage } from './core/throttling/shared-throttler-storage';
import { DeprecationHeaderInterceptor } from './core/versioning/deprecation-header.interceptor';
import { FeatureModulesModule } from './modules/modules.registry';

@Module({
  imports: [
    CoreModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisService],
      // WO-206.1 (206-rate-limiting-caching-compression-hardening.md §1.2):
      // counters live in the dedicated Redis so every replica enforces one
      // shared limit — the limits themselves are unchanged. What an
      // unreachable Redis means per route is SharedThrottlerStorage's call.
      useFactory: (redis: RedisService) => ({
        throttlers: [GLOBAL_THROTTLE],
        storage: new SharedThrottlerStorage(new ThrottlerStorageRedisService(redis.client('rateLimit')), [GLOBAL_THROTTLE]),
        // The e2e suites sign in dozens of times a minute from one address;
        // rate limiting them would only test the limiter. Never skipped
        // outside tests — production and staging both enforce it.
        skipIf: () => process.env.NODE_ENV === 'test',
      }),
    }),
    FeatureModulesModule.register(),
  ],
  providers: [
    // Order matters: authenticate, then check permissions, then rate-limit.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // 157-client-request-idempotency-keys.md — a no-op on any route without
    // @IdempotentWrite(scope); runs after every APP_GUARD above (Nest's own
    // guards-before-interceptors order), never in place of authorization.
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    // 37-scalability-future-upgrades.md (WO-37.1) — a no-op on any request
    // whose URI version carries no registered deprecation, which is every
    // request today (nothing has ever been deprecated).
    { provide: APP_INTERCEPTOR, useClass: DeprecationHeaderInterceptor },
  ],
})
export class AppModule {}
