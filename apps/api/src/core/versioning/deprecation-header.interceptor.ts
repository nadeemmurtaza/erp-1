import { Injectable, NotFoundException, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { AppConfigService } from '../config/app-config.service';
import { ApiVersionPolicyService } from './api-version-policy.service';

/**
 * resilience-scalability/37-scalability-future-upgrades.md (WO-37.1).
 * Registered globally (`APP_INTERCEPTOR`, `app.module.ts`) but a no-op on
 * any request whose URI version carries no registered deprecation — exactly
 * every request today, since nothing has ever been deprecated. The day a
 * version IS deprecated (`ApiVersionPolicyService.registerDeprecation()`),
 * this starts setting `Deprecation`/`Sunset` (RFC 8594) on every response
 * under that version, and refuses (404) any request made after its
 * `sunsetAt` — the one REQUEST-shaped refusal doc 37 introduces, always
 * announced in advance via the header, never a surprise.
 *
 * Runs after `JwtAuthGuard`/`PermissionsGuard` (guards execute before
 * interceptors), same as `IdempotencyInterceptor` — a version-lifecycle
 * mechanism, never a substitute for authorization.
 */
@Injectable()
export class DeprecationHeaderInterceptor implements NestInterceptor {
  constructor(
    private readonly policy: ApiVersionPolicyService,
    private readonly config: AppConfigService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = ctx.switchToHttp().getRequest<Request>();
    const version = this.extractVersion(request.path);

    if (!version) return next.handle();

    const deprecation = this.policy.getDeprecation(version);
    if (!deprecation) return next.handle();

    if (this.policy.isSunset(version)) {
      throw new NotFoundException(
        `API version ${version} was sunset on ${deprecation.sunsetAt.toISOString()}. See the Deprecation/Sunset headers this route served before that date.`,
      );
    }

    const response = ctx.switchToHttp().getResponse<Response>();
    response.setHeader('Deprecation', deprecation.since.toUTCString());
    response.setHeader('Sunset', deprecation.sunsetAt.toUTCString());

    return next.handle();
  }

  /** `/api/v1/orders` -> `'1'`, given API_PREFIX = 'api'. Undefined for any path with no version segment. */
  private extractVersion(path: string): string | undefined {
    const prefix = this.config.get('API_PREFIX');
    const match = path.match(new RegExp(`^/${escapeRegExp(prefix)}/v([^/]+)(?:/|$)`));
    return match?.[1];
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
