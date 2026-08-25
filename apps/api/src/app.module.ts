import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard, PermissionsGuard } from './core/auth/guards';
import { AllExceptionsFilter } from './core/common/filters/all-exceptions.filter';
import { CoreModule } from './core/core.module';
import { FeatureModulesModule } from './modules/modules.registry';

@Module({
  imports: [
    CoreModule,
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 300 }],
      // The e2e suites sign in dozens of times a minute from one address;
      // rate limiting them would only test the limiter. Never skipped
      // outside tests — production and staging both enforce it.
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    FeatureModulesModule.register(),
  ],
  providers: [
    // Order matters: authenticate, then check permissions, then rate-limit.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
