import { Injectable, type ExecutionContext } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { Request } from 'express';
import { RATE_LIMIT_AUDIT_KEY } from '../auth/auth.constants';
import { loginIdentifierHash } from '../auth/login-identifier';
import { RateLimitAuditService } from '../auth/rate-limit-audit.service';

/**
 * The app-wide ThrottlerGuard (registered as APP_GUARD in app.module.ts),
 * unchanged in what it limits. One addition: on a route marked
 * `@AuditRateLimit(field)` — /auth/login and /auth/register — a per-IP 429 is
 * recorded as `auth.rate_limited` with the hashed identifier from that body
 * field and the source IP (206-rate-limiting-caching-compression-hardening.md
 * §1.2), once per throttling episode (see RateLimitAuditService).
 *
 * Guards run before the ValidationPipe, so the body here is unvalidated: the
 * field is used only when it is a non-empty string, and only ever hashed.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly rateLimitAudit: RateLimitAuditService,
  ) {
    super(options, storageService, reflector);
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const identifierField = this.reflector.getAllAndOverride<string | undefined>(RATE_LIMIT_AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (identifierField) {
      const request = context.switchToHttp().getRequest<Request>();
      const body: unknown = request.body;
      const identifier = body && typeof body === 'object' ? (body as Record<string, unknown>)[identifierField] : undefined;

      await this.rateLimitAudit.recordRefusal({
        layer: 'ip',
        route: `${request.method} ${this.routePath(context)}`,
        identifierHash: loginIdentifierHash(identifier),
        ip: request.ip ?? null,
        retryAfterSeconds: throttlerLimitDetail.timeToBlockExpire,
        // ThrottlerGuard's own key: one per route, per throttler, per IP.
        episodeKey: throttlerLimitDetail.key,
        episodeMs: throttlerLimitDetail.timeToBlockExpire * 1_000,
      });
    }

    return super.throwThrottlingException(context, throttlerLimitDetail);
  }

  /** "/auth/login" — the route as declared, without the global prefix or version, so both limit layers name it the same way. */
  private routePath(context: ExecutionContext): string {
    const segments = [context.getClass(), context.getHandler()]
      .map((target) => this.reflector.get<string | string[] | undefined>(PATH_METADATA, target))
      .map((path) => (Array.isArray(path) ? path[0] : path) ?? '')
      .map((path) => path.replace(/^\/+|\/+$/g, ''))
      .filter((path) => path.length > 0);
    return `/${segments.join('/')}`;
  }
}
