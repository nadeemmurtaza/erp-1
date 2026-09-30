# ADR-047 — Doc 165 (cross-tenant marketplace directory): a new `apps/platform` module, not a shared `Product` table; the "Facebook" ask read as publish/discover, not merge; login-centralization split into two distinct pieces, one blocked on nID's own repo

[← Decision log](../DECISIONS.md)


### Context

The owner's own request — "centralize everything shared by different
clients... login should remain with nID only" — read literally would mean
merging tenant business data into one shared store, which
`39-shared-cross-tenant-hosting-tier.md` already rejected in writing
("shared compute, never shared data"). Two rounds of clarification
(`AskUserQuestion`) established the actual ask: separate, isolated tenants
exactly as doc 39 already built, plus a Facebook-like layer where a tenant
voluntarily publishes products/services to an audience it controls by type
(retailer/distributor/supplier/direct customer), with both discovery-only
and full-transaction paths available per listing, the client's own choice.
This ADR records the design in `165-cross-tenant-marketplace-directory.md`
and why it does not reopen doc 39.

### Options considered

1. **A shared `Product`/`Party` table across tenants** (the literal reading)
   — rejected outright: this is precisely doc 39's own named trap, "the
   exact duplicate-implementation trap CLAUDE.md warns against, just at the
   tenancy layer." Never seriously pursued past the first read of the
   request.
2. **Put the catalog inside nID** — rejected: nID's own scope
   (`18-identity-verification.md`) is identity/KYC, not commerce; nID has no
   `Product` concept and stretching it there duplicates
   `catalog-variants-pricing/03-variants-sku-seo.md`'s own `ProductVariant`
   a third way for no benefit.
3. **Extend `18-trading-partner-network.md`'s own 1:1 model** to allow an
   unregistered viewer — rejected as the primary mechanism, reused as a
   component instead: `TradingPartner` is built around a *named, pre-linked*
   partner and an API key issued to that specific partner. The owner's own
   "control who can see it, by category" is an audience/visibility question
   a 1:1 link model cannot express without being bent out of its own shape.
   Reused, correctly, as the **delivery** mechanism once a transaction is
   actually chosen (§2 below) — the marketplace registers as one more
   `TradingPartner` from the selling tenant's own point of view, so no new
   inbound-order code was written.
4. **A new module inside `apps/platform`, with its own schema, that a
   tenant explicitly publishes toward** — selected. `apps/platform` is
   already the one place in this codebase authorized to know about more
   than one tenant, for exactly this reason (doc 39). A tenant's published
   listing is data that tenant chose to make shared — categorically
   different from doc 39's "never shared data," which was always about
   data nobody chose to expose.

### Decision

Built as designed in doc 165: `MarketplaceListing` /
`MarketplacePublisherCredential` / `MarketplaceViewerProfile` /
`MarketplaceEngagement` in `apps/platform/prisma/schema/marketplace.prisma`.
This ADR records the design; ADR-058 records WO-165.1/165.2/165.6's actual
build and the remaining blocked work orders. Publishing is per-listing and
explicit; audience is
`visibleTo: MarketplaceAudience[]`; the transact-or-discover choice is
`engagementMode`, set by the publishing tenant, never a platform-wide
default. Login-centralization splits into two pieces that must not be
conflated: erp-1 staff login already has an SSO mechanism
(`161-sso-identity-federation.md`) and needs only one additive column
(`SsoConnection.enforceSso`) to make nID-only actually enforced, once nID
is configured as that connection's issuer; a marketplace viewer, who may
hold no `User` row anywhere, needs a second, narrower, hardcoded-to-nID
OIDC client living in `apps/platform` itself — justified as a real
extraction (`packages/shared/src/oidc-client.ts`) rather than a duplicate
implementation, because it is the second genuine call site, not the first.

### Reasoning

The owner's own clarifying answers are the load-bearing evidence here, not
an inference: "client will have access to his own organization only, not
all" confirms doc 39's isolation stands; "he can control who can see his
product/services" names an opt-in, filtered publication, not a merge;
"give both discovery and transactional option and let the client choose"
is why `engagementMode` is a per-listing enum, not a global toggle. Every
reused mechanism (doc 18's inbound trading-partner API, doc 155's
stored-value design for a later payment-centralization decision, doc 161's
OIDC provider mechanics) was reused because doc 165 confirmed no
architectural boundary requires a separate implementation — the same
search-before-creating discipline this repository's house rules require
everywhere else.

### Consequences

- `apps/platform` gains its first module whose entire purpose is to hold
  data a tenant *chose* to expose across the tenant boundary — a new kind
  of row in that app, distinct from `PlatformTenant`/billing/support-access,
  and any future cross-tenant capability should be measured against this
  precedent (does the tenant explicitly opt in per record, or is this
  actually doc-39-forbidden shared business data) before being added there.
- WO-165.5 (the `oidc-client.ts` extraction) and WO-165.6
  (`enforceSso`) are real, small, immediately buildable work with no
  external dependency. WO-165.3/165.4 (discovery/transact) and the
  platform-side nID login half of WO-165.5 are blocked on confirming nID's
  own OIDC surface — `nadeemmurtaza/nID` is a separate repository not
  attached to this session, so this cannot be verified or built from here.
  A future session with that repository attached must confirm or build it
  before those work orders can close.
- Phase 2 (`verifiedType`, nID-backed KYB audience verification) is
  intentionally unbuilt scaffolding — a nullable column and a deferred flag
  — exactly the pattern doc 18.5's EDI deferral already established for
  "shape it so a real request isn't a design exercise, but do not build it
  before a real trigger exists."
- Payment/escrow centralization across a marketplace transaction was
  explicitly named and deferred (doc 165's own "Out of scope") rather than
  silently assumed; if a tenant later asks for it, doc 155's stored-value
  design is the stated starting point, not a new mechanism invented cold.

### Status
**Accepted.**
