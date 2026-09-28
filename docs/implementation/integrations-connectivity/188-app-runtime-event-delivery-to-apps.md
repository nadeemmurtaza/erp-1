# 188 — NEWAX → app: signed, retried, per-subscriber-isolated delivery, built as the outbox's external layer and not a second event system

> **Status: proposed, not yet built.** No `OutboxDelivery`,
> `OutboxSubscriberRegistry`, `OutboxFanOutListener` or
> `OutboxDeliveryDispatcher` exists (grep, `main` at `642b2831`). Doc 36's
> `ConnectorDelivery`, which this document realises, is unbuilt too
> (`circuit-breaker.service.ts`'s own header: "`OutboundConnector` … does
> not exist in this codebase yet"). Everything reused is cited to its file.
> Part of [doc 184](./184-app-platform-overview-and-remote-only-decision.md)'s
> program (ADR-073). Installation-level lenses are in [doc
> 187](./187-app-installation-consent-lifecycle.md), revocation in [doc
> 191](./191-app-revocation-kill-switch-tenant-isolation.md). This document
> answers the lenses its own delivery engine raises.

## 1. Why the outbox cannot simply get an HTTP listener

The transactional outbox (`apps/api/src/core/events/`) is the right
foundation. `EventBusService.publish(name, payload, tx)` writes the event in
the same transaction as the fact, so the event exists if and only if the
fact does. What it does **not** give, read from the code rather than
assumed:

- **One row per event, not per subscriber.** `OutboxEvent` (`core.prisma:555`)
  has one `status`/`attempts`. `OutboxDispatcher.deliver()` calls
  `EventBusService.dispatch()` → `EventEmitter2.emitAsync(name, payload)`,
  which runs **every** in-process listener. If any one throws, the whole
  event is retried for all of them — which is why every listener must be
  idempotent (`on-domain-event.decorator.ts`).
- **Sequential delivery.** `processBatch()` walks up to 25 claimed events
  with `for … await this.deliver(…)` and a `running` flag, so one slow event
  holds up every event behind it.
- **A short ceiling.** `MAX_ATTEMPTS = 8` with
  `Math.min(2 ** n * 1000, 300_000)` gives up after about 8.5 minutes and
  marks the event `FAILED` — for every subscriber.
- **No lease.** A `PROCESSING` claim is never reclaimed (doc 163 §7's
  finding, still true).

Put an app's HTTP call inside a listener and all four bite at once. One app
timing out stalls the drain for the whole tenant. One app returning 500
re-runs every other subscriber's handler. After 8.5 minutes of one app's
outage, the event is `FAILED` and nobody hears about it — including every
other app and the in-process listeners. This is not hypothetical:
`TradingPartnersService.pushOutbound()` (`trading-partners.service.ts:193–213`),
called from `ProductAlertsListener`, is exactly this shape. It is a `fetch`
with **no timeout**, whose failures are logged and **swallowed**, so the
event is marked `DONE` whether or not the partner received it. Doc 18
§18.3 and doc 166 §2 both describe it as "at-least-once, retried with
backoff"; the code is neither (doc 184 §6).

## 2. The design: the outbox fans out once; each external subscriber gets its own row

```
business tx ── EventBusService.publish(name, payload, tx) ──▶ OutboxEvent (unchanged)
                                                                   │  OutboxDispatcher (unchanged,
                                                                   │  + passes {id, createdAt}; + lease, WO-195.0)
                                                                   ▼
                                                     EventEmitter2.emitAsync(name, payload, meta)
                         ┌──────────────────────────────────────────┼─────────────────────────────┐
             existing @OnDomainEvent listeners           OutboxFanOutListener (onAny)            …
                                                                   │  registry.targetsFor(name, payload)
                                                                   │  → createMany(skipDuplicates)
                                                                   ▼  — a few rows, one indexed query, fast
                                      OutboxDelivery  (one row per external subscriber per event)
                                                                   │
                                                   OutboxDeliveryDispatcher (@Interval 1 s)
                          claim with lease + per-subscriber fairness · SSRF-safe HTTPS · 10 s timeout
                     HMAC signature at send · per-subscriber circuit (CircuitBreakerService) · backoff
                                                                   ▼
                                       the app's webhook URL / the platform / a doc 36 connector
```

**Stage 1 — fan-out, inside the outbox's own guarantee.**
`OutboxFanOutListener` (`apps/api/src/core/events/outbox-fan-out.listener.ts`)
subscribes with `EventEmitter2.onAny()`, exactly as `TaskEventIntakeService`
(`modules/tasks/task-event-intake.service.ts`) already does, for the same
reason that file gives: the event names are not known at compile time.
`EventBusService.dispatch()` is the only `emitAsync()` call site, so it sees
only real outbox events. For each event it asks
`OutboxSubscriberRegistry.targetsFor(name, payload, meta)` for targets and
writes one `OutboxDelivery` per target with `createMany({ skipDuplicates:
true })`. It does **no HTTP**: a handful of inserts, taking milliseconds. If
it throws, the event is retried under the outbox's existing rules, and the
unique key makes the retry a no-op for rows already written. If another
listener throws, the fan-out runs again and is again a no-op. At-least-once
fan-out with exactly-once rows.

**Stage 2 — delivery, per subscriber, outside the outbox.**
`OutboxDeliveryDispatcher` drains `OutboxDelivery`. A slow, failing or
dead app affects only its own rows. The in-process outbox never waits on a
network call and never retries on an app's behalf.

**This is the outbox extended, not a second mechanism.** The event is still
written once, in the business transaction, by `EventBusService.publish()`.
The outbox still guarantees the fan-out happens. `OutboxDelivery` is a child
of the `OutboxEvent` row (`outboxEventId` is part of its unique key). The
backoff formula is the dispatcher's own. Doc 36 said the same of its
`ConnectorDelivery` — "the existing one pointed at an external HTTP target
instead of an internal NestJS subscriber" — and this document is that
sentence, built once for every external subscriber (§5).

### 2.1 The one change to existing core code

`EventBusService.dispatch(name, payload)` gains an optional third argument,
`meta: { outboxEventId: string; occurredAt: Date }`, passed straight through
`emitAsync(name, payload, meta)`. `OutboxDispatcher.claim()` adds
`createdAt` to its `select`, and `deliver()` passes both. Every existing
`@OnDomainEvent` handler takes one parameter and ignores the extra argument,
so nothing else changes. Without this, the fan-out has no stable id to key
idempotency on.

### 2.2 The registry — how modules become subscribers without importing each other

```ts
// apps/api/src/core/extension-points/outbox-subscriber.registry.ts
export interface DeliveryTarget {
  subscriberId: string;
  topic: string;
  /** The envelope's `data` — computed now, never re-read at send (the version stamp). */
  body: Record<string, unknown>;
  /** Only for topics declared coalescible (§2.4). */
  coalesceKey?: string;
}

export interface PreparedSend {
  url: string;
  /** Returns headers for this exact raw body — signing happens here, per attempt. */
  sign(rawBody: string, now: Date): Record<string, string>;
}

export interface OutboxSubscriberSource {
  readonly kind: OutboxSubscriberKind;                       // APP_INSTALLATION | CONNECTOR | PLATFORM
  targetsFor(eventName: string, payload: unknown, meta: { outboxEventId: string; occurredAt: Date }): Promise<DeliveryTarget[]>;
  /** Null ⇒ the subscriber no longer accepts deliveries: the row is CANCELLED, never sent. */
  prepareSend(subscriberId: string, topic: string): Promise<PreparedSend | null>;
  /** Called once when a row reaches DELIVERED, FAILED_EXHAUSTED or CANCELLED. */
  onFinal?(delivery: { subscriberId: string; topic: string; status: OutboxDeliveryStatus }): Promise<void>;
}

@Injectable()
export class OutboxSubscriberRegistry {
  private readonly sources = new Map<OutboxSubscriberKind, OutboxSubscriberSource>();
  register(source: OutboxSubscriberSource): void { this.sources.set(source.kind, source); }
  // targetsFor() unions every source; a source that throws fails the fan-out (so the outbox retries).
}
```

It sits beside `TaskSourceRegistry`, `StockIntakeRegistry` and the others in
`core/extension-points/`, registered in `extension-points.module.ts`, and it
is `@Global` like them. `app-installations` registers its source from
`onModuleInit()`. A deployment without that module registers nothing, and
the fan-out listener returns immediately (§ Scope lenses, *The absent
collaborator*).

**The app-installations source.**

- `targetsFor()`, for a domain event: finds the `ACTIVE` installations with
  an `AppInstallationTopic` whose `domainEventName` matches (`@@index([domainEventName])`)
  and projects the payload through that topic's pure `project()` from
  `APP_EVENT_TOPICS` (doc 185 §3).
- `targetsFor()`, for an `app_installation.*` event: targets that one
  installation with its lifecycle topic, whatever its topics — including
  an `UNINSTALLED` installation for `installation.deleted` (doc 191 §2).
- `prepareSend()`: decrypts `webhookSecretEncrypted` with `decryptSecret`
  under `APP_ENCRYPTION_KEY`. It returns null if the installation is not
  `ACTIVE`, except for the final `installation.deleted` notice.
- `onFinal()`: when the final notice ends, nulls the secret (doc 191 §2).

**The subscription cache.** Stated per `.claude/rules/performance.md`.
*Owner:* the source. *Key:* `domainEventName` → list of `(installationId,
topic)`. *Expiry:* 60 s. *Invalidation:* the source's own listener on
`app_installation.*` clears the whole map, and installs are rare. *Freshness
need:* a newly installed app may miss events for at most one dispatch cycle
before invalidation, which is acceptable; a suspended one never receives
deliveries it should not, because `prepareSend()` re-checks status at send.
*Auth isolation:* the cache is per tenant process by construction, since a
deployment is a tenant.

### 2.3 The model

```prisma
// apps/api/prisma/schema/core.prisma — additive, beside OutboxEvent

enum OutboxSubscriberKind { APP_INSTALLATION  CONNECTOR  PLATFORM }
enum OutboxDeliveryStatus { PENDING  PROCESSING  DELIVERED  FAILED_EXHAUSTED  CANCELLED  SUPERSEDED }

/// One external subscriber's copy of one OutboxEvent — the per-subscriber
/// state OutboxEvent's single status column cannot hold (§1).
model OutboxDelivery {
  id             String               @id @default(cuid())   // the X-Newax-Delivery idempotency key
  outboxEventId  String
  subscriberKind OutboxSubscriberKind
  /// AppInstallation.id | OutboundConnector.id | "platform" — a bare scalar:
  /// each kind's own table is in a module core may not reference.
  subscriberId   String
  topic          String
  body           Json                                        // the projected `data`, fixed at fan-out
  occurredAt     DateTime                                    // OutboxEvent.createdAt
  coalesceKey    String?
  status         OutboxDeliveryStatus @default(PENDING)
  attempts       Int                  @default(0)
  availableAt    DateTime             @default(now())
  claimedAt      DateTime?                                   // the lease (§2.5)
  lastStatusCode Int?
  lastError      String?                                     // ≤ 1,000 chars; never a body, never a secret
  deliveredAt    DateTime?
  createdAt      DateTime             @default(now())

  outboxEvent OutboxEvent @relation(fields: [outboxEventId], references: [id])

  @@unique([subscriberKind, subscriberId, outboxEventId])
  @@index([status, availableAt])
  @@index([subscriberKind, subscriberId, status, createdAt])
}
// Hand-written partial unique index for coalescing (§2.4):
//   CREATE UNIQUE INDEX "OutboxDelivery_coalesce_pending"
//     ON "OutboxDelivery" ("subscriberKind", "subscriberId", "coalesceKey")
//     WHERE "status" = 'PENDING' AND "coalesceKey" IS NOT NULL;
```

### 2.4 Storms: coalesce what is safe to coalesce, rate-cap the rest

A CSV import of 10,000 products publishes 10,000 `catalog.product_changed`
events, and a subscribed app would get 10,000 webhooks in a minute. Two
controls, each scoped to where it is correct:

- **Coalescing — only for topics declared coalescible** in `APP_EVENT_TOPICS`
  (`catalog.product_changed`, `catalog.product_price_changed`,
  `inventory.stock_replenished`, `inventory.low_stock`). These are "this
  entity changed — re-read it" notices, and their thin payload already tells
  the app to fetch current state. Their `coalesceKey` is
  `${topic}:${entityId}`. The fan-out inserts through `INSERT … ON CONFLICT`
  on `OutboxDelivery_coalesce_pending`, which **replaces** a still-`PENDING`
  row's `outboxEventId`/`body`/`occurredAt` with the newest. A row already
  `PROCESSING` or sent is untouched, and the new event gets its own row.
  Status-transition topics (`order.status_changed`, `fulfilment.*`) are
  **never** coalesced: `PROCESSING → SHIPPED → DELIVERED` collapsed to one
  notice would drop a fact the app may act on.
- **A rate cap per subscriber** — at most 600 sends per subscriber per
  minute per process (a constant, `OUTBOX_DELIVERY_MAX_PER_SUBSCRIBER_MINUTE`).
  Rows beyond it wait, `availableAt` pushed into the next window. They are
  never dropped.

### 2.5 Draining: lease, fairness, concurrency

`OutboxDeliveryDispatcher.drain()`, every second, with the same
"skip if still running" guard as `OutboxDispatcher`:

1. **Reclaim stale leases.** Rows `PROCESSING` with `claimedAt < now() − 5
   min` go back to `PENDING`. They are the rows a crashed or redeployed
   process was holding — the lease the main outbox lacks (WO-195.0 adds it
   there too).
2. **Claim fairly.** A CTE ranks due `PENDING` rows with `ROW_NUMBER() OVER
   (PARTITION BY "subscriberKind", "subscriberId" ORDER BY "availableAt")`
   and keeps at most 5 per subscriber and 100 in total. An outer `SELECT … WHERE
   id IN (…) FOR UPDATE SKIP LOCKED` locks them (Postgres refuses `FOR
   UPDATE` directly on a window query). Then they are set to `PROCESSING`,
   `claimedAt = now()`. One subscriber with 50,000 queued rows cannot starve
   another with 3. `SKIP LOCKED` keeps several API processes safe, as it
   already does for `OutboxEvent`.
3. **Send concurrently** — `Promise.allSettled` over the batch with a global
   cap of 20 in flight. It does not walk the batch one row at a time the way
   `processBatch()` does, so a 10-second timeout on one app cannot hold up
   the next.
4. **Per attempt**, through `CircuitBreakerService.execute(\`outbound.${kind}.${subscriberId}\`, …)`
   (`core/resilience/circuit-breaker.service.ts`, doc 38 §2). While a
   subscriber's circuit is `OPEN`, its claimed rows go back to `PENDING` with
   `availableAt` at the circuit's reopen time and **no attempt counted**:
   waiting out a known outage is not a failure. The circuits are in memory
   per process, doc 38's own stated trade, and bounded by the number of
   active subscribers (tens per tenant).

### 2.6 Outcomes, and the ceiling — time, not a count

| Response | Result |
|---|---|
| 2xx within 10 s | `DELIVERED`, `deliveredAt` |
| 410 Gone | `CANCELLED` — the app says the endpoint is retired; an action-hub item for `apps.manage` holders, never a silent stop |
| 429 | Retry at the `Retry-After` it gave (capped at 1 h), counted as an attempt |
| Any other 4xx, 5xx, a timeout, a TLS or network error, a 3xx (redirects are **never** followed, §4) | Retry: `availableAt = now + Math.min(2 ** attempts * 1000, 300_000)` — `OutboxDispatcher`'s formula, unchanged |

**The ceiling is 72 hours from `occurredAt`, not 8 attempts.** The in-process
`MAX_ATTEMPTS = 8` (about 8.5 minutes) suits a subscriber in the same
process, whose failure is a bug. For an external subscriber, being down for
hours is ordinary: a deploy, an outage, a certificate expiring over a
weekend. With 8 attempts, one afternoon of an app's downtime would silently
lose every event. So external rows keep retrying at the capped 5-minute
cadence until `occurredAt + 72 h`, then become `FAILED_EXHAUSTED`,
replayable for 30 days (§6). **This corrects doc 36**, which applied the
in-process `MAX_ATTEMPTS` ceiling to connectors, contradicting its own "Four
hours down" lens ("queues deliveries … and drains on recovery"). One retry
policy per class of subscriber: in-process, and external.

**No auto-suspension of the app.** The first `FAILED_EXHAUSTED` row for an
installation raises one action-hub item for `apps.manage` holders ("*App*
has not accepted events for 3 days"), deduplicated per installation. The
circuit keeps protecting the dispatcher. Suspending or uninstalling is the
admin's decision, not a timer's.

## 3. On the wire

`POST <webhookUrl>`, body = the envelope (doc 185 §3), serialized **once**
at send. Headers:

```
Content-Type: application/json
User-Agent: NEWAX-Webhooks/1                       (NEWAX's own attribution — Law 1's one exception)
X-Newax-Delivery: <OutboxDelivery.id>              the idempotency key; stable across retries and replays
X-Newax-Topic: order.status_changed
X-Newax-Signature: t=1759054443,v1=<hex HMAC-SHA256(secret, "1759054443." + rawBody)>
```

The signature is the construction `NidVerificationProvider`'s
`verifySignature()` already checks **inbound** — HMAC-SHA256 over
`${timestamp}.${rawBody}`, hex, compared with `timingSafeEqual`
(`modules/identity-verification/providers/nid.provider.ts:166–175`) —
applied outbound. `t` is the send time of **this attempt**, so a retry is
freshly signed and a receiver's 5-minute freshness window rejects captured
replays. During a webhook-secret rotation (doc 189 §2.3), both the old and
the new secret sign for 24 hours: `v1=<old>,v1=<new>`, the convention Stripe
uses, so an app that has not yet switched keeps verifying.

A pure `signWebhook(secret, rawBody, t)` / `verifyWebhook(secret, rawBody,
header, now, toleranceSec)` pair lives in `packages/shared/src/webhook-signature.ts`.
The dispatcher signs with it; the conformance probe (doc 186 §3.2) forges
bad signatures against it; the developer contract (`/ui/developers`, doc
186 WO-186.9) publishes it as the reference implementation.

**What an app must do, as the directory policy states it (doc 186 §4):**
verify the signature and the 5-minute freshness; deduplicate on
`X-Newax-Delivery`; answer 2xx within 10 seconds and process afterwards;
never assume order — use `occurredAt`, and re-read current state through
the API.

## 4. Egress safety — NEWAX's servers must never be pointed inward

A webhook URL is an address a third party chose and NEWAX's server calls.
Review checks it once (doc 186 §3.1). DNS can change after review, so the
check that counts is **at send time**:

- The request is made with `node:https.request` and a custom `lookup` that
  resolves the host and **refuses** loopback, RFC 1918, carrier-grade NAT,
  link-local (including cloud metadata at `169.254.169.254`), IPv6 ULA and
  link-local, and unspecified addresses. The connection uses the address
  that passed the check, so a DNS answer that flips between check and
  connect cannot rebind to an internal host. It needs no new dependency.
- **HTTPS only**; certificate verification is never disabled.
- **Redirects are not followed.** A 3xx is a failed attempt, since a
  redirect is the classic way to steer a vetted URL somewhere internal.
- The response body is read to at most 64 KB and discarded. Only the status
  code and at most 1,000 characters of error text are stored.
- The URL comes only from the installation's consented manifest (doc 187
  §1). No route lets an API key, or the app itself, change it. Repointing
  where a signed request goes is "exfiltration by another name"
  (`.claude/rules/security.md`), which is why a URL change is a reviewed
  version (doc 185 §5).

## 5. Three subscriber kinds, one engine

| Kind | Registered by | `targetsFor` | `prepareSend` | Auth on the wire |
|---|---|---|---|---|
| `APP_INSTALLATION` | `app-installations` | §2.2 | the installation's webhook URL + HMAC | `X-Newax-Signature` |
| `PLATFORM` | `app-installations` | `app_installation.*` events only → subscriber `"platform"` | `MARKETPLACE_API_URL` + `/app-directory/v1/installations/:ref/lifecycle` | `X-Marketplace-Api-Key` — the tenant's existing directory credential (doc 185 §6), never a new one |
| `CONNECTOR` | the `connectors` module (docs 36/172), when built | the connector's `subscribedEvents`, `payloadTemplate` rendered at fan-out | `targetUrl` + `ConnectorAuthMethod` (API key header, basic, OAuth2 via `OAuth2TokenProvider`) | per connector |

**Doc 36's `ConnectorDelivery` is not built separately.** A connector's
deliveries are `OutboxDelivery` rows of kind `CONNECTOR`, and WO-36.2's
"delivery worker" is this dispatcher. Doc 36's own acceptance still holds
unchanged: one row per redelivered event, and exhausted retries on a
dead-letter screen with replay. Doc 36 gets a pointer note (doc 184 §7).

**`TradingPartnersService.pushOutbound()` should move here too**, as a
`TRADING_PARTNER` kind, and doc 18 §18.3's claim would then become true. It
is named as follow-on work (WO-188.10), not done in this program: it
changes a shipped module's delivery semantics and deserves its own review.

The platform receives lifecycle notices as an ordinary subscriber, so an
unreachable platform never blocks an uninstall. The notice waits in
`OutboxDelivery` for up to 72 hours and then sits in the dead-letter list,
replayable (doc 191 §5 has the reconciliation that catches even that).

## 6. What the operator sees and does

The installation screen (`/admin/apps/[installationId]`, doc 187 §7) gains
a **Deliveries** section:

- **Health**: delivered/failed in the last 24 hours and the oldest pending
  age. Each number drills into the `OutboxDelivery` rows it counts
  (`subscriberKind = APP_INSTALLATION, subscriberId = <id>`, filtered by
  status and window).
- **Failed deliveries**: `FAILED_EXHAUSTED` rows, newest first, 25 per page,
  showing topic, `occurredAt`, attempts and the last status code.
- **Replay**: `POST /admin/apps/:id/deliveries/:deliveryId/replay` and
  `…/deliveries/replay-failed?from=&to=` — `@RequirePermission('apps.manage')`,
  `@SessionOnly()`. A replay resets the row to `PENDING` with `attempts = 0`
  and a fresh 72-hour window from now. **Replay is safe by construction**:
  the row keeps its `id`, so an app that did process it the first time
  deduplicates on `X-Newax-Delivery`.

`OutboxDeliveryService.listFor(kind, subscriberId, filter)` and
`.replay(id)` are core and shared by this screen, doc 36's connector
dead-letter screen, and doc 193.

**Retention.** `OutboxDeliveryRetentionCron`, nightly, deletes
`DELIVERED`/`CANCELLED`/`SUPERSEDED` rows older than 7 days and
`FAILED_EXHAUSTED` rows older than 30 days, in batches of 5,000. This is
runtime retention of a delivery log that holds only ids (§ *Erasure*), the
same kind of pruning doc 36's own hundred-thousandth-row lens calls for.

**Readiness is not affected.** `GET /health/ready` counts `OutboxEvent`
backlog. An app being down must never make NEWAX report itself unready, so
`OutboxDelivery` is not counted there. It is reported through doc 38's
degradation matrix instead (doc 194).

## Scope lenses

Installation-level lenses are doc 187's; revocation and isolation are doc
191's. Lines below answer what this delivery engine introduces.

**The five shop-scale lenses.** *Start to finish* — fact → outbox → fan-out
→ delivery → signed POST → app 2xx → `DELIVERED`, or retries → exhausted →
replay. *The other side* — the Deliveries section and replay (§6). *After
"done"* — retries, the dead-letter list, 72-hour exhaustion, replay,
retention. *Real integration* — real signed HTTPS with SSRF-safe egress.
*Policy* — the retry class ceilings and the coalescible-topic list, both
code, changed only by review.
**The actor with three tables / The principal with no permission key** — n/a:
no new actor; the delivery authenticates NEWAX to the app with the
installation's HMAC secret, and the receiving app holds no NEWAX
permission through it.
**The grant that ends itself** — a subscriber stops receiving the moment its
source's `prepareSend()` returns null: suspended, uninstalled, or a deleted
connector. The row is then `CANCELLED` and never sent. That check runs at
send, not only at fan-out.
**Whose rows, and which columns** — a delivery carries only its topic's
projection: identifiers and transitions, never the record (doc 185 §3).
Delivery rows are listed only per installation to `apps.manage` holders;
`lastError` never holds a body or a secret.
**The threshold nobody approves alone / The toxic pair** — n/a: delivering
an event the installation was already consented to receive is no new
authority; the threshold was applied at consent (doc 187 §4.2).
**Authority and blast radius** — who may change where deliveries go: nobody
at runtime (§4). The worst value in this engine is a coalescible-topic
declaration on a status topic, which would drop transitions. It is a code
change to `APP_EVENT_TOPICS` under review, with a spec asserting no
`*.status_changed` topic is coalescible.
**Audience is a capability, not an address** — exhausted deliveries and 410s
raise **one** action-hub item per installation for holders of `apps.manage`,
deduplicated, never one per failed row. At zero holders the item still
exists and is shown to anyone later granted the key. The app's own address
is the manifest's webhook URL, an address by the nature of a webhook (doc
36's own reasoning). Which events reach it is a consented capability.
**Request or record — classify every write** — from the app's side a delivery
is a REQUEST it may refuse (4xx/5xx). From NEWAX's side the event is a
RECORD that already happened, and a failed delivery never un-happens it.
The `OutboxDelivery` row is the record of NEWAX's attempts, never refused
itself.
**The movement with no address** — n/a: no stock or cash write.
**Four hours down, the counter stays open** — the app down: rows queue,
retry at ≤ 5-minute cadence, and drain on recovery within the 72-hour
window, with nothing lost. The tenant's own outbox is unaffected, because
no network call runs inside it. NEWAX's API down: nothing is sent, the
events wait in `OutboxEvent`, and fan-out and delivery resume on boot, with
the lease reclaiming anything stranded.
**The unwritten posting rule / Every column or none / The period that
already moved / The second legal entity** — n/a: the engine posts nothing
and relays only events whose own documents answer these.
**Dry run before live** — `APP_EVENT_TOPICS`' `project()` functions and
`signWebhook()` are pure. The conformance probe (doc 186 §3.2) is the live
dry run against an app's real endpoint.
**Click the number** — every figure in §6's Health drills into exactly the
`OutboxDelivery` rows it counts, and the drill-down's row count equals the
tile.
**Three silhouettes** — *Solo*: a couple of apps and hundreds of deliveries a
day. *Chain*: the brand node's apps receive events for branch facts
replicated up, as local events of that node. *Organization*: per node,
identical. No tier column is involved, because delivery is per node.
**The absent collaborator** — no source registered (`app-installations` and
`connectors` both off): `targetsFor()` returns `[]`, the fan-out listener
writes nothing, the delivery dispatcher finds no rows, and the outbox
behaves exactly as today. `CircuitBreakerService` is core and always
present. Nothing fails at boot.
**The second copy of the write** — (1) the outbox redelivers an event:
`@@unique([subscriberKind, subscriberId, outboxEventId])` makes the second
fan-out a no-op. (2) A send succeeds but the process dies before marking
`DELIVERED`: the lease reclaims the row and it is sent again **with the same
`X-Newax-Delivery`**, which the app deduplicates. At-least-once toward the
app, exactly once per id in our table.
**The hundred-thousandth row** — rows = events × subscribed installations.
An Organization node with 20 apps each on 3 topics over 50,000 events a day
writes at most about 3 million rows a day, pruned to 7 days: about 21
million rows at steady state, well within one indexed table. The claim
reads `@@index([status, availableAt])`; the per-installation screens read
`@@index([subscriberKind, subscriberId, status, createdAt])`; coalescing
bounds a bulk import to one pending row per entity per app.
**The busiest minute, and the lock you hold through it** *(catalogue)* — the
fan-out runs inside the outbox's own delivery, writing ≤ N rows with no
lock beyond their insert, and no HTTP. The delivery claim holds row locks
only between claim and the `PROCESSING` update, never across a network call.
**Delivery is a fact, not a hope** *(catalogue)* — one query answers it:
`OutboxDelivery` by `(subscriberKind, subscriberId, outboxEventId)` →
status, attempts, `lastStatusCode`, `deliveredAt`.
**The adoption test** — n/a: `OutboxDelivery.id` is a cuid, node-local, never
replicated.
**The reversal document, not the reversal flag** — n/a: a delivery is not
reversed. A later reversal of the underlying fact (an order cancelled) is
its own event and its own delivery, never a mutation of the original row.
**The undo fan-out** — cancelling a subscriber cancels its pending rows
(automatic, `prepareSend() → null`). Rows already delivered cannot be
recalled (deliberately irreversible — the app has them).
**The version stamp** — `OutboxDelivery.body` is fixed at fan-out and never
re-read. A later change to a topic's projection does not rewrite or resend
past rows, and `schemaVersion` in the envelope names the contract each was
built under.
**The erasure the ledger cannot obey** — `OutboxDelivery.body` holds
identifiers only, by the projection's construction, so there is no personal
free text. It is kept at most 30 days and pruned. Ruling 1's `OutboxEvent.payload`
disposition is unchanged by this document. What the app received is outside
this database (doc 191 §6).
**The failure path, and who is allowed to walk it** — durable store:
`OutboxDelivery` with `FAILED_EXHAUSTED`, `lastStatusCode`, `lastError`.
Screen: the installation's Deliveries section. Permission: `apps.manage`.
Action: replay one, or all in a range. What makes a second replay safe: the
unchanged delivery id the app deduplicates on.

## Work orders

**WO-188.1 — schema**: `OutboxSubscriberKind`, `OutboxDeliveryStatus`,
`OutboxDelivery` (`core.prisma`) and the hand-written coalesce index;
forward-only migration.
**WO-188.2 — outbox metadata**: `EventBusService.dispatch(name, payload,
meta?)`; `OutboxDispatcher.claim()` selects `createdAt`; `deliver()` passes
`{ outboxEventId, occurredAt }`. A spec proves every existing
`@OnDomainEvent` handler is unaffected.
**WO-188.3 — `OutboxSubscriberRegistry`** in `core/extension-points/`,
registered in `extension-points.module.ts`.
**WO-188.4 — `OutboxFanOutListener`** (`onAny`), including the coalescing
insert path.
**WO-188.5 — `OutboxDeliveryDispatcher`**: lease reclaim, fair claim,
concurrent send, SSRF-safe `https.request` with checked `lookup`, no
redirects, 10 s timeout, 64 KB read cap, per-subscriber circuit, the outcome
table, the 72-hour ceiling, the per-subscriber rate cap.
**WO-188.6 — `packages/shared/src/webhook-signature.ts`**: `signWebhook`/
`verifyWebhook` (pure), spec'd against known vectors and rotation (two `v1`).
**WO-188.7 — the app-installations source** and the **platform source**,
with the subscription cache and its invalidation, and `onFinal()` nulling the
secret after the final notice.
**WO-188.8 — `OutboxDeliveryService`** (list, replay, replay-range) and
`OutboxDeliveryRetentionCron`.
**WO-188.9 — the Deliveries section** on the installation screen and the
action-hub item; en/ur.
**WO-188.10 — follow-on, not in this program**: move
`TradingPartnersService.pushOutbound()` onto this engine as a
`TRADING_PARTNER` kind, and correct doc 18 §18.3.

## Acceptance

- With one subscribed app's endpoint returning 500 for an hour, every other
  app on the same node, and every in-process `@OnDomainEvent` listener,
  receives every event on time. When the endpoint recovers, the failing app
  receives every queued event, each once per `X-Newax-Delivery`.
- A 30-second hang at one app delays no other subscriber's delivery by more
  than one dispatch cycle.
- An event redelivered by the outbox produces no second `OutboxDelivery`
  row.
- A webhook URL resolving to `127.0.0.1`, `10.0.0.5`, `169.254.169.254` or
  `fd00::1`, or answering with a 302, is never followed or sent to. The row
  records the refusal.
- 10,000 `catalog.product_changed` events for 10,000 distinct products
  produce 10,000 rows; 10,000 events for **one** product produce at most two
  (one in flight, one pending).
- No `order.status_changed` delivery is ever coalesced.
- A row whose installation is suspended is never sent; on reinstatement,
  held rows resume.
- A replayed delivery carries the same `X-Newax-Delivery` as the original.
- With no source registered, the outbox's behaviour and timing are unchanged
  (`outbox.dispatcher` specs pass untouched).

## Out of scope

Ordered delivery per entity — not guaranteed, and stated (§3). Apps
re-read state; strict ordering would need per-entity serialisation that
reintroduces the head-of-line blocking §1 removes. Fat payloads carrying
records — refused (doc 185 §3). Webhook delivery **between tenants** — no
such flow exists, and doc 39's isolation forbids one. A platform-side outbox
for `apps/platform` itself (ADR-059 still stands: the platform has no outbox;
its feed is pulled, doc 191 §3).
