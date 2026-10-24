import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { RedisService } from '../redis/redis.service';

export const RATE_LIMITED_AUDIT_ACTION = 'auth.rate_limited';
/** AuditLog.entity for a row keyed by a hashed sign-in identifier (login-identifier.ts) — there is no model to name. */
export const AUTH_IDENTIFIER_AUDIT_ENTITY = 'AuthIdentifier';

/** Which limit refused the request: ThrottlerGuard's per-IP counter, or LoginThrottleService's per-account bucket. */
export type RateLimitLayer = 'ip' | 'account';

export interface RateLimitRefusal {
  layer: RateLimitLayer;
  /** "POST /auth/login" — which credential route refused it. */
  route: string;
  /** Hashed, normalised identifier (login-identifier.ts); null when the body carried none. */
  identifierHash: string | null;
  ip: string | null;
  retryAfterSeconds: number;
  /**
   * What makes two refusals the same episode, and how long it lasts: the
   * throttler's own per-route-per-IP key for the block's duration, or the
   * identifier hash for one bucket refill interval.
   */
  episodeKey: string;
  episodeMs: number;
}

/**
 * Writes `auth.rate_limited` (206-rate-limiting-caching-compression-hardening.md
 * §1.2) — the hashed identifier, the source IP, and AuditLog's own createdAt.
 * Never the password and never the plaintext identifier.
 *
 * One row per throttling EPISODE, not per refused request. Once a limit trips,
 * every further request in that window is refused just as cheaply as the
 * limiter can manage — and a synchronous INSERT per refusal would hand a
 * login flood a way to turn each cheap refusal into a Postgres write, until
 * the connection pool (10 per replica) is exhausted and every route fails
 * with it. So the first refusal of an episode is recorded, and a Redis
 * `SET NX` marker for the episode's duration keeps the rest from re-recording
 * it: at most one row per route per IP per block, and one per identifier per
 * bucket refill interval — a credential-stuffing campaign against one account
 * still shows up as a steady pattern of rows, which is the point of them.
 *
 * Operational-class audit (canonical ruling 9): best-effort, never allowed to
 * turn the 429 it describes into a 500.
 */
@Injectable()
export class RateLimitAuditService {
  private readonly logger = new Logger(RateLimitAuditService.name);

  constructor(
    private readonly audit: AuditService,
    private readonly redis: RedisService,
  ) {}

  async recordRefusal(refusal: RateLimitRefusal): Promise<void> {
    if (!(await this.startsEpisode(refusal))) return;

    await this.audit.record({
      actorId: null,
      action: RATE_LIMITED_AUDIT_ACTION,
      entity: AUTH_IDENTIFIER_AUDIT_ENTITY,
      entityId: refusal.identifierHash,
      data: { layer: refusal.layer, route: refusal.route, retryAfterSeconds: refusal.retryAfterSeconds },
      ip: refusal.ip,
    });
  }

  private async startsEpisode(refusal: RateLimitRefusal): Promise<boolean> {
    try {
      const marked = await this.redis
        .client('rateLimit')
        .set(`auth:rate-limited-audit:${refusal.layer}:${refusal.episodeKey}`, '1', 'PX', Math.max(1_000, refusal.episodeMs), 'NX');
      return marked === 'OK';
    } catch (error) {
      // Cannot tell whether this episode was already recorded: record it
      // again rather than lose the signal. Only reachable in the instant
      // Redis fails between the refusal and this call — a refusal needs Redis.
      this.logger.warn(`rate-limit audit dedupe unavailable, recording anyway: ${error instanceof Error ? error.message : String(error)}`);
      return true;
    }
  }
}
