# 18 — Trading Partner Network

**Problem:** manufacturer, supplier, distributor, wholesaler and retailer
each re-key the same document. A PO one business sends is retyped as a
sales order by the next, whose invoice is retyped again as a bill by the
first. Nothing here talks to anything outside this one deployment today —
`Supplier` ([purchasing.prisma](../../apps/api/prisma/schema/purchasing.prisma))
is a contact record, not a connection.

**Approach:** one API, not two. A linked partner reaches us — and we reach
them — the same way whether they run this software or something else
entirely (SAP, Zoho, a phone order book). No parallel document types: an
inbound document calls the exact same `PurchasingService` methods a staff
member's browser call would, just authenticated by API key instead of a
session. A `Supplier` with no link behaves exactly as it does today —
nothing breaks for a partner who never connects.

## Work orders

**18.1 — `TradingPartner` model + link.** New table: `id, name, kind
(SUPPLIER|CUSTOMER|BOTH), outboundBaseUrl?, outboundApiKey (encrypted),
inboundApiKeyHash, status (PENDING|ACTIVE|SUSPENDED)`. `Supplier.tradingPartnerId`
nullable FK. Admin screen: register a partner, issue/rotate its inbound
API key (shown once), set its outbound URL.

**18.2 — Inbound receiving API.** `POST /trading-partner/v1/documents`,
authenticated by `inboundApiKeyHash` (per-partner, hashed like a webhook
secret — never stored plain). Maps a canonical JSON payload (PO / invoice /
shipment-notice) onto `PurchasingService.createSupplierBill()` /
`receiveGoods()`. `externalRef` (their document id) recorded on our side so
a redelivery or a resend doesn't double-post — same discipline as the
ledger's `(source, sourceRef)` guard. This alone delivers the headline
case: a connected supplier's invoice lands in your bill queue with nobody
typing it twice.

**18.3 — Outbound delivery.** A PO sent to a linked supplier POSTs to their
`outboundBaseUrl` instead of (or alongside) email/print, via the existing
outbox pattern (`EventBusService`) — at-least-once, retried with backoff.
No new delivery infrastructure; an HTTP sink on the mechanism this codebase
already has for domain events.

**18.4 — Reconciliation.** Admin UI shows a bill's provenance ("from
Partner X's Invoice #123") and flags a discrepancy — PO said 100 units,
invoice says 98 — as an advisory, never a block, matching how the roles
system flags a conflict without refusing the save.

**18.5 — External EDI / e-invoicing adapter.** Deferred until a specific
partner actually needs X12, UBL/Peppol, or FBR e-invoicing translation.
Building a parser for a standard nobody here is using yet is exactly the
speculative-infrastructure the house rules warn against — the canonical
payload in 18.2 stays field-sane so a translator can sit in front of it
later without a redesign. This deferral still holds — do not start 18.5
because a product list names "EDI" as a wanted capability in the abstract;
start it only once a real partner names the standard they need.

**The shape it takes when a partner does trigger it**, so a real request
does not become a design exercise under deadline: an
`EdiTranslator` interface (`toCanonical(raw: Buffer, format: 'x12' |
'ubl-peppol'): CanonicalDocument`, `fromCanonical(doc: CanonicalDocument,
format): Buffer`) sits in front of 18.2's inbound endpoint and 18.3's
outbound POST — never inside them. `TradingPartner` gains a nullable
`ediFormat` column naming which translator, if any, that partner's traffic
runs through; a partner with `ediFormat: null` keeps using the canonical
JSON payload directly, exactly as every partner does today. This is
additive and format-specific: adding UBL/Peppol support for one partner
changes zero code for a partner still on canonical JSON, and the FBR
e-invoicing case specifically reuses `15-tax-module.md`'s WO-15.5
`FiscalComplianceProvider` payload rather than re-deriving FBR's field
requirements a second time in a different document — one FBR-shaped
payload, two places it can be sent from (a direct submission per doc 15,
or riding a trading-partner document per this adapter), never two
independently-guessed FBR schemas.

## Out of scope (for now)

Multi-tenant hosting of several independent businesses in one database —
that is a different axis (see `ENTERPRISE-SCALE.md`'s Brand rule, "one
deployment serves one brand") and this feature doesn't need it: two
separately-deployed businesses talking over an API is enough to close the
gap.
