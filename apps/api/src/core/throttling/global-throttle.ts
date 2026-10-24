/**
 * The module-wide rate limit every route gets unless it declares its own
 * `@Throttle`: 300 requests per 60 s per client IP — a coarse abuse ceiling,
 * not a credential control (credential routes declare their own, far tighter
 * `CREDENTIAL_THROTTLE` in auth.controller.ts).
 *
 * Unchanged in value by WO-206.1 (206-rate-limiting-caching-compression-hardening.md
 * §1.2 — only where its counters live moved, from process memory to Redis).
 * Named here because two readers must agree on it: ThrottlerModule's options
 * in app.module.ts, and SharedThrottlerStorage, which treats any request whose
 * limit differs from this as a route that declared its own.
 */
export const GLOBAL_THROTTLE = { name: 'default', ttl: 60_000, limit: 300 } as const;
