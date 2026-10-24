# 36 — Universal connectivity: one framework for connecting to any external system

> **Note (2026-09-28, ADR-073).** Still unbuilt, and still the tenant's private
> escape hatch beside the third-party app directory of docs 184–195 (see
> [doc 193](./193-app-private-connection-escape-hatch.md)). Two things below
> are realised differently when built:
> - **WO-36.2's delivery worker and `ConnectorDelivery`** become
>   [doc 188](./188-app-runtime-event-delivery-to-apps.md)'s core
>   `OutboxDelivery` engine, as rows of kind `CONNECTOR`. That is one external
>   delivery mechanism for connectors and apps alike, which is this
>   document's own intent ("the existing one pointed at an external HTTP
>   target").
> - **§1's retry ceiling** for external targets is a 72-hour window, not the
>   in-process `MAX_ATTEMPTS = 8`: eight attempts give up after about 8.5
>   minutes of target downtime, contradicting this document's own "Four hours
>   down" lens.
>
> The Out of scope item "a connector marketplace/catalogue of pre-built
> integrations" is docs 184–195. The permission name is `connectors.manage`,
> per doc 170 §2, not `integrations.manage`.

"Connect to any system in the world" is not a feature to build — it is a
**shape every integration in this repository already follows**, made
explicit so the next one is a class, not a design meeting. This document
does not introduce a new subsystem; it names the pattern that
`PaymentProvider`, `StorageDriver`, `AiProvider`, `NotificationChannel`
(doc 33), `FiscalComplianceProvider` (doc 15), `EdiTranslator` (doc 18) and
`VectorStore` (doc 35) already independently arrived at, states why it is
correct, and fills the two real gaps it exposes: **arbitrary outbound HTTP
to a system nobody has written a typed client for yet**, and **OAuth2 for
the systems that require it instead of a static key**.

## The pattern, named once so it stops being reinvented per module

Every external system this repository has ever integrated with fits one of
three shapes, and every existing integration already picked the right one:

| Shape | When | Existing examples |
|---|---|---|
| **Typed provider interface** | The integration has a small, stable contract this codebase calls repeatedly (charge a card, store a file, embed text, send a message) | `PaymentProvider`, `StorageDriver`, `AiProvider`, `NotificationChannel`, `VectorStore` |
| **Inbound authenticated endpoint** | An external system pushes data or events *to* us | `TradingPartner`/`Node` key-hash inbound (doc 18, replication), `ApiClient` (doc 34) |
| **Generic outbound connector** | We push data or events *to* an arbitrary external system with no typed contract worth writing yet | Nothing today — this document's gap |

The rule this table encodes: **write a typed interface once a real,
repeated need exists; use the generic connector for everything else.**
Building a bespoke `SalesforceProvider`/`SapProvider`/`ShopifyProvider`
interface for a system used once is the exact speculative-infrastructure
`CLAUDE.md` already warns against — the generic connector below exists so
"we need to push order data to whatever system this client already runs"
never blocks on writing a new typed interface first.

## 1. The generic outbound connector: HTTP, templated, retried, never bespoke code per target

```prisma
// new: connectors.prisma

model OutboundConnector {
  id             String  @id @default(cuid())
  organizationId String
  label          String  /// "Client's own SAP instance", "Zapier webhook"
  targetUrl      String
  authMethod     ConnectorAuthMethod
  /// Encrypted at rest, same discipline as TradingPartner.outboundApiKey —
  /// never logged, never returned by a read endpoint.
  credentialsEncrypted Bytes?
  /// Which domain events this connector subscribes to — a subset of the
  /// existing DomainEvent catalogue, never a new event system.
  subscribedEvents String[]
  /// A Handlebars-style template mapping our canonical event payload onto
  /// whatever shape the target expects — the same "canonical payload, a
  /// translator sits in front of it" reasoning doc 18's EDI adapter uses.
  payloadTemplate String
  status         ConnectorStatus @default(ACTIVE)
  createdByUserId String
  createdAt      DateTime @default(now())

  deliveries ConnectorDelivery[]

  @@index([organizationId, status])
}

enum ConnectorAuthMethod { NONE API_KEY_HEADER BASIC OAUTH2_CLIENT_CREDENTIALS }

enum ConnectorStatus { ACTIVE SUSPENDED }

/// One row per delivery attempt for one event — the same shape the
/// existing OutboxDispatcher already uses for internal event delivery,
/// generalized to an external HTTP target instead of an internal subscriber.
model ConnectorDelivery {
  id           String   @id @default(cuid())
  connectorId  String
  domainEventId String  /// the OutboxEvent row this delivery is for
  attempt      Int      @default(1)
  status       DeliveryStatus @default(PENDING)
  responseCode Int?
  failureReason String?
  deliveredAt  DateTime?
  availableAt  DateTime @default(now())

  connector OutboundConnector @relation(fields: [connectorId], references: [id])

  @@unique([connectorId, domainEventId])
  @@index([status, availableAt])
}

enum DeliveryStatus { PENDING DELIVERED FAILED_RETRYING FAILED_EXHAUSTED }
```

`ConnectorDelivery` is deliberately the **same table shape** the existing
`OutboxEvent`/`OutboxDispatcher` already use internally — this is not a
second delivery mechanism, it is the existing one pointed at an external
HTTP target instead of an internal NestJS subscriber. The dispatcher reads
`ConnectorDelivery` rows exactly the way it reads internal subscriber
failures, applies the same exponential backoff
(`Math.min(2 ** attempt * 1000, 300_000)`, already implemented in
`outbox.dispatcher.ts`), and marks `FAILED_EXHAUSTED` at the same
`MAX_ATTEMPTS` ceiling — one retry policy, not one per integration.

## 2. OAuth2 client-credentials, because a static key is not always an option

Some real-world targets (a client's own ERP, a government or bank system)
require OAuth2 rather than a static header key. This is the one genuinely
new piece of infrastructure this document adds:

```ts
export interface OAuth2TokenProvider {
  getAccessToken(connector: OutboundConnector): Promise<{ token: string; expiresAt: Date }>;
}
```

Tokens are cached until `expiresAt` and refreshed lazily on the next
delivery attempt that finds them expired — never refreshed on a fixed
timer independent of actual use, which would waste calls against a target's
own rate limit for connectors that rarely fire.

## 3. Inbound stays doc 34's territory; this document is the outbound mirror

Doc 34 (`ApiClient`) already covers **a third party authenticating to us**.
This document covers **us authenticating to a third party**. The two never
merge into one model — an inbound `ApiClient` and an outbound
`OutboundConnector` have opposite trust directions and opposite failure
modes (we control our own rate limiting for the former; we are subject to
someone else's rate limiting for the latter), and conflating them the way
`serials` and `lots` were deliberately *not* conflated in `MULTI-SECTOR.md`
would produce a model with two disjoint halves.

## Scope lenses

**The actor with three tables** — n/a: `OutboundConnector` is
configuration, not a counterparty; the external system it calls never
authenticates *to* us through this document (that is doc 34, if the target
also needs to call back).
**The principal with no permission key** — n/a.
**The grant that ends itself** — `ConnectorStatus = SUSPENDED` stops
delivery attempts immediately, the same guarantee every other suspend flag
in this repository already gives; a rotated OAuth2 credential invalidates
cached tokens on next use, never trusted stale.
**Whose rows, and which columns** — `credentialsEncrypted` is never
returned by any read endpoint, and decrypted only inside the delivery
worker's process, never surfaced to an admin screen; connectors are scoped
per `organizationId`, invisible cross-tenant.
**The threshold nobody approves alone** — a connector subscribed to a
money- or stock-writing event (an `OrderPlaced`, a `PaymentReceived`) needs
a second approver at creation, mirroring doc 34's own scope-threshold —
sending sale data to an uncontrolled external endpoint is exactly the kind
of blast-radius event that threshold exists for.
**The toxic pair** — n/a: no self-approval path exists for connector
creation.
**Authority and blast radius** — who may create a connector (org admin)
versus who approves a money-event subscription (the threshold above); the
worst value is a connector pointed at the wrong `targetUrl` leaking order
data to an unintended endpoint — caught by requiring a test delivery
(dry run, below) before a connector goes `ACTIVE`.
**Audience is a capability, not an address** — n/a: `targetUrl` is
inherently an address by the nature of this document (an outbound HTTP
call has to go somewhere); what stays a capability is *which events* reach
it — `subscribedEvents` is a permission-gated allowlist, never "everything."
**Request or record** — a delivery attempt is a REQUEST from the target's
point of view (they may refuse it — 4xx, 5xx, timeout); from this
platform's point of view the underlying domain event already happened and
is a RECORD — a failed delivery never un-happens the event, it only means
the external system hasn't heard about it yet, tracked by
`ConnectorDelivery.status` exactly as replication tracks an unsynced FACT.
**The movement with no address** — n/a: no stock or cash movement.
**Four hours down, the counter stays open** — a target system being
unreachable queues deliveries in `ConnectorDelivery` at `FAILED_RETRYING`
and drains on recovery; the domain event itself was already durably
recorded by the existing outbox before this document's delivery layer ever
saw it, so a connector outage can delay an external system's knowledge of
a fact, never lose the fact itself.
**Click the number** — a connector's delivery-success-rate tile links to
its exact `ConnectorDelivery` rows, filterable by status.
**The unwritten posting rule / Every column or none / The period that
already moved** — n/a: posts no `JournalLine`; whatever event a connector
relays already posted (or didn't) through its own module's existing rule.
**The second legal entity** — connectors scoped per `organizationId`; a
second legal entity's integrations are entirely separate rows, never a
shared connector silently relaying both.
**Dry run before live** — a connector cannot move to `ACTIVE` without a
successful test delivery against a sample payload, shown to the admin
before real events start flowing — the same "preview before it's live"
discipline every pure-function lens in this repository already requires,
applied to an external side effect instead of a computed value.
**Three silhouettes** — Solo: no connectors, or one simple webhook to a
spreadsheet-import tool. Chain: a handful of connectors per brand (a
regional accounting system, a marketing platform). Organization: many
connectors across brands, delivery volume matters (next lens), OAuth2
token caching under real concurrent load.
**The absent collaborator** — with this module off (or simply unused, zero
`OutboundConnector` rows), the platform behaves exactly as it does today —
this is purely additive to the existing outbox, never a required dependency
of it.
**The second copy of the write** — `@@unique([connectorId,
domainEventId])` makes a redelivered internal domain event resolve to the
same `ConnectorDelivery` row (retried, not duplicated) — an external
target that itself doesn't dedupe on its side is the external target's own
responsibility, documented on the connector's setup screen as "your
endpoint should be idempotent on our event id."
**The hundred-thousandth row** — delivery volume scales with subscribed-
event volume × connector count; bounded by `[status, availableAt]` for the
dispatcher's own polling query, and `FAILED_EXHAUSTED`/`DELIVERED` rows age
out under a retention window once their investigation value has passed.
**The reversal document** — n/a: an external delivery is not itself
reversed; if the underlying domain event represents something reversed
(an order cancelled), that reversal is its own new domain event, relayed
as a new delivery, never a mutation of the original delivery row.
**The undo fan-out** — suspending a connector does not recall deliveries
already sent (deliberately irreversible — the external system already has
that data) and does stop all future ones (automatic).
**The version stamp** — a `ConnectorDelivery`'s `payloadTemplate` result is
computed and sent at delivery time; a later template edit does not
retroactively resend or reinterpret past deliveries.
**The erasure the ledger cannot obey** — `credentialsEncrypted` is deleted
(not merely revoked) when a connector is deleted; `ConnectorDelivery`
history survives under the same audit basis as any other outbound record,
holding no personal data of its own beyond whatever the relayed event
payload already carried, which inherits that event's own erasure rule.
**The failure path** — `FAILED_EXHAUSTED` (retries exhausted) surfaces on
an admin dead-letter screen with a manual replay action, exactly the
pattern this repository's own replication quarantine and doc 22's
reconcile queue already establish for "a write attempt that needs a human,"
generalized here to an external HTTP failure instead of an internal one.

## Work orders

**WO-36.1 — schema**: `OutboundConnector`, `ConnectorDelivery`.
**WO-36.2 — delivery worker**: reads pending `ConnectorDelivery` rows,
applies the existing `outbox.dispatcher.ts` backoff formula unchanged,
marks `DELIVERED`/`FAILED_RETRYING`/`FAILED_EXHAUSTED`.
**WO-36.3 — `OAuth2TokenProvider`** + client-credentials implementation,
token caching keyed by connector.
**WO-36.4 — payload templating**: safe (no arbitrary code execution)
template evaluation from the canonical event payload to the target's
expected shape.
**WO-36.5 — permissions**: `integrations.manage` (create/suspend),
`integrations.approve_event_scope` (the money/stock-event threshold).
**WO-36.6 — UI**: connector list with delivery success rate, create flow
with test-delivery gate before activation, dead-letter screen with replay.

## Acceptance

- A connector cannot reach `ACTIVE` without a successful test delivery.
- A redelivered internal domain event produces one `ConnectorDelivery` row,
  retried in place, never duplicated.
- An OAuth2 token is reused until it actually expires, never refreshed on
  every delivery.
- Exhausting retries surfaces the failure on the dead-letter screen with a
  working manual replay.
- With zero `OutboundConnector` rows configured, the existing outbox and
  every other module behaves identically to today.

## Out of scope

A visual workflow/automation builder (Zapier-style branching logic,
conditional steps) — this document is a delivery mechanism, not an
automation engine; `docs/implementation/README.md`'s own named gap, "a
generic automations rules engine," is the right home for that if it is ever
scoped. Two-way sync (pulling data *from* an arbitrary external system on a
schedule) — this document is outbound-event-driven only; a polling pull
connector is a different failure-mode shape and a separate, named future
document. A connector marketplace/catalogue of pre-built integrations —
named as a natural future layer on top of this framework, not part of it.
