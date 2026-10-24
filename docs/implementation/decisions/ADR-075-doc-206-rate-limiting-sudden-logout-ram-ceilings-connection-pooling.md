# ADR-075 — Doc 206 (rate limiting, sudden-logout, RAM ceilings, connection pooling, API caching, lazy loading, compression): eight requests investigated against the real code first — three extend what's already built, five are genuinely new, every parameter stated with its exact value

[← Decision log](../DECISIONS.md)


### Context

The owner asked for eight separate hardening measures in one message: a
Redis-backed token-bucket rate limiter for login attempts with a 429
response; a queueing mechanism to stop sessions being suddenly logged out;
a RAM ceiling for scripts; a "TERA type central connection" system for
faster connections; API response caching; prevention of irrelevant
component loading plus lazy loading; an image compressor; and a
zstd-over-brotli-over-gzip-over-uncompressed compression stack for server
responses — plus a standing instruction, now recorded in `CLAUDE.md`
itself, to always state the exact parameters and reasoning behind any
future security or performance decision rather than a vague description.

### Options Considered

1. **Treat all eight as greenfield and design each from first principles.**
   Rejected — a fast grep found real, partially-built systems already
   covering two of the eight (login rate limiting, image compression) and
   a third partially (Prisma's own connection pool). Designing over these
   without reading them first would have duplicated a security-relevant
   primitive (`@nestjs/throttler`'s own credential throttle) and an
   already-correct image pipeline (`StorageService`'s WebP conversion at
   quality 75) — exactly the "duplicate implementation is a defect" trap
   this repo's own house rules already name.
2. **Interpret "a queue system to prevent sudden logout" literally as a
   message queue (BullMQ or similar).** Rejected on inspection — nothing
   in this codebase's actual session/logout behavior is queue-shaped; the
   real, well-documented cause of an unexpected logout in a system that
   already rotates refresh tokens on use is a race between concurrent
   refresh requests, which a message queue does nothing to address. Doc
   206 §2 reframes this as refresh-token reuse-detection with a grace
   window, the actual mechanism that solves the described symptom.
3. **Investigate what exists, extend rather than duplicate the three
   partially-built systems, and specify exact parameters for the five
   genuinely new ones, all in one consolidated document (doc 206) rather
   than a document per system.** Chosen — proportional to eight related
   but individually contained hardening measures, none of which rises to
   the scale of a new module or a new business capability.

### Decision

Doc 206, as written. In one line per system: Redis-backed shared storage
for the existing IP-keyed throttler (unchanged limits, shared counters)
plus a new 5-token/5-minute-refill per-account bucket keyed by a hashed
login identifier, both fail-closed; refresh-token reuse detection with a
10-second grace window plus a client-side single-flight refresh mutex,
replacing the literal "queue" request; `--max-old-space-size` at 75% of
each service's own container memory ceiling; PgBouncer in transaction-
pooling mode plus a shared keep-alive HTTP agent for outbound connector
calls, in place of the unrecognized "TERA"; a 5-minute cache-aside Redis
layer for non-personalized reads, explicitly never for session-scoped
data; a 50KB-gzipped dynamic-import threshold for component loading;
image compression confirmed already built, no action; and a zstd→brotli→
gzip→identity negotiated compression stack with per-context quality
levels (fast for dynamic responses, maximum for build-time static
assets), enabled by a one-line `engines.node` bump to `>=22.15.0` rather
than a new native dependency.

### Reasoning

Every number above is justified in doc 206 itself, against the actual
code (real file paths, real existing constants like `WEBP_QUALITY = 75`
and `CREDENTIAL_THROTTLE`'s `{ limit: 10, ttl: 60_000 }`), not asserted
in the abstract. The recurring pattern across all eight: fail closed
rather than silently open when a new dependency (Redis, PgBouncer) is
unreachable, because an unlimited/uncached/unpooled system during an
infrastructure incident is a worse failure mode than a temporarily
degraded one, matching this repo's own `FeatureFlagsService` precedent.

### Consequences

Two new runtime dependencies this program requires sign-off on before
work starts: a dedicated Redis instance (rate limiting §1 and caching §5,
separate logical DBs, never the mail Redis) and PgBouncer (§4) — named in
doc 206's own dependency-justification block, not silently assumed
approved. `engines.node`'s tightening to `>=22.15.0` is a one-line,
low-risk change but does narrow which Node patch versions this repo
accepts — stated so CI/deployment images are checked against it. Every
other change is additive to already-shipped behavior (the existing
throttle limits are unchanged in value) or purely new capability with no
existing behavior to preserve.

### Status
**Accepted.**

### Addendum — 2026-09-28: WO-206.1 to WO-206.4 as built

Every value decided above is implemented unchanged. Building it against the
real code settled what the ADR left open: items 1 and 2 correct it, 3 and 4
record choices so they are not re-litigated. The full record, with each
parameter's reasoning, is doc 206 §8.

**Settled while building.**
1. *Fail closed where the limit is a credential control, not everywhere.*
   The global 300/60 s throttle guards every route, so a storage that
   fails closed on all of them turns a Redis outage into a total API
   outage — contradicting doc 38 §1 (the only total outage is Postgres).
   Routes that declare their own `@Throttle` fail closed (503); the
   module-wide limit falls back to per-process counting, the
   pre-WO-206.1 behaviour. Doc 38's degradation matrix has the row.
2. *One `auth.rate_limited` row per throttling episode, not per 429.* A
   synchronous INSERT per refused request would let a login flood exhaust
   the Postgres pool; a Redis `SET NX` marker records the first refusal of
   each episode (60 s per route per IP; 300 s per identifier).
3. *Per-identifier bucket keys kept over per-account keys*, recorded so it
   is not re-litigated: a shared account bucket would reveal whether a
   phone number and an email belong to one account.
4. *The grace window stays on `POST /auth/refresh`, as §2.2 scopes it.* The
   single sign-on handoff (`POST /auth/sso/session`, doc 161) redeems a
   refresh token through the same rotation but keeps single use: a second
   redemption inside 10 s is refused, not replayed.

**Parameters added** (Parameter — exact value — why — where — degrades):

| Parameter | Value | Why | Where | Degrades |
|---|---|---|---|---|
| Redis offline queue | disabled | never park requests on a dead socket | `core/redis/redis.service.ts` | command refused at once |
| Retries / resend per command | 0 / never | a replayed EVAL double-spends a sign-in token | same | fails on first drop |
| Command timeout | 500 ms | < 1 ms RTT; one 200 ms TCP retransmit still fits | same | treated as Redis down |
| Connect timeout | 2 000 ms | ~1 ms connect plus a cold DNS lookup | same | retried with backoff |
| Reconnect backoff | 50 ms × attempt, cap 2 000 ms | recovery noticed within 2 s | same | — |
| Boot wait | 2 000 ms, then boot | Redis is never a boot dependency | same | boots degraded |
| Instance memory | 64 MB data, 128M container | ~300k keys at ~200 B, ~3× a busy minute | compose/stack `redis` | full = refused writes |
| Eviction | `noeviction` | eviction resets a limit silently | same | as full |
| Persistence | none | counters are not facts | same | counters reset on restart |
| Refresh successor | HMAC-SHA256(`JWT_REFRESH_SECRET`, token) | replays return the same pair with no plaintext stored | `AuthService.successorOf` | secret change mid-window → plain 401 |
| Grace boundary | ≤ 10 000 ms inclusive | the ADR's 10 s, made exact | `REFRESH_REUSE_GRACE_MS` | — |

**Dependencies added by this build**: `@nest-lab/throttler-storage-redis`
1.2.0 and `ioredis` 5.11.1 (the 5.x line the adapter is built against;
6.0.0 switched to RESP3 by default two months before this). Doc 206 §1.3
names these, and the new Redis instance, as needing the owner's sign-off;
this addendum records what was built, not that sign-off.
