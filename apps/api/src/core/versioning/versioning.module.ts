import { Global, Module } from '@nestjs/common';
import { ApiVersionPolicyService } from './api-version-policy.service';
import { DeprecationHeaderInterceptor } from './deprecation-header.interceptor';

/**
 * resilience-scalability/37-scalability-future-upgrades.md (WO-37.1). Core
 * infrastructure — `DeprecationHeaderInterceptor` is bound globally in
 * `app.module.ts` (`APP_INTERCEPTOR`); this module only provides it (and
 * `ApiVersionPolicyService`, injectable anywhere a version is ever
 * deprecated) for injection — the same shape `IdempotencyModule` already
 * establishes for its own globally-bound interceptor.
 */
@Global()
@Module({
  providers: [ApiVersionPolicyService, DeprecationHeaderInterceptor],
  exports: [ApiVersionPolicyService, DeprecationHeaderInterceptor],
})
export class VersioningModule {}
