import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { hashLoginIdentifier, normalizeLoginIdentifier } from './login-identifier';
import { RateLimitAuditService } from './rate-limit-audit.service';

/**
 * The per-account sign-in bucket (WO-206.2, 206-rate-limiting-caching-compression-hardening.md
 * §1.2). Both values are doc 206's, with its reasoning:
 *
 *   capacity 5 — absorbs "forgot which of two passwords" plus typos, while
 *     keeping the guesses an attacker gets per cycle small (3 locks out a
 *     real user, 10 gives an attacker twice the guesses for nothing).
 *   refill 1 token / 300 s — once the burst is spent, one guess per 5 minutes
 *     (~12 an hour) however many source IPs the attacker controls; an idle
 *     bucket is full again after 25 minutes.
 */
export const LOGIN_ATTEMPT_BUCKET = { capacity: 5, refillIntervalMs: 300_000 } as const;

export const LOGIN_UNAVAILABLE_MESSAGE = 'Sign-in is temporarily unavailable. Please try again in a minute.';

const BUCKET_KEY_PREFIX = 'auth:login-bucket:';

/**
 * A continuous-refill token bucket, atomic in one round trip. Time is Redis's
 * own clock (`TIME`), so every API replica reads one clock however far theirs
 * drift. State is a hash {tokens, ts}; a missing key is a full bucket, and the
 * key expires the moment it would be full again, so an idle identifier costs
 * no memory. A denial spends nothing. Requires Redis >= 5 (effects
 * replication, so `TIME` may precede a write); the provisioned instance is 7.
 *
 * Returns { allowed (1|0), retryAfterMs } — retryAfterMs is exactly how long
 * until the bucket next holds one whole token.
 */
export const CONSUME_LOGIN_TOKEN_LUA = `
local capacity = tonumber(ARGV[1])
local interval = tonumber(ARGV[2])
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local state = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(state[1])
local ts = tonumber(state[2])
if tokens == nil or ts == nil then
  tokens = capacity
  ts = now
end
if now > ts then
  tokens = math.min(capacity, tokens + (now - ts) / interval)
  ts = now
end
local allowed = 0
local retry_after = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
else
  retry_after = math.ceil((1 - tokens) * interval)
end
redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'ts', tostring(ts))
redis.call('PEXPIRE', KEYS[1], math.ceil((capacity - tokens) * interval))
return { allowed, retry_after }
`;

/**
 * doc 206 §1.2's 429: `{ retryAfterSeconds, message }` and, via
 * AllExceptionsFilter, a `Retry-After` header with the same number. Nothing
 * about the account — not whether it exists, not how many tries are left.
 */
export class LoginRateLimitedException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      { retryAfterSeconds, message: `Too many attempts. Try again in ${retryAfterSeconds} seconds.` },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export interface LoginAttemptContext {
  /** Express's client address (main.ts trusts exactly one proxy hop). */
  ip?: string | null;
}

/**
 * The second, per-account layer in front of password sign-in — the per-IP
 * CREDENTIAL_THROTTLE stops one address; this stops many addresses sharing
 * one target. Called by AuthService.login() before the account is looked up
 * or any password compared, so a refused attempt costs neither a query nor a
 * bcrypt round.
 *
 * Fails closed: if Redis cannot answer, sign-in is refused with 503 — an
 * unlimited login endpoint during an incident is worse than a temporary
 * sign-in outage (doc 206 §1.2).
 */
@Injectable()
export class LoginThrottleService {
  private readonly logger = new Logger(LoginThrottleService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly rateLimitAudit: RateLimitAuditService,
  ) {}

  /** Spends one token for this identifier, or throws 429 (none left) / 503 (Redis unreachable). */
  async consume(identifier: string, context: LoginAttemptContext = {}): Promise<void> {
    const identifierHash = hashLoginIdentifier(normalizeLoginIdentifier(identifier));

    let allowed: boolean;
    let retryAfterMs: number;
    try {
      const reply = (await this.redis
        .client('rateLimit')
        .eval(
          CONSUME_LOGIN_TOKEN_LUA,
          1,
          BUCKET_KEY_PREFIX + identifierHash,
          LOGIN_ATTEMPT_BUCKET.capacity,
          LOGIN_ATTEMPT_BUCKET.refillIntervalMs,
        )) as [number, number];
      allowed = reply[0] === 1;
      retryAfterMs = reply[1];
    } catch (error) {
      this.logger.error(`login bucket unavailable, refusing sign-in: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException(LOGIN_UNAVAILABLE_MESSAGE);
    }

    if (allowed) return;

    // At least 1: a Retry-After of 0 would tell the client to retry into the
    // same refusal.
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    await this.rateLimitAudit.recordRefusal({
      layer: 'account',
      route: 'POST /auth/login',
      identifierHash,
      ip: context.ip ?? null,
      retryAfterSeconds,
      episodeKey: identifierHash,
      episodeMs: LOGIN_ATTEMPT_BUCKET.refillIntervalMs,
    });
    throw new LoginRateLimitedException(retryAfterSeconds);
  }

  /**
   * Refills the bucket to capacity — called on a successful password check
   * (doc 206 §1.2), so typos before a correct password are not carried into
   * the next session. Best-effort: the password was right, and refusing a
   * proven sign-in because a counter could not be cleared protects nothing.
   */
  async reset(identifier: string): Promise<void> {
    const identifierHash = hashLoginIdentifier(normalizeLoginIdentifier(identifier));
    try {
      await this.redis.client('rateLimit').del(BUCKET_KEY_PREFIX + identifierHash);
    } catch (error) {
      this.logger.warn(`login bucket reset failed (sign-in proceeds): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/** The Redis key a bucket lives at — exported for tests that age a bucket instead of waiting minutes. */
export function loginBucketKey(identifier: string): string {
  return BUCKET_KEY_PREFIX + hashLoginIdentifier(normalizeLoginIdentifier(identifier));
}
