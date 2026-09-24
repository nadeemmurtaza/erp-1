# 132 — A generic inbound webhook receiver: the symmetrical mirror doc 36 named but didn't build

Doc 36's own table named three integration shapes: a typed provider
interface, an inbound authenticated endpoint (doc 34's `ApiClient` — for
a *known* third party with a *known* contract), and the generic
*outbound* connector it went on to build. It left one cell of its own
table empty: a generic **inbound** receiver, for a third party whose
webhook this repository did not design and does not control the shape
of — a payment gateway's own callback format, a shipping carrier's own
tracking-update webhook, before a typed adapter for that specific vendor
is worth writing. This document fills that cell.

## 1. A registered inbound endpoint, mapped by template onto a domain event — the mirror of `OutboundConnector`

```prisma
model InboundWebhookEndpoint {
  id             String   @id @default(cuid())
  organizationId String
  label          String   // "Leopards Courier tracking updates"
  /// The URL path this repository exposes for the third party to call —
  /// generated, unguessable, unique per registration.
  slug           String   @unique
  /// Verifies the inbound request is genuinely from the expected sender
  /// — the same signature-verification discipline
  /// callback-verification.spec.ts already establishes for payment
  /// callbacks, generalized here.
  verificationMethod InboundVerificationMethod  // HMAC_HEADER | SHARED_SECRET_QUERY | NONE
  verificationSecretEncrypted Bytes?
  /// Maps the third party's own arbitrary payload shape onto ONE of
  /// this repository's existing domain events — never a new event type
  /// invented per webhook, the same canonical-shape discipline doc 18's
  /// EdiTranslator and doc 36's payloadTemplate already establish.
  targetDomainEvent String
  payloadTemplate   String
  status            InboundWebhookStatus @default(ACTIVE)

  deliveries InboundWebhookDelivery[]

  @@index([organizationId, status])
}

enum InboundVerificationMethod { HMAC_HEADER  SHARED_SECRET_QUERY  NONE }
enum InboundWebhookStatus { ACTIVE  SUSPENDED }

/// One row per received call — the inbound mirror of ConnectorDelivery,
/// recording what arrived and what it was translated into, for audit and
/// replay.
model InboundWebhookDelivery {
  id           String   @id @default(cuid())
  endpointId   String
  rawPayload   Json
  translatedEventPayload Json?
  status       InboundDeliveryStatus @default(RECEIVED)
  receivedAt   DateTime @default(now())

  endpoint InboundWebhookEndpoint @relation(fields: [endpointId], references: [id])

  @@index([endpointId, receivedAt])
}

enum InboundDeliveryStatus { RECEIVED  TRANSLATED  REJECTED }
```

`InboundVerificationMethod = NONE` exists and is a legitimate, explicit
choice for a third party with no signature scheme of its own — but it is
never the default, and the registration UI must make an admin
consciously choose it, per this repository's own "never silently trust a
caller" standing rule.

## Scope lenses

**The actor with three tables** — the calling third party is a fourth
counterparty shape, same reasoning as doc 22's biometric device and doc
34's `ApiClient`: identified by its own verification secret, never a
`User`.
**The principal with no permission key** — the third party authenticates
by the registered `verificationMethod`, never by `PermissionsGuard`'s own
user-facing permission model — the identical boundary doc 30's own
webhook-signature verification already establishes.
**The grant that ends itself** — `InboundWebhookStatus = SUSPENDED` stops
accepting deliveries immediately (returning a rejection, never silently
dropping — see "The failure path" below); a rotated verification secret
invalidates all subsequent unsigned/mis-signed calls.
**Whose rows, and which columns** — `InboundWebhookEndpoint`/`Delivery`
are `organizationId`-scoped; who may register a new endpoint is gated by
`settings.webhooks.manage`.
**The threshold nobody approves alone / The toxic pair** — n/a directly,
though the *resulting* domain event (once translated) is subject to
whatever threshold its own target subscriber already enforces — this
mechanism does not bypass any existing check, it only originates the
event.
**Authority and blast radius** — registering a new inbound endpoint that
maps to a sensitive domain event (e.g., something that could trigger a
refund) is itself a real trust decision, gated and audited old/new value
exactly like `OutboundConnector`'s own registration.
**Audience is a capability, not an address** — n/a: this is an inbound
receiver, not an outbound notification.
**Request or record** — a webhook delivery is classified by whatever its
`targetDomainEvent` already classifies it as (e.g., `PaymentSucceeded` is
already a RECORD per its own originating document) — this mechanism adds
no new classification, only a new origination path for an existing one.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity** — n/a directly; inherited from whatever `targetDomainEvent`'s own
document already answers.
**Dry run before live** — a "test delivery" mode (send a sample payload
through `payloadTemplate` without publishing the resulting domain event)
lets an admin verify the mapping before going live — the identical
"preview before commit" discipline this repository applies everywhere a
computed rule exists.
**Three silhouettes** — Solo: rarely needed. Chain/Organization: the real
case — a specific carrier or gateway's own webhook needs mapping before a
typed adapter is worth writing, per doc 36's own "write a typed interface
once a real, repeated need exists" rule, mirrored for inbound.
**The absent collaborator** — an unregistered slug returns 404, never a
silent 200 that misleads the third party into thinking delivery
succeeded.
**The second copy of the write** — a retried inbound call (the third
party's own retry behavior) is deduplicated by whatever key
`payloadTemplate`'s own translation maps onto the target domain event's
existing idempotency key (per doc 117's own "key off a real business
invariant, never a generic event-ID ledger" discipline) — this mechanism
introduces no new deduplication concept, it reuses the target event's own.
**The hundred-thousandth row** — `InboundWebhookDelivery` is indexed by
`[endpointId, receivedAt]`, retained per this repository's own audit-
retention policy, bounded by real inbound call volume.
**The reversal document / The undo fan-out / The version stamp** — n/a
beyond whatever the target domain event's own document already answers.
**The erasure the ledger cannot obey** — `rawPayload`/
`translatedEventPayload` may contain a third party's own data about a
real person (a shipment recipient); retained per this repository's
existing audit-log retention basis, named honestly rather than assumed
exempt.
**The failure path** — a failed signature verification returns a 401,
logged as `REJECTED`, never silently accepted; a `payloadTemplate` that
fails to translate a given raw payload is logged as `RECEIVED` but not
`TRANSLATED`, surfaced to an admin (doc 44's action hub is a natural
registration point for "stuck inbound webhooks") rather than silently
dropped.

## Work orders

**WO-132.1 — schema**: `InboundWebhookEndpoint`, `InboundWebhookDelivery`,
enums, forward-only migration.
**WO-132.2 — `InboundWebhookService`**: `register()`, `receive(slug, rawBody, headers)`
(verifies, translates, publishes the target domain event), `testDelivery()`.
**WO-132.3 — permissions**: `settings.webhooks.manage`.
**WO-132.4 — UI**: endpoint registration screen with a test-delivery mode, a delivery log per endpoint.

## Acceptance

- An unverified or mis-signed inbound call is rejected and logged,
  never translated into a domain event.
- A suspended endpoint rejects every delivery attempt immediately.
- Test-delivery mode never publishes the resulting domain event to real
  subscribers.

## Out of scope

Automatically inferring a `payloadTemplate` from a sample payload (a
"smart mapping" assistant) — the template is admin-authored; automatic
inference is a real, separate convenience feature only worth building
once this mechanism sees enough real usage to justify it.
