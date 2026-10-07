# ADR-070 — Doc 38 (resilience engineering): a table-driven contract test over the real source tree instead of 69 hand-written files, `RequestOutcome` instead of forcing SLO data through the business-metrics registry, and a genuine `/admin/resilience` naming collision resolved by renaming the newer screen

[← Decision log](../DECISIONS.md)


### Context

Doc 38 asks for six work orders: the degradation matrix proven by test
(WO-38.1), a `CircuitBreaker` wrapping `AiProvider`/`PaymentProvider`/
`OutboundConnector`/`VectorStore` (WO-38.2), SLO/error-budget
instrumentation on three named critical paths (WO-38.3), real DR numbers
(WO-38.4), a domain-event contract test suite (WO-38.5), and three new
`platform.resilience.*` permissions (WO-38.6). Several of its own asks are
underspecified on purpose (doc 38 explicitly invites judgment on the
contract-test suite's shape) or run into a fact this document could not
have known at the time it was written: `OutboundConnector` does not exist,
`core/metrics`'s existing extension point was built for a different shape
of data, and a completely unrelated document (144) had already claimed the
`/admin/resilience` route for a different feature.

### Options Considered

1. **One hand-written contract test per domain event (69 files).** Doc 38
   §5 literally suggests this shape, then explicitly says to use judgment.
   Rejected: every event's assertion is structurally identical (a
   subscriber's assumed fields must be a subset of the real payload's
   fields), so 69 files would be 69 copies of one check, not a new
   contract per event — a maintenance cost the same discipline
   `check-module-boundaries.mjs` already rejects for cross-module checks.
2. **A single, table-driven static analyzer** (`contract-analyzer.ts`) that
   parses the real `domain-events.ts` and every `@OnDomainEvent` handler in
   the real source tree, character-scanning rather than using the
   TypeScript compiler API. Chosen. The existing `check-*.mjs` scripts are
   all line/character-based scanners by established convention
   (`CLAUDE.md`: "the scanners are line-based, not a type checker"); this
   codebase's payload interfaces are uniformly flat (confirmed by reading
   every one in `domain-events.ts`), making a character scanner tractable
   and lower-risk than standing up the TypeScript compiler API for one
   test suite. A naive line-based version was tried first and produced
   false positives from stray braces inside comments and lost real
   `payload.x` accesses written inside template-literal interpolations
   (`posting-rules.subscriber.ts`'s own `` `${payload.billId}:${payload
   .paidAt}` `` sourceRef) — both fixed by masking comments/plain strings
   to blanks while keeping a template literal's own `${...}` code live,
   proven against the real tree (0 violations, 71 real handlers checked)
   and proven to actually catch a break (`PasswordChangedPayload.userId`
   was temporarily renamed, the suite failed naming the exact broken
   subscriber, then the rename was reverted — see doc 38's own status
   blockquote).
3. **Force SLO/error-budget data through `core/metrics`'s existing
   `MetricProvider` extension point**, since it already exists and this
   session built it. Rejected on inspection: `MetricContext`/`MetricValue`
   are shaped around a permission-gated, previous-period-compared
   *business* number computed on demand for a dashboard card — there is no
   way to express "record this one request's outcome, right now,
   non-blocking" through it, and forcing that shape through an interface
   built for something else would be exactly the wrong-abstraction
   `CLAUDE.md`'s "before creating a new abstraction" question warns
   against answering by reflex. A new, minimal `RequestOutcome` table plus
   `SloRecorderService` was built instead, purpose-built for a
   fire-and-forget outcome/latency record with a trailing-window
   aggregate query.
4. **Wrap every extension point doc 38's matrix cites**
   (`StorageDriver`, `SmsProvider`, `WhatsAppProvider`) in a circuit
   breaker too, since the matrix mentions them.** Rejected: doc 38's own
   §2 names exactly four — `AiProvider`, `PaymentProvider`,
   `OutboundConnector`, `VectorStore` — and expanding that list silently
   would be scope creep past what the document itself asked for.
   `NotificationsService`'s existing `Promise.all`-per-channel fan-out
   already isolates one channel's failure from another with no shared
   state to trip a breaker against; `StorageDriver` has no retry path for
   a breaker to protect (see the found gap below). Both are named,
   reasoned exclusions in doc 38's own status blockquote, not silent
   omissions.
5. **Route `/admin/resilience` on the web app for doc 38's new dashboard**,
   the literal name the work order's own brief suggested. Investigated
   first: `apps/web/src/constants/routes.ts` and `nav-registry.ts` already
   held a `resilience` key at that exact path for
   `144-supply-chain-resilience-planning-engine.md`'s own "Resilience
   Planning" screen — a real collision (confirmed live: a first attempt at
   this route silently overwrote doc 144's page, caught by `git status`
   showing the file as modified rather than new, and reverted with `git
   checkout` before being rebuilt at a new path). Doc 144's screen shipped
   first and keeps the shorter name; doc 38's screen is named "Platform
   Resilience" at `/admin/platform-resilience` instead — a naming
   collision resolved by renaming the newer, unshipped screen, never by
   overwriting the existing one.
6. **A dry-run `CircuitBreaker.simulate()` fed by live historical call
   data**, as doc 38 §2's own "dry run before live" lens asks for. Found
   genuinely unbuildable against real data today: no call-outcome log
   exists for `AiProvider`/`PaymentProvider`/`VectorStore` calls (WO-38.3's
   own `RequestOutcome` table instruments three different, named business
   paths — checkout, POS sale, replication sync — never these four
   extension points). Chosen instead: `simulate()` is a real, pure,
   unit-tested replay function taking a caller-supplied history, ready to
   wire to a live log the day one exists, honestly unable to answer
   "would this have tripped last month" until then — named explicitly
   rather than faked against data that does not exist.

### Decision

**2, 3, 4, 5, 6** — see this session's changes and doc 38's own status
blockquote for the full account of what shipped, what was found missing,
and what was deliberately left out.

- **A parser proven against the real tree, not just a happy-path fixture.**
  `event-contracts.spec.ts` runs `contract-analyzer.ts` against every real
  `@OnDomainEvent` handler in `apps/api/src`, not a curated sample — the
  same "the scanner is checked against the actual codebase, not a mock of
  it" discipline `check-module-boundaries.mjs`'s own self-test already
  establishes for module boundaries.
- **A found gap is reported, not silently fixed or silently ignored.**
  `StorageDriver`'s "queue for retry" claim in doc 38's own §1 table does
  not match `storage.service.ts`'s real behavior — surfaced in the status
  blockquote and via a new test proving the actual current behavior,
  rather than either fabricating a passing test for code that does not
  exist or quietly building a retry queue as an unscoped side effect.
- **A route collision is caught and fixed before merge, not shipped.** The
  `/admin/resilience` overwrite was caught by reading `git status` after
  the first write, reverted, and the new screen was given a distinct name
  — exactly the "review the complete diff" discipline `CLAUDE.md`'s Git
  discipline section asks for, applied to a collision a plan alone would
  not have surfaced.

### Consequences

- `OutboundConnector`'s circuit-breaker wrap remains unbuilt until doc 36
  ships — tracked in doc 38's own status blockquote, the identical shape
  ADR-068 already records for doc 37's own `ApiClient` gap.
- The deploy-freeze on a breached error budget is a computed boolean and a
  dashboard banner, not an enforced CI/CD gate — a future CI workflow can
  read `GET /admin/resilience/slo`'s `overBudget` field, but none does
  today, named honestly rather than claimed.
- RTO stays unmeasured, and the real number will not exist until the first
  quarterly game-day actually runs against a live Docker Swarm stack —
  `DEPLOYMENT.md` §9 states this as pending, not as a placeholder to
  forget.
- A second, unrelated document now shares the word "resilience" with two
  different admin screens at two different routes
  (`/admin/resilience` for doc 144, `/admin/platform-resilience` for doc
  38) — a naming seam future readers should know about, recorded here
  rather than left to be rediscovered as a surprise.
