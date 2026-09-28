import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ApiKeyAuthService } from './api-keys/api-key-auth.service';
import { ApiKeysAdminController } from './api-keys/api-keys-admin.controller';
import { ApiKeysController } from './api-keys/api-keys.controller';
import { ApiKeysService } from './api-keys/api-keys.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { LoginThrottleService } from './login-throttle.service';
import { PermissionsResolverService } from './permissions.service';
import { OidcProvider } from './providers/oidc.provider';
import { RateLimitAuditService } from './rate-limit-audit.service';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { SsoAdminController } from './sso-admin.controller';
import { SsoController } from './sso.controller';
import { SsoService } from './sso.service';

/**
 * Global, so JwtAuthGuard (registered as an APP_GUARD) can inject
 * ApiKeyAuthService, and UsersAdminService can revoke a deactivated owner's
 * keys inside its own transaction through ApiKeysService.
 *
 * Single sign-on (161-sso-identity-federation.md) lives here too: it is a
 * way to authenticate, and only AuthService mints a session. With no
 * SsoConnection registered it adds nothing to the sign-in screen.
 *
 * RateLimitAuditService is exported for AppThrottlerGuard (app.module.ts),
 * which records the per-IP half of `auth.rate_limited`; LoginThrottleService
 * records the per-account half itself (206-rate-limiting-caching-compression-hardening.md).
 */
@Global()
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({})],
  controllers: [
    AuthController,
    RolesController,
    ApiKeysController,
    ApiKeysAdminController,
    SsoController,
    SsoAdminController,
  ],
  providers: [
    AuthService,
    JwtStrategy,
    PermissionsResolverService,
    RolesService,
    ApiKeyAuthService,
    ApiKeysService,
    SsoService,
    OidcProvider,
    LoginThrottleService,
    RateLimitAuditService,
  ],
  exports: [
    AuthService,
    PermissionsResolverService,
    RolesService,
    ApiKeyAuthService,
    ApiKeysService,
    RateLimitAuditService,
  ],
})
export class AuthModule {}
