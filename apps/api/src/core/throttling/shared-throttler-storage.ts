import { Logger, ServiceUnavailableException, type OnApplicationShutdown } from '@nestjs/common';
import { ThrottlerStorageService, type ThrottlerStorage } from '@nestjs/throttler';

/** What ThrottlerStorage.increment() resolves to — derived rather than deep-imported from the package's dist. */
type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

/** One module-level throttler's own limit, as ThrottlerModule was configured with it. */
export interface ModuleThrottle {
  readonly name: string;
  readonly ttl: number;
  readonly limit: number;
}

export const RATE_LIMIT_STORE_UNAVAILABLE_MESSAGE =
  'This action is temporarily unavailable. Please try again in a minute.';

/**
 * ThrottlerModule's storage (WO-206.1, 206-rate-limiting-caching-compression-hardening.md
 * §1.2): counters live in the dedicated Redis, so every API replica enforces
 * one shared limit instead of `limit × replicas`.
 *
 * `shared` is `@nest-lab/throttler-storage-redis`'s ThrottlerStorageRedisService
 * in production — the maintained adapter doc 206 §1.3 names, used unmodified.
 * This class adds only what the adapter leaves to its caller: what a request
 * gets when Redis cannot answer.
 *
 *   - A route that declares its own `@Throttle` (every one in this codebase
 *     guards a secret or a code someone could guess — CREDENTIAL_THROTTLE's
 *     sign-in and password routes, gift-card and promo codes, API-key issue,
 *     an unauthenticated webhook) fails CLOSED: 503, never an unlimited guess.
 *   - A route on the module-wide ceiling alone (GLOBAL_THROTTLE) keeps
 *     counting in this process — the pre-WO-206.1 behaviour, weaker by the
 *     replica count but never unlimited — rather than turning a Redis outage
 *     into an outage of every route, POS sale sync and payment webhooks
 *     included. 38-resilience-engineering.md §1 is the rule this keeps: a
 *     dependency being down removes one capability; every *total* outage in
 *     the degradation matrix is Postgres itself.
 *
 * "Declares its own" is read from the limit the guard resolved: ThrottlerGuard
 * passes a route's `@Throttle` override in place of the module value, so a
 * limit or ttl that differs from the module's own for that throttler name is
 * one a route declared. A throttler name this class was not told about is
 * treated as declared — the safe side.
 *
 * Either way the outage is logged once when it starts and once when it ends.
 */
export class SharedThrottlerStorage implements ThrottlerStorage, OnApplicationShutdown {
  private readonly logger = new Logger('RateLimit');
  private readonly local = new ThrottlerStorageService();
  private readonly moduleThrottles: ReadonlyMap<string, ModuleThrottle>;
  private degradedSince: number | null = null;

  constructor(
    private readonly shared: ThrottlerStorage,
    moduleThrottles: readonly ModuleThrottle[],
  ) {
    this.moduleThrottles = new Map(moduleThrottles.map((throttle) => [throttle.name, throttle]));
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    let record: ThrottlerStorageRecord;
    try {
      record = await this.shared.increment(key, ttl, limit, blockDuration, throttlerName);
    } catch (error) {
      this.noteOutage(error);
      if (this.declaredByRoute(throttlerName, ttl, limit)) {
        throw new ServiceUnavailableException(RATE_LIMIT_STORE_UNAVAILABLE_MESSAGE);
      }
      return this.local.increment(key, ttl, limit, blockDuration, throttlerName);
    }
    this.noteRecovery();
    return record;
  }

  /** Clears the in-process fallback's timers, so a shutdown is never held open by them. */
  onApplicationShutdown(): void {
    this.local.onApplicationShutdown();
  }

  private declaredByRoute(throttlerName: string, ttl: number, limit: number): boolean {
    const moduleThrottle = this.moduleThrottles.get(throttlerName);
    return !moduleThrottle || moduleThrottle.ttl !== ttl || moduleThrottle.limit !== limit;
  }

  private noteOutage(error: unknown): void {
    if (this.degradedSince !== null) return;
    this.degradedSince = Date.now();
    this.logger.error(
      `Shared rate-limit store unavailable (${error instanceof Error ? error.message : String(error)}): ` +
        'routes with their own rate limit answer 503; the module-wide limit counts per process until it recovers.',
    );
  }

  private noteRecovery(): void {
    if (this.degradedSince === null) return;
    const seconds = Math.round((Date.now() - this.degradedSince) / 1000);
    this.degradedSince = null;
    this.logger.log(`Shared rate-limit store recovered after ${seconds} s; every limit is shared across replicas again.`);
  }
}
