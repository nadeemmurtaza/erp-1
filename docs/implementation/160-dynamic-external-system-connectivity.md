# 160 — One dynamic connectivity system for marketplaces, accounting software, bank feeds, payroll disbursement, e-signature and calendars — not eight bespoke integrations

The owner's own words: "a dynamic flexible system that can connect to any
of them," not a separate integration per vendor. Doc 36 already wrote most
of this system and doc 132 wrote its mirror — read together, their own
opening lines say exactly this: "write a typed interface once a real,
repeated need exists; use the generic connector for everything else,"
and doc 132 fills the one cell doc 36's own table left empty (generic
*inbound*). Checked against the seven non-hardware integration categories
named in this request, those two documents already answer three of them
completely and leave three concrete, general-purpose pieces missing —
never eight vendor-specific ones. This document builds exactly those
three, so the same one system that already handles a Zapier webhook or a
courier's tracking callback also handles a QuickBooks sync, a Daraz
listing, and a bank statement drop, through configuration alone.

## What's genuinely missing, found by walking every category against what already exists

| Category | What it needs | Already covered by doc 36/132? |
|---|---|---|
| E-signature (DocuSign-shaped) | Push a document out, receive a "signed" webhook back | **Yes** — `OutboundConnector` + `InboundWebhookEndpoint`, no gap |
| Zapier / generic automation | Push our event to their webhook | **Yes** — doc 36's own worked example |
| Marketplace order-created event | They call us when an order lands | **Yes**, for the one-shot notification — `InboundWebhookEndpoint` |
| **Accounting software (QuickBooks/Xero) account sync** | Merchant clicks "Connect," authorizes THEIR OWN account, we get a refresh token scoped to them | **No** — `ConnectorAuthMethod` only has `OAUTH2_CLIENT_CREDENTIALS` (machine-to-machine, no per-merchant consent) |
| **Marketplace catalogue/stock sync (Daraz/Amazon/Shopify)** | Pull their order list on a schedule; keep a durable map of "our SKU ↔ their listing id" so a push never duplicates | **No** — nothing pulls on a schedule, nothing maps our records to theirs across syncs |
| **Bank feed / statement reconciliation, some payroll disbursement formats** | A file arrives or must be generated in a specific, non-JSON shape (MT940/CAMT.053, a bank's own bulk-payment CSV) | **No** — both existing connectors are HTTP request/response only |

Confirmed by grep: no `OAuthConnection`, no external-record mapping table,
no scheduled-pull connector kind exists anywhere in this codebase. Three
gaps, not seven — the other four categories already work today by
registering a connector/webhook and writing that vendor's own
`payloadTemplate`, exactly as doc 36 already promises.

## 1. Per-merchant OAuth2 (authorization code) — the missing half of `ConnectorAuthMethod`

```prisma
// connectors.prisma — additive
enum ConnectorAuthMethod {
  NONE
  API_KEY_HEADER
  BASIC
  OAUTH2_CLIENT_CREDENTIALS
  OAUTH2_AUTHORIZATION_CODE   // new
}

model OAuthConnection {
  id             String   @id @default(cuid())
  organizationId String
  connectorId    String   // the OutboundConnector or PollConnector (§2) this authorizes
  providerKey    String   // "quickbooks", "google_calendar", "shopify" — a label, not a typed class
  accessTokenEncrypted  Bytes
  refreshTokenEncrypted Bytes
  expiresAt      DateTime
  connectedByUserId String
  connectedAt    DateTime @default(now())

  @@unique([connectorId])
}
```

```ts
// One generic controller, reused by every OAuth2 vendor - never one per vendor.
@Controller('connectors/oauth')
export class ConnectorOAuthController {
  @Get(':connectorId/start')
  start(@Param('connectorId') id: string) {
    // Reads the connector's own authorizeUrl/clientId/scope (config, not
    // code) and redirects - the exact shape every OAuth2 provider's own
    // "Connect your account" button already needs, built once.
  }

  @Get(':connectorId/callback')
  async callback(@Param('connectorId') id: string, @Query('code') code: string) {
    // Exchanges the code for tokens at the connector's own tokenUrl,
    // encrypts and stores them in OAuthConnection - the same
    // secret-crypto discipline TradingPartner.outboundApiKey already uses.
  }
}
```

A refresh cron (mirroring doc 54's own expiry-watcher pattern) renews a
token before `expiresAt`, using the same `refreshTokenEncrypted` — never a
per-vendor renewal job.

## 2. `PollConnector` — the scheduled-pull sibling doc 132's passive webhook receiver doesn't cover

```prisma
model PollConnector {
  id             String   @id @default(cuid())
  organizationId String
  label          String   // "Daraz order sync", "Bank feed - Meezan current account"
  sourceUrl      String
  authMethod     ConnectorAuthMethod
  oauthConnectionId String?
  /// How the fetched response maps onto one of our existing domain
  /// events/records - identical templating discipline to doc 36/132,
  /// never a new mapping language.
  responseTemplate String
  intervalMinutes  Int      @default(15)
  lastPolledAt     DateTime?
  lastCursor       String?  // an opaque watermark the template can reference, so a poll fetches only what's new
  status           ConnectorStatus @default(ACTIVE)

  @@index([organizationId, status])
}
```

```ts
@Cron('*/5 * * * *')
async runDuePolls(): Promise<void> {
  const due = await this.prisma.pollConnector.findMany({
    where: { status: 'ACTIVE', OR: [{ lastPolledAt: null }, { lastPolledAt: { lt: /* now - intervalMinutes */ } }] },
  });
  for (const connector of due) {
    // Fetch, apply responseTemplate, advance lastCursor - one generic
    // executor, not one polling job written per vendor.
  }
}
```

## 3. `ExternalRecordLink` — one generic mapping table every stateful sync reuses

```prisma
model ExternalRecordLink {
  id             String @id @default(cuid())
  organizationId String
  connectorId    String   // which OutboundConnector or PollConnector owns this mapping
  /// Our own entity - a bare (type, id) pair, the identical cross-module
  /// decoupling convention StockMovement.refType/refId already uses,
  /// so this table never imports a specific module's Prisma model.
  ourEntityType  String   // "ProductVariant" | "Order" | "Contact" | ...
  ourEntityId    String
  externalId     String   // their listing id, their invoice id, their calendar event id
  lastSyncedAt   DateTime @default(now())

  @@unique([connectorId, ourEntityType, ourEntityId])
  @@unique([connectorId, externalId])
}
```

This one table is what makes a marketplace stock push idempotent (doc
157's own discipline, reused here: "have I already told Daraz about this
SKU" is a lookup, not a guess), what lets a calendar sync update the same
external event instead of creating a duplicate on every push, and what
lets an accounting sync find the QuickBooks invoice that already
corresponds to our own `Invoice` row before creating a second one.

## 4. Where this leaves each category — configuration, not new code

| Category | What ships when a merchant wants it |
|---|---|
| QuickBooks/Xero | One `OutboundConnector` (push our invoices) + one `PollConnector` (pull their chart-of-accounts changes) + `OAUTH2_AUTHORIZATION_CODE`, all driven by that vendor's own template — no new class |
| Daraz/Amazon/Shopify | `PollConnector` for their order feed, `OutboundConnector` for our stock pushes, `ExternalRecordLink` keeping the SKU↔listing map |
| Bank feed reconciliation | `PollConnector` against the bank's own read-only statement API where one exists; a file-drop variant is named explicitly in Out of Scope below, not folded in here |
| Calendar/video (Google/Microsoft) | `OAUTH2_AUTHORIZATION_CODE` + `PollConnector` for invite changes + `ExternalRecordLink` per meeting |
| E-signature, Zapier, marketplace order webhooks | Unchanged — doc 36/132 already sufficient |

Each of these is a **registration + a template**, written once per vendor
by whoever integrates it — this document eliminates writing new *code*
per vendor, not the one-time act of reading that vendor's own API
reference to write its template, which no generic system can eliminate
honestly.

## Scope lenses

**The actor with three tables** — n/a: `OAuthConnection`/`PollConnector`/
`ExternalRecordLink` act on behalf of the connecting `User`, never a new
actor type.
**The principal with no permission key** — n/a.
**The grant that ends itself** — an `OAuthConnection`'s own token expiry
(§1) is exactly this: a grant that must be renewed or it silently stops
working, never a permanent credential.
**Whose rows, and which columns** — every new table is
`organizationId`-scoped identically to doc 36/132's own tables.
**The threshold nobody approves alone / The toxic pair** — n/a: connecting
an external account is a configuration action, not a money/stock
authority; gated by `connectors.manage` (doc 36's own existing permission).
**Authority and blast radius** — who may register a `PollConnector`/
initiate an OAuth connection is the same `connectors.manage` holder doc 36
already names; the audit trail is the connector's own row plus its
delivery/poll history.
**Audience is a capability, not an address** — n/a: no notification of
its own beyond what the connected data eventually feeds into.
**Request or record** — registering a connector is a REQUEST (refusable —
malformed template, unreachable URL); a completed poll or push is a
RECORD of what was actually sent/received, stored in the delivery/poll
history exactly as doc 36/132 already do.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity / Dry run before live** — n/a: this document moves no money or
stock of its own; whatever domain event a poll/push ultimately produces
already carries its own answer to these lenses from its own document.
**Click the number** — an `ExternalRecordLink` row is itself the drill-
down: any screen showing "synced to Daraz" links straight to that mapping
row and its `lastSyncedAt`, never an unverifiable claim of sync status.
**Three silhouettes** — identical mechanism at all three editions; a Solo
shop might connect one marketplace, an Organization dozens of connectors
across brands, the same three tables scaling by row count alone.
**The absent collaborator** — with no connector configured for a category,
that integration simply doesn't exist yet for that tenant — no broken
screen, no partial sync, exactly doc 36's own "every pack must be
survivably absent" answer.
**The second copy of the write** — `ExternalRecordLink`'s own
`@@unique([connectorId, ourEntityType, ourEntityId])` is the guard: a
retried push finds the existing link and updates the same external
record rather than creating a duplicate — the identical idempotency
discipline doc 157 already established for this repository's own writes,
extended to an external system's records.
**The hundred-thousandth row** — `PollConnector`'s own due-poll query is
indexed on `(status)`; `ExternalRecordLink` on both unique constraints,
which double as its own lookup indexes.
**The reversal document / The undo fan-out** — n/a: reversing a synced
fact (an order cancelled after being pushed to a marketplace) is the
underlying domain event's own reversal, which the connector re-pushes
through the identical template, never a special-cased "undo sync" path.
**The version stamp** — editing a connector's `payloadTemplate` applies
to future deliveries only; past `ConnectorDelivery`/poll history rows keep
the payload they were actually sent with, unchanged.
**The erasure the ledger cannot obey** — `ExternalRecordLink.ourEntityId`
may reference a `Contact`; that contact's own erasure path (doc 06/07)
must also clear or pseudonymise any link naming it, named here as a
required step in that existing erasure procedure, not a new one.
**The failure path** — a `PollConnector` fetch failure or malformed
response is logged to a poll-history row with a `FAILED` status and
retried on the next scheduled tick, never silently dropped and never
crashing the shared cron job that other connectors' due polls also run on.

## Work orders

**WO-160.1 — schema**: `ConnectorAuthMethod.OAUTH2_AUTHORIZATION_CODE`,
`OAuthConnection`, `PollConnector`, `ExternalRecordLink`, forward-only
migration.
**WO-160.2 — `ConnectorOAuthController`** (start/callback) + the token-
refresh cron, generic across every OAuth2 vendor.
**WO-160.3 — `runDuePolls()`** cron executor + poll-history table
(the `PollConnector` mirror of `ConnectorDelivery`/`InboundWebhookDelivery`).
**WO-160.4 — UI**: a "Connect" button per registered `PollConnector`/
OAuth-based `OutboundConnector` (doc 36's own admin screen, extended, not
duplicated), and a sync-status view reading `ExternalRecordLink`.
**WO-160.5 — worked template**: one real, fully worked
`payloadTemplate`/`responseTemplate` pair for a real accounting-software
vendor, proving the mechanism end to end rather than leaving it
theoretical.

## Acceptance

- Connecting a QuickBooks-shaped OAuth2 test double end to end (start →
  redirect → callback → stored, encrypted tokens) requires zero new
  application code beyond the one generic controller in §1.
- A `PollConnector` fetching a paginated test API twice never creates a
  duplicate `ExternalRecordLink` for the same external id, proven by a
  spec.
- A push for an entity that already has an `ExternalRecordLink` updates
  the same external record rather than creating a second one, proven by
  a spec.
- Deleting/disabling a `PollConnector` stops its own due-poll query from
  ever selecting it again, proven by a spec.

## Out of scope

A file/SFTP connector kind for bank statement drops and bulk-payment
disbursement files that have no HTTP API at all — a real, named fourth
shape (file-in, file-out, on a schedule or on arrival) this document does
not build, because no bank integration has been confirmed yet and building
it speculatively repeats the mistake doc 36 itself warns against; the
`PollConnector`/`OutboundConnector` pair already covers any bank or
payroll partner that exposes a real API, which is increasingly the norm.
Hardware (barcode scanners, scales, label printers) — correctly out of
this document's scope entirely; doc 31's own local-device driver
extension point is the right mechanism for that class, and folding it in
here would blur two genuinely different integration shapes (a network API
vs. a local peripheral) into one, which doc 36 itself never conflated
either.
