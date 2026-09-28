# 206 — Rate limiting, caching, compression and resource-limit hardening

> **Status: proposed (2026-09-28), not yet built**, except where a section
> says otherwise. This document exists because `CLAUDE.md`'s own "Exact
> parameters, every time" rule (added the same day, at the owner's direct
> instruction) requires every security/performance parameter to carry its
> exact value and reasoning, recorded here rather than left in a chat
> reply. Eight requests, each investigated against the real code before any
> number was chosen — three are partially built already and are extended,
> not duplicated; five are genuinely new.

## 0. What's already real — checked before proposing anything new

| Request | Found | Verdict |
|---|---|---|
| Rate limiter for login | `@nestjs/throttler` 6.5.0, IP-keyed, **in-memory** storage. Global `{ ttl: 60_000, limit: 300 }` (`apps/api/src/app.module.ts:15`); credential routes `CREDENTIAL_THROTTLE = { default: { limit: 10, ttl: 60_000 } }` (`auth.controller.ts:43`), applied to `/auth/register`, `/auth/login`, and `sso.controller.ts`'s sign-in routes. | Real, but two gaps: in-memory storage doesn't share counters across horizontally-scaled API replicas (§1.1), and there is no per-account layer — only per-IP, which a distributed credential-stuffing attack (many IPs, each under the per-IP limit, all guessing one account) walks straight past. §1 adds the missing layer; it does not replace what's here. |
| Image compressor | `StorageService.upload()` (`apps/api/src/core/storage/storage.service.ts:88`) already converts every image upload to WebP at `WEBP_QUALITY = 75` via `sharp`, chosen to match Next.js's own default quality/size balance. | **Already built. No action.** |
| Connection pooling | Prisma's own pool via `DATABASE_URL`'s `connection_limit=10&pool_timeout=20&connect_timeout=10` (`.env.example:14`), sized for this repo's own e2e concurrency needs per its own comment. | Real, but per-process — every API replica opens its own 10-connection pool against Postgres directly, no shared pooling tier. §4 adds one. |
| Everything else (account lockout, queueing for token refresh, RAM ceilings on scripts, API response caching, component lazy-loading, response compression) | Nothing found — greenfield. | New, specified below. |

## 1. Login-attempt rate limiting — the missing account-level layer, and why it's a second layer, not a replacement

### 1.1 The gap in what exists, precisely

`ThrottlerModule.forRoot()`'s default storage is `ThrottlerStorageService`, an in-process `Map`. Run two API replicas behind a load balancer and each has its own independent counter — the *effective* limit an attacker faces is `10 × replica_count` per 60 seconds, not 10, because roughly half their requests land on the replica that hasn't seen them yet. This is silent: nothing errors, nothing logs a discrepancy, the limit simply weakens as the deployment scales — exactly the kind of thing that "0 lint warnings" never catches.

Separately: the existing throttle is keyed by IP (`ThrottlerGuard`'s default `getTracker()`). It correctly stops one address hammering the login form. It does nothing against an attacker who controls many addresses (a botnet, a residential-proxy pool) each making 9 attempts against the *same account* — 9 is under the per-IP limit at every single address, and the account absorbs an unbounded number of guesses in total.

### 1.2 What's added — exact parameters

**Parameter: Throttler storage backend.**
**Exact value:** `@nest-lab/throttler-storage-redis` (maintained adapter implementing `@nestjs/throttler`'s `ThrottlerStorage` interface), pointed at a **new, dedicated Redis logical database** — not the existing mail Redis (`docker-compose.mail.yml`). **Why this number/choice:** sharing Redis with mail means a mail-queue incident (a slow consumer, a burst of bounces) and a rate-limiting incident now have the same blast radius; splitting them costs one more `REDIS_URL` env var and buys real isolation. **Where enforced:** `ThrottlerModule.forRootAsync()` in `app.module.ts`, replacing the default in-memory storage — the existing `{ ttl: 60_000, limit: 300 }` global and `CREDENTIAL_THROTTLE`'s `{ limit: 10, ttl: 60_000 }` are unchanged in value, only in where their counters live. **How it degrades:** if Redis is unreachable, `@nest-lab/throttler-storage-redis` rejects the request path rather than silently falling back to no limiting — a fail-closed choice, matching this repo's own `FeatureFlagsService` precedent (a flag lookup failure resolves to `false`, never to "unrestricted").

**Parameter: Per-account attempt bucket capacity.**
**Exact value:** **5 tokens.**
**Applies to:** `/auth/login`, keyed by `sha256(normalizeIdentifier(dto.identifier))` — the login identifier (email or phone) is hashed before it ever becomes a Redis key, never stored in plaintext in a key or a log line, per this repo's own "never log unnecessary personal data" rule.
**Why 5, not 3 or 10:** 3 is tight enough to lock out a real user who mistypes a password twice in a row plus a genuine third attempt; 10 gives an attacker meaningfully more total guesses per refill cycle for no real benefit to a legitimate user, who essentially never needs more than 2–3 tries. 5 absorbs a realistic "forgot which of two passwords" scenario while keeping total guesses-per-window small.
**Where enforced:** a new `AccountLoginThrottleGuard` (or a check inside `AuthService.login()` itself before password comparison — implementer's call, stated as an open point in §1.4) reading/writing the Redis bucket.
**How it degrades:** same fail-closed posture as above — Redis down means login is refused with 503, not silently unlimited, since an unlimited login endpoint during an incident is a worse outcome than a temporary login outage.

**Parameter: Per-account refill rate.**
**Exact value:** **1 token per 300 seconds (5 minutes).**
**Why this number:** after the 5-token burst is spent, the account is throttled to one guess per 5 minutes — roughly 12 guesses/hour ceiling regardless of how many source IPs the attacker controls, versus the previous *effective* ceiling of "unlimited, spread across enough IPs." Full bucket capacity (5 tokens) is restored after **25 minutes** (5 × 5 min) with zero further attempts.
**Applies to:** the same per-account bucket above.

**Parameter: Successful-login reset.**
**Exact value:** bucket reset to full capacity (5 tokens) **immediately** on a successful password check, before the response is returned.
**Why:** a legitimate user who mistyped a password twice before getting it right should not carry that history into their next session's worth of typos.

**Parameter: 429 response shape.**
**Exact value:** HTTP 429, body `{ retryAfterSeconds: <exact integer, computed from the bucket's own next-refill time>, message: "Too many attempts. Try again in <N> seconds." }`, plus a `Retry-After: <N>` header per RFC 6585/7231.
**Why no account-existence or attempts-remaining detail:** revealing "this account doesn't exist" (a different error today, unchanged) or "you have 2 attempts left" both hand an attacker information; the 429 body says only when to retry, nothing about the account's state.
**Where enforced:** the guard/service throwing a `ThrottlerException`-equivalent with the computed `retryAfterSeconds`.

**Parameter: Audit trail on throttle trips.**
**Exact value:** every 429 on `/auth/login` or `/auth/register` writes one `AuditService` entry (`action: 'auth.rate_limited'`, the hashed identifier, the source IP, timestamp) — not the password attempt itself, never logged.
**Why:** a real credential-stuffing campaign against one account should be visible to ops as a pattern of these entries, not invisible because it never crossed into a successful breach.

### 1.3 Dependency justification (per `.claude/rules/dependencies.md`)

```
Dependency: @nest-lab/throttler-storage-redis (+ ioredis, its own peer dep)
Purpose: shared, cross-replica storage for @nestjs/throttler's existing
  rate limits, and the backing store for the new per-account bucket.
Existing Alternative: hand-write a Redis-backed ThrottlerStorage
  implementation against ioredis directly.
Why Existing Alternative Is Insufficient: @nestjs/throttler's
  ThrottlerStorage interface has specific increment/expiry semantics
  (block duration, TTL reset behavior) that this maintained adapter
  already implements and tests against; hand-rolling it duplicates a
  solved, security-relevant primitive for no benefit — the exact
  "duplicate implementation is a defect" trap this repo already warns
  against.
Security Considerations: adapter only touches the throttling data plane
  (attempt counters), never business data; Redis instance is dedicated
  and network-isolated to the API service, no other consumer.
Maintenance Considerations: small, focused package (~200 lines), pinned
  version, low churn expected — a throttler storage adapter has a narrow
  contract that rarely needs to change.
Bundle / Runtime Impact: server-side only, no web bundle impact; adds one
  Redis round-trip per throttled request, sub-millisecond on a
  same-region Redis instance.
Approval Required: yes — new runtime dependency, new infrastructure
  (a second Redis instance) — owner sign-off before WO-206.1 starts.
```

### 1.4 Open points, named rather than decided silently

- Whether the account-bucket check lives in a Nest guard (declarative, consistent with `CREDENTIAL_THROTTLE`'s own `@Throttle()` pattern) or inside `AuthService.login()` directly (simpler to unit test, less "magic") is an implementation choice, not an architecture one — left to WO-206.1's own PR.
- Whether `/auth/reset-password` and `/auth/forgot-password` get the same per-account bucket (they're also credential-adjacent and already share `CREDENTIAL_THROTTLE`'s per-IP limit) is recommended yes, not yet decided — a password-reset flood is the same class of attack.

## 2. "Sudden logout" — this is refresh-token-rotation race handling, not a message queue

### 2.1 Reframing the request

A job queue (BullMQ or similar) processes background work; it has no role in why a legitimate, actively-used session gets logged out unexpectedly. Investigating `AuthService`'s actual refresh flow (`apps/api/src/core/auth/auth.service.ts`, `auth.controller.ts:90` `POST /auth/refresh`) — the real, well-known cause of "sudden logout" in a refresh-token-rotation system (which this one already implements, since `refresh` reads and presumably rotates `REFRESH_COOKIE`) is a **race between concurrent requests**: two browser tabs, or a retried request after a flaky connection, both present the same refresh token; the first rotates it successfully, the second is rejected as reusing an already-spent token — and today, if that rejection is treated as "this token is stolen, revoke the whole session," the user is logged out for what was actually a benign race, not an attack.

### 2.2 What's added — exact parameters

**Parameter: Reused-token grace window.**
**Exact value:** **10 seconds.**
**Applies to:** `POST /auth/refresh`. When a refresh token that was already rotated is presented again *within 10 seconds of its own rotation*, the request is served the same new token pair that the first, successful rotation already issued (idempotent replay), not rejected.
**Why 10 seconds, not 60 or 2:** long enough to cover a genuine race (two tabs firing near-simultaneously, a mobile network retry) — these resolve in low single-digit seconds in practice — while short enough that a token replayed by an actual attacker minutes or hours after theft gets no benefit from the window at all.
**Where enforced:** the refresh-token row (wherever it's persisted — check the real schema before naming a column) gains a `rotatedAt` timestamp and a pointer to the token that superseded it; a reuse outside the 10-second window is the real signal.

**Parameter: Reuse-outside-window response.**
**Exact value:** the entire refresh-token *family* (every token descended from the original login, not just the one presented) is revoked immediately, forcing a real logout, and one `AuditService` entry is written (`action: 'auth.refresh_reuse_detected'`) — this is the industry-standard "refresh token reuse detection" response (the same shape Auth0's and Okta's own rotation guidance both use), because a reuse outside the grace window means the token was captured and is now in two places at once.

**Parameter: Client-side single-flight refresh.**
**Exact value:** in each of `apps/web`, `apps/pos`, and the customer-facing storefront's own API client, at most **one** in-flight `/auth/refresh` request per browser tab at any time; every 401 that arrives while a refresh is already in flight *waits* on that same in-flight promise and retries with its result, rather than firing its own independent refresh call.
**Why this matters:** without it, a page that fires five API calls simultaneously and gets five 401s (access token just expired) sends five refresh requests — which is exactly what manufactures the race in §2.1 in the first place, on a single tab, with no attacker involved at all. This one client-side change removes most of the problem before the server-side grace window ever needs to fire.
**Where enforced:** the shared API client wrapper each app already has (not a new library — a module-level promise cache around the existing refresh call).

## 3. RAM ceilings — container limits already exist; the gap is the Node process's own heap flag

**Found:** `docker-compose.prod.yml` already sets real `mem_limit` values (1G / 768M / 640M across its services) and `docker-stack.prod.yml` mirrors them under `resources.limits.memory`. Nothing sets Node's own `--max-old-space-size`.

**The real risk this leaves open:** V8's default old-space ceiling is derived from total *system* RAM unless told otherwise — on some Node versions/hosts this can exceed what the container's cgroup will actually allow, so instead of a clean, catchable `FATAL ERROR: JavaScript heap out of memory` inside the process (which the process manager can log and restart on), the *container* gets OOM-killed by the kernel with no application-level log line at all — indistinguishable from a crash with no cause, exactly the kind of silent failure `.claude/rules/services.md` already forbids.

**Parameter: Node heap ceiling per service.**
**Exact value:** `--max-old-space-size` set to **75% of each service's own container `mem_limit`**, i.e. API (`1G` container) → `768`; the two `768M`/`640M` services → `576`/`480`.
**Why 75%, not 90% or 50%:** old-space is not the process's only memory consumer — buffers, native-addon memory (`sharp`'s own C++ heap for image processing is *outside* V8's managed heap entirely), and thread stacks all sit alongside it; 75% leaves real headroom for exactly the kind of native-memory spike `sharp` operations produce, while still catching a genuine V8 heap leak well before the kernel would have OOM-killed the whole container.
**Where enforced:** `NODE_OPTIONS=--max-old-space-size=<value>` set per-service in `docker-compose.prod.yml`/`docker-stack.prod.yml`, not hardcoded in application code (an environment value, per `.claude/rules/configuration.md`).
**For the standalone `scripts/*.mjs` tools** (build-index, checks) run in CI, not in a long-lived container: the same flag via `NODE_OPTIONS` in the CI job definition, sized to the CI runner's own documented memory (GitHub-hosted runners: 7GB standard — 75% → `5376`), not the production container figure, since they run on different hardware entirely.

## 4. Central connection pooling — the real answer, since "TERA" doesn't match a technology I can find

I don't recognize "TERA" as a specific product — closest real matches for "a central connection system to make connections faster" are (a) a database connection pooler sitting in front of Postgres, or (b) HTTP keep-alive/connection reuse for outbound calls. I'm specifying both, since they answer the two different kinds of "connection" this system actually makes; if a specific named product was meant, say which and I'll re-scope.

**Parameter: Database connection pooler.**
**Exact value:** **PgBouncer**, transaction-pooling mode, `default_pool_size=20`, `max_client_conn=1000`, sitting between every API replica and Postgres.
**Why transaction mode, not session mode:** Prisma issues short-lived, discrete queries/transactions rather than relying on session-level state (advisory locks aside — check for any real usage before enabling this in production), which is exactly what transaction-pooling mode is for; it lets a small number of *real* Postgres connections (20) serve many more concurrent API-side requests than a 1:1 connection model would allow.
**Consequence for the existing Prisma pool:** with PgBouncer as the real pool, each API replica's own `DATABASE_URL` `connection_limit` drops from `10` to **`5`** — PgBouncer is now doing the real pooling; Prisma's own small per-process pool becomes a thin client-side buffer, not the primary limit.

**Parameter: Outbound HTTP keep-alive.**
**Exact value:** a shared `https.Agent`/`http.Agent` with `keepAlive: true`, `keepAliveMsecs: 30_000` (30s), `maxSockets: 50` per destination host, used for every outbound call this codebase already makes through `OutboundConnector` (doc 36) and every typed provider (`PaymentProvider`, `FiscalComplianceProvider`, etc.) — replacing whichever HTTP client default each currently uses (check `axios`/`fetch` usage per module before assuming one client).
**Why 50 sockets, not unbounded:** unbounded keep-alive sockets to one host is itself a resource leak under a traffic spike; 50 concurrent connections to any single external provider is far more than this repo's real per-provider call volume needs today, with headroom.

## 5. API response caching — Redis-backed, cache-aside, never for session-scoped data

**Parameter: Cache backend.**
**Exact value:** the same dedicated Redis instance as §1 (a separate logical DB index, e.g. DB 1 vs. DB 0 for rate limiting — never the same keyspace, so a cache flush can never accidentally clear rate-limit state or vice versa).

**Parameter: Default TTL for cacheable, non-personalized reads.**
**Exact value:** **300 seconds (5 minutes)**, applied to reads this repo's own performance rule already names as cacheable in kind (published CMS content, category trees, brand-resolved config) that don't already have a stated cache per `.claude/rules/performance.md`'s own table (e.g. `VariantSalesStat`-style precomputed caches keep their own existing cadence — this is not a second cache for something already cached).
**Why 5 minutes:** short enough that a content edit is visible within one refresh cycle even if explicit invalidation is missed somewhere; long enough to absorb real repeated-request traffic (the literal problem statement: "prevent recalling same API again and again") without serving meaningfully stale data.
**Invalidation:** cache-aside with an explicit `del()` on the relevant key(s) inside the same service method that performs the write — TTL is the backstop, not the primary correctness mechanism, per this repo's own performance rule ("every cache states... invalidation strategy").
**What's never cached here:** anything keyed by or scoped to a specific user/session/tenant — per-request personalization stays uncached in this layer, full stop, per the existing performance rule's own "auth isolation" requirement.

## 6. Preventing irrelevant component loading — exact threshold, not a vague "lazy load heavy stuff"

**Found:** zero uses of `next/dynamic` or `React.lazy` anywhere in `apps/web` or `apps/pos` today — Next.js's own per-route App Router splitting is the only code-splitting currently happening.

**Parameter: Dynamic-import threshold.**
**Exact value:** any component whose own contribution to a page's JS bundle exceeds **50KB gzipped**, or that is not visible without a user action (a modal, a non-default tab, an expandable panel), gets `next/dynamic(() => import(...), { ssr: false, loading: () => <ExistingSkeleton/> })` rather than a static import.
**Why 50KB:** small enough to catch genuinely heavy dependents (rich-text editors, chart libraries, the resilience engine's own multi-tab `/admin/resilience` UI) without churning through dozens of trivial components for negligible byte savings — Lighthouse's own "reduce unused JavaScript" flags typically start mattering around this order of magnitude.
**Measurement, not a guess:** enforced by checking the actual per-chunk bundle size (Next.js's own build output / `@next/bundle-analyzer`) before and after, per this repo's own performance rule's "every claim needs a measurement."

## 7. Response compression — the exact stack, in the requested priority order

**Parameter: Negotiated encoding priority.**
**Exact value:** **zstd → brotli → gzip → identity**, selected by parsing the client's own `Accept-Encoding` header (never assumed) and picking the first the server supports that the client also advertises — the requested order is also the real current best-practice ordering (zstd: best speed/ratio for dynamic responses; brotli: smallest output for text/JSON, slower to produce at high quality; gzip: universal fallback; identity: uncompressed, for clients or payloads that don't benefit).

**Parameter: Node/zlib zstd availability.**
**Exact value:** Node's built-in `zlib.zstdCompress`/`zstdCompressSync` ships from **Node 22.15.0**. This repo's `package.json` `engines.node` is currently `">=22"` — too loose to *guarantee* it (an installed 22.0–22.14 would lack it) — while the actual running version here is `22.22.2`, which has it. **Fix, exact value:** tighten `engines.node` to `">=22.15.0"`. This means **no new dependency for zstd** — it's a one-line `package.json` change plus the engines floor, not a native-addon install.

**Parameter: Dynamic (per-request) compression levels.**
**Exact value:** brotli `BROTLI_PARAM_QUALITY: 4`; zstd level `3`; gzip level `6` (Node zlib's own default, left unchanged).
**Why these, not maximum quality:** a real-time API response has to be compressed within the request's own latency budget — brotli quality 11 or zstd level 19+ are an order of magnitude slower to *produce* for a small size gain that doesn't matter at API-response scale; levels 3–4 keep compression overhead in the low single-digit milliseconds while still capturing most of the size reduction.

**Parameter: Static build assets (JS/CSS bundles).**
**Exact value:** pre-compressed once at build time at **brotli quality 11**, served as `.br` files the CDN/reverse-proxy prefers when the client accepts brotli — the cost here is paid once per deploy, not per request, so maximum ratio is the right trade-off, the inverse of the dynamic-response case above.

**Parameter: Minimum size before compressing at all.**
**Exact value:** **1024 bytes (1KB).** Responses smaller than this are sent uncompressed — compression overhead (CPU cost, and the encoding header itself) can exceed the transfer savings on a tiny payload; 1KB is the same threshold Express's own `compression` middleware already defaults to, kept rather than invented.

## Work orders

**WO-206.1** — Redis-backed throttler storage (§1.2, first parameter) + the new dedicated Redis instance's provisioning.
**WO-206.2** — Per-account login-attempt token bucket, 429 shape, audit entries (§1.2, remaining parameters).
**WO-206.3** — Refresh-token reuse-detection grace window + family revocation (§2.2, server side).
**WO-206.4** — Client-side single-flight refresh mutex, all three apps (§2.2, client side).
**WO-206.5** — `NODE_OPTIONS=--max-old-space-size` per service + CI scripts (§3).
**WO-206.6** — PgBouncer deployment + Prisma `connection_limit` retune (§4, first parameter).
**WO-206.7** — Shared keep-alive HTTP agent for outbound connectors/providers (§4, second parameter).
**WO-206.8** — Redis-backed cache-aside layer for the named cacheable reads (§5).
**WO-206.9** — Dynamic-import pass over components exceeding the 50KB threshold (§6).
**WO-206.10** — Compression middleware (zstd/brotli/gzip negotiation) + `engines.node` bump + static-asset pre-compression (§7).

## Acceptance

- A distributed login attack against one account (many source IPs, each under the per-IP limit) is refused past 5 attempts within any 5-minute window, provable by an integration test simulating requests from multiple IPs against one account.
- Two concurrent legitimate refresh requests against the same token both succeed (idempotent replay within 10s); a refresh token replayed after a simulated 10-minute delay revokes the whole family and is provable by test.
- Every service's container is OOM-killed *less* often than it hits its own `--max-old-space-size` heap error in a sustained-load test, not the other way around.
- A repeated GET against a named cacheable endpoint shows a cache hit (no DB query) on the second call within the TTL window, and a cache miss immediately after the underlying write, provable by test.
- A component over the 50KB threshold does not appear in the initial page chunk's bundle-analyzer output.
- A response over 1KB negotiates zstd when the client sends `Accept-Encoding: zstd, br, gzip` and the server has it available; falls back correctly down the chain when a client omits zstd/brotli support.

## Out of scope

Redis Cluster / multi-region Redis (single dedicated instance is sufficient at current scale — named as a future trigger, not built now); CDN selection for static assets (a separate, already-named performance-rule item, not decided here); a general-purpose distributed lock service beyond what the refresh-token grace window needs; changing any *existing* rate-limit number (300/60s global, 10/60s credential) — only their storage backend and the new second layer are in scope.
