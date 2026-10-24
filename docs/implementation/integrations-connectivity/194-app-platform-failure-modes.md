# 194 — Failure modes of the app platform: every way it breaks, what still works, and what contains it

> **Status: proposed, not yet built.** None of the mechanisms named below
> exists yet (docs 185–193). The pattern this document extends **is** built:
> doc 38's degradation matrix, rendered as `DEGRADATION_MATRIX` on
> `/admin/platform-resilience`
> (`apps/web/src/app/(admin)/admin/(app)/platform-resilience/page.tsx`), and
> `CircuitBreakerService` (`apps/api/src/core/resilience/circuit-breaker.service.ts`),
> which already wraps `AiProvider`, `PaymentProvider` and `VectorStore`. Doc
> 38's rule governs everything here: "a dependency being down removes *one
> capability*, never *the record of what already happened*". Part of [doc
> 184](./184-app-platform-overview-and-remote-only-decision.md)'s program
> (ADR-073).

## 1. Rows added to doc 38's degradation matrix

Each row is added to doc 38 §1 and to `DEGRADATION_MATRIX` on the
resilience page, in the page's own shape (dependency / still works /
degrades). The page says to keep that array "in sync with the doc's own
table by hand", so both change in the same PR.

| Dependency down | What still works | What degrades | Source |
|---|---|---|---|
| **One installed app's webhook endpoint** | Everything internal; every other app; every in-process listener | That app's deliveries queue (`OutboxDelivery` `PENDING`), retry ≤ 5-minute cadence for 72 h, then dead-letter with replay | Doc 188 §2.6 |
| **One installed app's API client** (the app itself is down) | Everything | Nothing on our side — its token simply isn't presented | Doc 189 |
| **An app bound as `CourierProvider`** | `manual` and every other courier; orders | That courier's bookings and tracking, behind its own `courier.<key>` circuit; orders wait in the fulfilment queue | Doc 190 §2 |
| **An app bound as `PaymentProvider`** | Every other payment method; checkout renders (the fee is local) | That method's redirect fails at the app; its `payment.<key>` circuit hides it (doc 38's existing payment row) | Doc 190 §2 |
| **The App Directory (control plane) — browse and install** | Every installed app; uninstall and suspend; every private connection | No browsing, no new installs, no upgrades | Docs 185, 187 |
| **The App Directory — status feed** | Every installed app, on last-known status | NEWAX's kill switch cannot reach this node; the tenant's own switches still work; shown after 30 min, hub item after 24 h | Doc 191 §3.4 |
| **The App Directory — lifecycle receiver** | Install and uninstall on the tenant | The platform's record lags; notices queue 72 h; reconciliation converges before the next invoice | Docs 188 §5, 191 §5 |
| **A tenant's database during billing reconciliation** | Every other tenant's invoice | That tenant's invoice is deferred to the next daily run, never issued unreconciled | Doc 192 §5.3 |
| **A publisher's `/.well-known/newax-app.json`** | The app on its current key and URLs | A key or URL *addition* waits (retried hourly, 7 days); removals still apply | Doc 191 §4.3 |

## 2. Each failure, specifically

For each: what happens, how it is noticed, what contains it, what still
works, how it recovers, and who acts.

### 2.1 An app's endpoint is down for hours or days

- **Happens:** its deliveries fail with 5xx, timeouts or TLS errors.
- **Noticed:** its `outbound.APP_INSTALLATION.<id>` circuit opens (doc 38 §2).
  The installation's Deliveries health shows the oldest pending age. The
  first `FAILED_EXHAUSTED` raises one action-hub item.
- **Contained:** per-subscriber claim fairness (at most 5 rows per subscriber
  per batch) and concurrent sending mean no other subscriber waits. An open
  circuit reschedules without burning attempts. The in-process outbox never
  sees it (doc 188 §1).
- **Still works:** everything else.
- **Recovers:** on the circuit's half-open trial succeeding. The queue drains
  in `availableAt` order, deduplicated by `X-Newax-Delivery` at the app.
  Past 72 hours, `apps.manage` replays a range.
- **Who:** nobody within 72 hours; `apps.manage` after.

### 2.2 A webhook delivery storm

- **Happens:** a 10,000-row product import, a mass status update, or 20 apps
  each subscribed to `catalog.product_changed`.
- **Contained:** coalescible topics collapse to one pending row per entity per
  app (doc 188 §2.4). Status-transition topics never coalesce, but each
  subscriber is capped at 600 sends a minute and excess rows wait, never
  drop. The fan-out itself is a `createMany` inside the outbox's delivery,
  with no HTTP. It is the catalogue lens *The busiest minute*: no lock is
  held across a network call.
- **Still works:** the import itself completes on its own clock. The outbox
  drains at its normal rate, because the storm lives in `OutboxDelivery`, not
  `OutboxEvent`.
- **Who:** nobody. If an app cannot keep up for 72 hours, §2.1 applies.

### 2.3 A credential revoked in the middle of a transaction

- **Happens:** an admin uninstalls while the app has a request in flight, or
  a kill-switch entry lands mid-request.
- **Behaviour:** authentication is per request, so a request authenticated
  before the revocation commits completes inside its own transaction, and
  the next request is refused (doc 189 §6). Its write stands on the
  authorization it had, as for any revoked credential (doc 163).
- **Work that outlives the request** re-checks
  `ApiClientsService.isLive(actorUserId)` at each chunk and stops with a
  recorded reason (doc 189 §6, WO-189.9).
- **A payment the app was taking** is settled by a verified callback during
  the 30-day grace (doc 190 §5), because the money may already have moved.
  After that it waits in the awaiting-approval queue for a person.

### 2.4 A malicious published app

- **Reach:** exactly the tenants that installed it × exactly the keys each
  consented to (doc 191 §4.1). It cannot hold a non-delegatable, checker or
  `org.access.grant` key, reach a `@SessionOnly()` route, widen its own
  grant, or discover other tenants.
- **Noticed:** repeated 403s raise the probing signal at each tenant (doc 189
  §4); tenants file `SECURITY`/`DATA_MISUSE` reports (doc 186 §5.1).
- **Contained:** each tenant can uninstall or suspend immediately. NEWAX
  suspends the listing on every tenant in under 2 minutes (doc 191 §3.3),
  revoking every unexpired token as it lands. Open payables to the publisher
  are held (doc 192 §6.3).
- **Recovers:** removal uninstalls it everywhere. Data it already took is §6
  of doc 191 — contractual, reported and never pretended away.

### 2.5 A compromised published app (the vendor is breached)

- **Differs from §2.4** in that the publisher is a victim and will cooperate.
- **Contained:** NEWAX suspends. The publisher rotates its signing key
  through a fast-tracked version (doc 186 §3.3, a 4-business-hour SLA).
  Approval appends `SIGNING_KEY_REVOKED`, and every tenant revokes exactly
  the tokens that key minted. Each tenant's webhook secret is rotated by the
  app through doc 189 §2.3 once it has recovered.
- **Reinstated** by a *different* ops principal (doc 186 §5.3), only after
  rotation. Old tokens are not revived.

### 2.6 A publisher account takeover

- **Happens:** an attacker holds an `AppPublisherCredential`, or in Phase 4
  the developer sign-in.
- **Can:** submit versions. **Cannot** approve them — review is NEWAX's. It
  cannot widen any tenant's grant without that tenant's consent (doc 185
  §5). It cannot redirect traffic or add a signing key without the app's
  **own** well-known document confirming it, on the domain the tenants
  already consented to (doc 191 §4.3).
- **Noticed:** an unexpected submission in the publisher's own history; the
  reviewer's diff (doc 186 §3.3) shows a URL or key change the publisher did
  not announce.
- **Contained:** `platform.apps.publishers.manage` revokes the credential. It
  sets `revokedAt`, and the row is kept for provenance (doc 186 §1).
  `AppVersion.submittedByCredentialId` names every version it submitted.
- **Prevented, Phase 4:** the developer sign-in requires a second factor
  proven by the identity provider (doc 186 §2.1).

### 2.7 The control plane itself is compromised

- **Can:** suspend or remove apps everywhere — a denial of service in the
  fail-safe direction, every act an append-only row. It can approve a
  malicious *new* app, which still needs each tenant's own consent to reach
  any data.
- **Cannot:** read any tenant's data (it holds no tenant credential for any
  app, doc 191 §4.4); widen an existing grant (consent is per tenant); add a
  signing key or change a URL for an existing app without the publisher's
  domain agreeing (doc 191 §4.3); or write into any tenant database (the
  only boundary crossing is doc 191 §5's read-only reconciliation query).
- **This is the one failure where doc 191 §4.3's two-party rule is load-bearing**, and
  why it exists.

### 2.8 The control plane is unreachable

Browse and install stop, while installed apps, uninstall, suspend and private
connections all continue (§1). The kill-switch feed fails **open** —
deliberately, and visibly (doc 191 §3.4). The alternative would make a NEWAX
incident an outage of every app on every tenant at once.

### 2.9 The tenant is unreachable from the app

The app's retries are its own. Nothing is lost on our side, because we
record nothing for requests that never arrived. Our deliveries to the app
continue independently.

### 2.10 A webhook secret leaks

- **Risk:** someone who is not NEWAX can forge deliveries to that one
  installation's app. It is one tenant's secret, per installation (doc 187
  §1), and grants no access to NEWAX data — the secret authenticates *us to
  the app*.
- **Contained:** the app rotates it through doc 189 §2.3's JWT-authenticated
  route (a 24-hour dual-sign overlap), and the tenant sees
  `webhookSecretRotatedAt`. A secret never leaves the tenant except to the
  private-key holder.

### 2.11 Runaway API usage (a bug loop in an app)

The per-client rate limit returns `429` with `Retry-After` (doc 189 §4) and
the installation screen shows the rate-limited count. Other clients and
people are unaffected: each client has its own limit, and failed-auth
guessing has its own per-address limit, shared across `nxa_`/`nxc_`.

### 2.12 Clock skew

A minting JWT is accepted within ±60 seconds of `iat`/`exp`, and `exp − iat`
must be ≤ 300 s (doc 189 §2.1). A webhook's `t` is freshly set per attempt,
and the directory policy asks receivers for a 5-minute tolerance (doc 188
§3). A node whose clock drifts beyond that fails its own mints and
deliveries loudly — 401s and 4xx on every attempt — and never
intermittently. The fix is the node's NTP, named in `DEPLOYMENT.md` as an
operational requirement.

### 2.13 Version skew — an approved manifest a tenant's release does not understand

`validateAppManifest()` runs on the tenant against its own
`PERMISSION_CATALOG` and `APP_EVENT_TOPICS`. An unknown key or topic yields
"This app needs a newer NEWAX release" — never a consent screen that drops a
scope (doc 185 §2). An installed app whose *upgrade* needs a newer release
stays on its current version; the upgrade shows as waiting on the release,
not failed.

### 2.14 The outbox strands an event in `PROCESSING`

A process dying mid-batch leaves `OutboxEvent` rows `PROCESSING` forever
(doc 163 §7's finding). For apps that means the fan-out never ran, so no
app hears of the event, silently. This program makes the fix a prerequisite
(doc 195, WO-195.0): a `claimedAt` lease on `OutboxEvent`, reclaimed after 5
minutes, mirroring `OutboxDelivery`'s own (doc 188 §2.5). That also closes
the gap doc 163 §7 names for `/health/ready`, which counts only `PENDING` and
`FAILED` and so never saw a stranded row: after the lease, a stranded row
becomes `PENDING` again and is counted.

### 2.15 A webhook URL aimed inward (SSRF, DNS rebinding)

Refused at review — public addresses only, under a verified domain (doc
186 §3.1). Refused again **at every send**, by `safe-https.ts`'s checked
`lookup`, connecting to the vetted address. Redirects are never followed,
and responses are read to at most 64 KB (doc 188 §4). The same sender serves
provider calls (doc 190 §2) and the well-known fetch (doc 191 §4.3).

## 3. Circuit keys this program adds

All go through the existing `CircuitBreakerService.execute(key, fn)`, with
its in-memory, per-process semantics and `platform.resilience.tune`-gated
configuration, and all appear on the resilience page's circuit list:

| Key | Wraps |
|---|---|
| `outbound.APP_INSTALLATION.<installationId>` | Webhook sends to one app |
| `outbound.CONNECTOR.<connectorId>` | Doc 36 connector sends (via doc 188) |
| `outbound.PLATFORM.platform` | Lifecycle notices to the control plane |
| `payment.app_<slug>` | An app-bound payment method (the existing `payment.<key>` pattern) |
| `courier.app_<slug>` and `courier.<key>` for built-ins | Courier calls, a wrap that is new for every courier |
| `app-directory` | The tenant's directory proxy (`AppDirectoryClient`), so a down directory fails fast on the browse screen |

## Scope lenses

This document adds no new artifact beyond matrix rows and circuit keys; the
lenses for each mechanism are answered where it is specified (docs 187, 188,
189, 190, 191, 192). What this document uniquely decides:

**Request or record — classify every write** — every failure above preserves
the classification its mechanism set. No record is ever refused because a
dependency is down: uninstall, lifecycle notices, verified payment
callbacks during grace, and delivery rows are all accepted locally and
queued outward.
**Four hours down, the counter stays open** — answered per dependency in §1.
The one control that fails open (the feed) is chosen, stated and visible.
**Authority and blast radius** — §2.4–§2.7 bound each compromise by what it
could already reach. The two-party rule (doc 191 §4.3) is the only control
whose absence would widen a single compromise to every installation.
**The failure path, and who is allowed to walk it** — every row names its
durable store (`OutboxDelivery`, `AppStatusFeedCursor`,
`AppInstallationRecord`, the awaiting-approval and fulfilment queues), its
screen, and its permission (`apps.manage`, `payments.approve`,
`fulfilment.manage`, `platform.apps.*`).
**The switch, its scope, and who may throw it** *(catalogue)* — doc 191 §1's
four levers; this document adds the circuits, which are automatic switches
tunable by `platform.resilience.tune`.
**Every other lens** — n/a here, answered in the owning document.

## Work orders

**WO-194.1 — the matrix rows**, added to doc 38 §1 and `DEGRADATION_MATRIX`
in the same PR (the page's own sync rule).
**WO-194.2 — contract tests**, one row-by-row degradation test per new
matrix row, in doc 38 WO-38.1's table-driven style (ADR-070): an app
endpoint returning 500 leaves another app and an in-process listener
unaffected; the directory proxy down leaves `/admin/apps` rendering the
installed list; the feed down leaves tokens working and shows the warning.
**WO-194.3 — circuit wraps**: `courier.<key>` around `FulfilmentService`'s
provider calls, and `app-directory` around `AppDirectoryClient`.
**WO-194.4 — `DEPLOYMENT.md`**: NTP as an operational requirement for every
node running `app-installations`.

## Acceptance

- Every §1 row has a passing degradation test.
- A fault-injection run that takes one app's endpoint down for an hour, with
  another app and all in-process listeners subscribed to the same events,
  shows zero delay or loss for the others and full drain for the failing
  app on recovery.
- With the control plane unreachable, a tenant can uninstall an app and the
  app's next request is refused.

## Out of scope

Paging on-call for a tenant's app being down. It is the tenant's app,
surfaced in the tenant's action hub, and not a NEWAX incident unless many
tenants report it (doc 186 §5).
