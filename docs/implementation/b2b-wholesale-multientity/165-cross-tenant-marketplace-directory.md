# 165 — Cross-tenant marketplace directory: publish, discover, transact

> **Status: partially built (2026-09-26).** Written at the owner's own
> request: *"we need to centralize the all shared/reusable things at one
> place... like a facebook in this way client can publish his product and
> services, he can control who can see his product/services like retailers,
> distributer, supplier, or direct customer also... login should remain with
> nID only."* This document is the buildable architecture behind that
> request.
>
> **Built:** WO-165.1 (full schema — `MarketplaceListing`,
> `MarketplaceViewerProfile`, `MarketplaceEngagement`, alongside doc 166's
> already-built `MarketplacePublisherCredential`), WO-165.2 (the platform's
> own publish API — `MarketplaceListingsController`/`Service`, upsert-not-
> duplicate on `[tenantId, externalRef]`, auto-delist on credential
> revocation — plus erp-1's server-to-server proxy — `MarketplaceModule`,
> off by default — and its admin "Publish to marketplace" screen), and
> WO-165.6 (`SsoConnection.enforceSso`, the erp-1 staff password-login
> guard, and its admin toggle).
>
> **Deviation from §2's own wording:** `MarketplacePublisherCredential` is
> issued by platform ops staff (`OpsAuthGuard`), not self-service by the
> tenant as §2 describes — the mechanism doc 166 already built. erp-1 reads
> the issued credential from `MARKETPLACE_API_URL`/`MARKETPLACE_API_KEY`,
> mirroring doc 14's `ManagedServicesService` pattern exactly. See
> ADR-058.
>
> **Still blocked, named honestly, not built:** WO-165.3 (discovery),
> WO-165.4 (transact), WO-165.5 (the `oidc-client.ts` extraction and
> the platform-side nID login client) — all wait on nID's own OIDC surface
> per §4, a cross-repo dependency this session cannot confirm or build.
> `MarketplaceViewerProfile`/`MarketplaceEngagement` exist as schema only;
> no service or controller reads or writes them yet. WO-165.7 (Phase 2)
> remains deferred as designed.

## What this actually is, and what it is not

The owner's own words ("like a Facebook") name a **publish/discover layer
across otherwise-isolated tenants**, not a request to merge tenant data.
Read literally, "centralize products/services/persons/organizations at one
place" would mean a shared `Product` table across every client's shop —
that is exactly what `39-shared-cross-tenant-hosting-tier.md` already
rejected, deliberately and in writing, as "the exact duplicate-implementation
trap CLAUDE.md warns against, just at the tenancy layer." Doc 39 shipped
**one isolated database per tenant, shared compute only**. This document
does not reopen that decision — it is confirmed, not in tension with it,
once the owner's own clarification is read exactly: *"client will have
access to his own organization only, not all... he can control who can see
his product/services."* Control implies the default is *not* seeing it. A
tenant's own product and customer data stays exactly where doc 39 put it —
inside that tenant's own database, owned by that tenant alone. What crosses
the tenant boundary is a **narrow, explicit, tenant-initiated publication**:
a subset of fields, for a subset of listings, visible to a named audience —
never a sync, a mirror, or a merge of the underlying business data.

Nor is nID the right home for this. nID (`18-identity-verification.md`) is
Newax's identity/KYC platform — it answers "is this person who they say they
are," not "what does this business sell." Stretching it to also hold a
product catalog would blur what it is and duplicate `ProductVariant`
(`catalog-variants-pricing/03-variants-sku-seo.md`) a third way. nID's actual
job in this design is exactly what it already does: prove who someone is —
extended, in Phase 2 below, to prove what *kind* of business they are, which
is precisely the "who can see this" question the owner asked for.

So this is genuinely a **third thing**: a directory service, separate from
both nID and any one tenant's own erp-1 deployment, that a tenant opts into
publishing toward and a viewer (retailer, distributor, supplier or direct
customer) browses. The closest existing precedent in this codebase,
`18-trading-partner-network.md`, gets most of the way there and is reused
below rather than re-invented — but it is scoped narrower than this ask: it
connects two *pre-registered, named* partners 1:1. Nothing in it lets a
tenant broadcast to a whole *category* of unknown viewer, which is the actual
"Facebook" shape the owner described.

## Where it lives: a new module in the existing platform app, not a new repo

`apps/platform` (`39-shared-cross-tenant-hosting-tier.md`) is already the
one place in this whole system authorized to know about more than one
tenant at a time — that is its entire reason to exist. A cross-tenant
directory is not a new architectural exception; it is a new **module**
inside the app that already carries that exception, alongside
`modules/tenants`, `modules/billing`, `modules/agency`. It gets its own
schema file (`apps/platform/prisma/schema/marketplace.prisma`, additive,
mirroring how `platform.prisma` and `apps/api`'s many schema files already
split by domain) and its own database tables in the platform's existing
database — **never inside any tenant's own database**, which is what keeps
this consistent with doc 39's "shared compute, never shared data" rule: the
directory's data *is* the shared thing, by the tenant's own explicit choice
to publish it, which is categorically different from sharing a tenant's
private order or customer data.

## 1. Schema

```prisma
// apps/platform/prisma/schema/marketplace.prisma — additive

enum MarketplaceListingKind { PRODUCT SERVICE }

/// Exactly the four categories the owner named. A viewer who is none of
/// these (not yet nID-verified as any business type) sees only listings
/// with DIRECT_CUSTOMER in their visibleTo set, or nothing, per §3.
enum MarketplaceAudience { RETAILER DISTRIBUTOR SUPPLIER DIRECT_CUSTOMER }

enum MarketplaceListingStatus { ACTIVE PAUSED DELISTED }

/// The owner's own answer: "give both discovery and transaction and let
/// the client choose" — a per-listing choice, not a platform-wide one.
enum MarketplaceEngagementMode { DISCOVERY_ONLY DISCOVERY_AND_TRANSACT }

model MarketplaceListing {
  id             String   @id @default(cuid())
  tenantId       String
  kind           MarketplaceListingKind
  /// The tenant's own ProductVariant/Service id. Opaque to the directory —
  /// it is never resolved or dereferenced here, only echoed back to the
  /// tenant on an engagement (§2), exactly as TradingPartner's own
  /// externalRef is opaque to the receiving side in doc 18.2.
  externalRef    String
  title          String
  description    String
  priceMinorUnits Int?
  currency       String?
  imageUrl       String?
  visibleTo      MarketplaceAudience[]
  engagementMode MarketplaceEngagementMode @default(DISCOVERY_ONLY)
  status         MarketplaceListingStatus  @default(ACTIVE)
  publishedAt    DateTime @default(now())
  updatedAt      DateTime @updatedAt

  tenant       PlatformTenant          @relation(fields: [tenantId], references: [id])
  engagements  MarketplaceEngagement[]

  @@unique([tenantId, externalRef])
  @@index([status, kind])
}

/// One row per tenant that has turned publishing on. Mirrors
/// PlatformTenant.apiKeyHash / agency-key.ts's own hash-only discipline —
/// the plaintext key is shown once and never stored.
model MarketplacePublisherCredential {
  id         String    @id @default(cuid())
  tenantId   String    @unique
  apiKeyHash String    @unique
  rotatedAt  DateTime?
  createdAt  DateTime  @default(now())

  tenant PlatformTenant @relation(fields: [tenantId], references: [id])
}

/// One row per nID-authenticated viewer who has ever browsed the
/// directory. Not a User, not a Party — a fourth kind of principal this
/// document's own "actor with three tables" lens below names explicitly.
model MarketplaceViewerProfile {
  id           String   @id @default(cuid())
  /// Ties to nID's own subject, the identical join key
  /// IdentityVerification.nidSubjectId already uses on erp-1's side.
  nidSubjectId String   @unique
  /// Phase 1 (this document, built): self-declared at first login, shown
  /// back to the viewer as "you told us you're a distributor" — never
  /// presented as verified.
  declaredType MarketplaceAudience
  /// Phase 2 (explicitly deferred, §5): set only once nID's own KYB
  /// confirms the organization's declared type. Null for every viewer
  /// until nID ships KYB and this shop wires it in.
  verifiedType MarketplaceAudience?
  createdAt    DateTime @default(now())

  engagements MarketplaceEngagement[]
}

enum MarketplaceEngagementKind { INQUIRY ORDER_REQUEST }
enum MarketplaceEngagementStatus { PENDING DELIVERED FAILED }

/// A viewer acting on a listing — either kind, chosen by the listing's own
/// engagementMode. The canonical JSON payload shape is deliberately the
/// same family doc 18.2 already defined for a trading-partner document,
/// so an ORDER_REQUEST needs no second schema on the receiving tenant's
/// side (§2).
model MarketplaceEngagement {
  id              String   @id @default(cuid())
  listingId       String
  viewerProfileId String
  kind            MarketplaceEngagementKind
  payload         Json
  status          MarketplaceEngagementStatus @default(PENDING)
  deliveryError   String?
  createdAt       DateTime @default(now())
  deliveredAt     DateTime?

  listing       MarketplaceListing       @relation(fields: [listingId], references: [id])
  viewerProfile MarketplaceViewerProfile @relation(fields: [viewerProfileId], references: [id])

  @@index([listingId, status])
}
```

## 2. Publish, and the transactional path — reusing doc 18, not duplicating it

**Publish (tenant → directory).** A tenant's own erp-1 admin gets one new
screen, "Publish to marketplace" (per product/service), which calls
`POST /marketplace/v1/listings` on the platform app, authenticated by the
`MarketplacePublisherCredential` the tenant generated once (same
"issue/rotate, shown once" admin UX doc 18.1 already established for a
`TradingPartner`'s inbound key). The tenant picks `visibleTo` and
`engagementMode` on that screen — this is the actual UI for "he can control
who can see his product/services," not a backend flag nobody can reach.

**Discovery (viewer → directory).** A viewer signs in once via nID (§3),
declares or already carries a `MarketplaceViewerProfile.declaredType`, and
browses `GET /marketplace/v1/listings?audience=...` — filtered server-side
to listings whose `visibleTo` includes that viewer's type, or that carry no
audience restriction. `DISCOVERY_ONLY`'s "Contact seller" posts an `INQUIRY`
engagement, delivered to the owning tenant as one more outbound sink on the
existing outbox (`EventBusService`) — the identical at-least-once,
backed-off HTTP delivery doc 18.3 already built for an outbound PO, pointed
at a URL the tenant registers on the same publish screen.

**Transact (viewer → directory → owning tenant's own ERP).** This is the
reuse that matters: when a tenant first sets up
`MarketplacePublisherCredential`, provisioning also creates, on that
tenant's own erp-1 side, exactly one `TradingPartner` row — `name:
"Marketplace"`, `kind: CUSTOMER`, `status: ACTIVE` — and stores its issued
`inboundApiKeyHash` back on the platform side as the credential the
directory uses to deliver `ORDER_REQUEST` engagements. From that tenant's
own point of view, **the marketplace is just one more registered trading
partner** submitting documents to its already-built
`POST /trading-partner/v1/documents` (doc 18.2) — zero new inbound-order
code inside erp-1 itself, and 18.2's existing `externalRef` de-dup already
covers a redelivered engagement without a second idempotency mechanism. A
listing with `engagementMode: DISCOVERY_ONLY` never creates this
`TradingPartner` row at all — the owner's own "let the client choose" is a
real fork in what gets provisioned, not a cosmetic label.

Money is deliberately **not** centralized here: an `ORDER_REQUEST` lands as
an ordinary order in the owning tenant's own ERP, and payment collection
happens through whatever channel that tenant already uses (their own
checkout, invoice, bank transfer). Routing payment through the directory
itself — reusing doc 155's stored-value/escrow design one more level up —
is a real, separate, larger decision, named here and explicitly deferred
until a tenant actually asks for it; building it speculatively now is the
exact "no speculative functionality" trap.

## 3. Login stays nID-only — two distinct pieces, not one

**Piece one, already built: erp-1 staff login.**
`161-sso-identity-federation.md` already lets an erp-1 tenant configure an
`SsoConnection` pointed at any OIDC issuer, nID included, the moment nID
exposes one (see §4). What doc 161 does *not* do is force it: today an
`SsoConnection` adds a button *alongside* the password form. "Login should
remain with nID only" needs one small, precise addition doc 161 didn't
scope: a `SsoConnection.enforceSso: Boolean @default(false)` column
(additive) — when true, `AuthController`'s password route refuses with a
message pointing at the SSO button, for every account except the one
break-glass admin doc 161's own design already assumes exists. This is a
column and a guard clause on an existing controller, not a new SSO system.

**Piece two, new here: marketplace viewer login.** A marketplace viewer is
never a tenant's own `User` — they may not have an account with any tenant
at all. They authenticate once, centrally, against nID, and that identity
is reused across every tenant's published listings — literally the
"centralize login" the owner asked for, since nID is the one thing every
party here already has in common. `apps/platform` gets its own, much
narrower OIDC client than doc 161's: a single, hardcoded connection to nID
(not admin-configurable, not multi-issuer — nID *is* the platform's own
identity backbone here, not one of several IdPs an org might pick).

Building a second full OIDC client from scratch would be exactly the
duplicate implementation CLAUDE.md's own search-before-creating rule warns
against. The fix is a genuine extraction, not a copy-paste: pull the
issuer-agnostic mechanics already inside `apps/api`'s
`core/auth/providers/oidc.provider.ts` (discovery, PKCE, state/nonce
sealing, RS256 verification — none of it `SsoConnection`-specific) into
`packages/shared/src/oidc-client.ts`, and make both `OidcProvider`
(erp-1, per-tenant-configurable) and the new platform module (hardcoded to
nID) thin callers of the same shared client. This is precisely the "second
real, repeated need" doc 160/161's own precedent requires before an
abstraction is justified — the first call site alone didn't earn it; the
second one does.

## 4. Cross-repo dependency — honestly out of this repo's reach

nID's own current surface (per `18-identity-verification.md`) is a REST API
plus a signed webhook for KYC cases. It does not today expose OIDC
discovery, authorization or token endpoints — nothing in this repository
can confirm otherwise, since `nadeemmurtaza/nID` is a separate repository
not attached to this session. Piece two above (§3) and Phase 2's KYB
audience-verification (§5) are both blocked on nID adding that surface.
This is named honestly as a blocker, not assumed into existence: the erp-1-
and platform-side pieces of this document (§1, §2, and the `enforceSso`
column in §3) are fully buildable today against the shared `oidc-client.ts`
extraction, pointed at any OIDC issuer, and simply wait, correctly, for
nID's own issuer to exist. Confirming or building that surface requires
adding the nID repository to a session with access to it — not a decision
this document can make unilaterally about a codebase it cannot read.

## 5. Phase 2, named and deferred: nID-verified audience, not self-declared

Phase 1 ships `MarketplaceViewerProfile.declaredType` as self-declared —
"tell us you're a distributor" — because nID's own KYB (organization
verification) is Phase 2+ on nID's *own* roadmap (`18-identity-
verification.md`'s own "Explicitly out of scope" list) and does not exist
today. Building `verifiedType` gating now, against a KYB endpoint that does
not exist, would be exactly the speculative-infrastructure trap doc 18.5's
own EDI deferral already named for a different capability. `verifiedType`
stays a nullable, unused column until nID ships KYB and a tenant asks that
a listing require it — at which point a listing gains a `requireVerified:
Boolean` flag (additive, defaulting false) checked alongside `visibleTo`,
never a redesign of the audience model above.

## Scope lenses

**The actor with three tables** — a fourth kind of principal, deliberately:
`MarketplaceViewerProfile`, keyed on `nidSubjectId`, is neither `User`
(no tenant relationship), `Party`/`Contact` (no tenant owns them), nor
`TradingPartner` (not pre-registered) — it exists because none of the
existing three fit a principal with no tenant at all.
**The principal with no permission key** — a `MarketplaceViewerProfile` is
checked against `MarketplaceListing.visibleTo`/`requireVerified` at read
time, never `PermissionsGuard`; it authenticates via the nID-issued OIDC
token alone (§3), which is the entire reason §3's `oidc-client.ts`
extraction has to be trustworthy on its own, with no tenant-level guard
behind it.
**The grant that ends itself** — revoking a `MarketplacePublisherCredential`
(rotation with no new key issued, or the admin "stop publishing" action)
immediately stops new `POST /marketplace/v1/listings` calls and, on the
next publish-screen load, offers to `DELISTED` every `MarketplaceListing`
that tenant owns — no dangling published data outliving the credential
that published it.
**Whose rows, and which columns** — a viewer sees only `MarketplaceListing`
rows whose `visibleTo` includes their type and whose `status: ACTIVE`;
`externalRef`, `MarketplacePublisherCredential`, and every tenant-internal
id are never serialized to a viewer response.
**The threshold nobody approves alone** — n/a at this phase: an
`ORDER_REQUEST` lands as an ordinary draft order in the receiving tenant's
own ERP and is subject to whatever approval threshold that tenant's own
`PurchasingService`/order flow already enforces; this document adds no new
money-committing step of its own.
**The toxic pair** — a tenant cannot both publish a listing and be its own
viewer profile's declared audience for that same listing in a way that
lets self-dealing bypass a real transaction; enforcement point:
`MarketplaceEngagementService.create()` refuses an engagement whose
`viewerProfile` resolves to a `nidSubjectId` already linked (via
`IdentityVerification`, on the owning tenant's own erp-1 side) to a `User`
holding `orders.manage` on the listing's own `tenantId` — the identical
comparison-not-role-check shape `closeShift()` already uses elsewhere in
this codebase.
**Authority and blast radius** — who may create/rotate a
`MarketplacePublisherCredential` and edit `visibleTo`/`engagementMode` on a
tenant's own listings is that tenant's own existing admin permission
(`catalog.manage` or equivalent, unchanged) — this document adds no new
platform-side permission for tenant-initiated actions, only the platform
staff-facing directory moderation screen below.
**Audience is a capability, not an address** — `visibleTo` is the audience
mechanism this entire document is about: an `INQUIRY`/`ORDER_REQUEST`
delivery resolves to the *owning tenant's own* registered webhook URL or
`TradingPartner` row, never a literal address stored on the listing.
**Request or record** — publishing a listing, and every `INQUIRY`, are
REQUESTs (refusable — a paused/delisted listing accepts neither). An
`ORDER_REQUEST` delivered into the owning tenant's own trading-partner
inbound API becomes, at that point, whatever REQUEST/RECORD classification
doc 18.2's own `PurchasingService.createSupplierBill()`/order-creation path
already gives it — this document does not change that classification, only
adds one more caller.
**The movement with no address** — n/a: no stock or cash write happens
inside the directory itself; an `ORDER_REQUEST`'s eventual stock movement
happens entirely inside the owning tenant's own `InventoryService.move()`,
unchanged.
**Four hours down, the counter stays open** — if the platform app is
unreachable, publishing and browsing pause; no tenant's own erp-1
deployment is affected, since (per §"Where it lives") nothing in a tenant's
own instance calls out to the directory to keep functioning — the directory
is a pure add-on layer, restated from doc 39's own "no application code
inside a tenant's own instance needs to know a shared tier exists above it."
**The unwritten posting rule / Every column or none / The period that
already moved / The second legal entity / Dry run before live** — n/a: this
document posts no journal entry; money for a transacted order posts entirely
inside the receiving tenant's own existing accounting path, unchanged.
**Click the number** — a tenant's own "Marketplace" admin screen links each
delivered `MarketplaceEngagement` to the resulting `TradingPartner`-sourced
order in their own Orders list, the same provenance-link doc 18.4 already
built for a trading-partner document.
**Three silhouettes** — Solo: publishing is realistically rare but not
blocked. Chain: one node/branch publishes on behalf of the whole brand,
resolved through whichever branch the tenant's own admin designates as the
fulfilling location — no change to this document's own model. Organization:
several `RetailBrand`s under one `Organization` may each publish
independently; `MarketplaceListing.tenantId` already scopes correctly since
a tenant is a node, per doc 39, regardless of how many brands live inside it.
**The absent collaborator** — with no `MarketplacePublisherCredential` ever
issued, a tenant's own ERP is entirely unaffected — no nav entry lights up,
no `TradingPartner` row is ever created, byte-identical to today.
**The second copy of the write** — `MarketplaceListing.@@unique([tenantId,
externalRef])` makes a re-published listing an update, not a duplicate;
`MarketplaceEngagement` delivery is retried through the same outbox
at-least-once discipline doc 18.3 already uses, and doc 18.2's own
`externalRef` guard on the receiving tenant's side is what actually
prevents a redelivered `ORDER_REQUEST` from posting twice.
**The hundred-thousandth row** — `MarketplaceListing` is indexed on
`[status, kind]` for the browse query; at real marketplace scale this
becomes a search-index question (out of scope below), not a Postgres
index question alone.
**The adoption test** — `MarketplaceListing.id`/`MarketplaceEngagement.id`
are `cuid()`s generated by the platform app, a single writer, so no
two-node collision case applies here the way it does inside a tenant's own
chain-scale document numbering.
**The reversal document, not the reversal flag** — an `ORDER_REQUEST`
delivered into a tenant's own ERP is cancelled or returned through that
tenant's own existing order-cancellation/return path (doc 06), entirely
unaffected by this document; the directory itself has no order state to
reverse once delivery succeeds.
**The undo fan-out** — delisting a `MarketplaceListing` (automatic on
credential revocation, or manual) stops new engagements immediately;
already-delivered `ORDER_REQUEST`s already live as ordinary orders inside
the receiving tenant and are not retracted — the same "reaches an
already-happened fact" boundary doc 18's own reconciliation section draws.
**The version stamp** — editing `visibleTo`/`engagementMode` on a listing
applies to new engagements only; an already-delivered `MarketplaceEngagement`
keeps the `payload` it was created with.
**The erasure the ledger cannot obey** — `MarketplaceViewerProfile.nidSubjectId`
is a pseudonymous identifier by construction (mirrors `IdentityVerification`'s
own erasure answer); no name, email or address is ever stored on this side —
nID remains the sole holder of that PII, another reason login stays
nID-only rather than duplicated into a directory-local account.
**The failure path** — a failed `MarketplaceEngagement` delivery
(`status: FAILED`, `deliveryError` set) surfaces on the owning tenant's own
"Marketplace" admin screen with a manual retry action, gated by the same
permission that manages that tenant's `MarketplacePublisherCredential` —
never a silent drop.

## Work orders

**WO-165.1 — schema.** `MarketplaceListing`, `MarketplacePublisherCredential`,
`MarketplaceViewerProfile`, `MarketplaceEngagement` and their enums, in
`apps/platform/prisma/schema/marketplace.prisma`, forward-only migration.

**WO-165.2 — publish API + admin UI (erp-1 side).** `POST/PATCH
/marketplace/v1/listings` on the platform app, authenticated by
`MarketplacePublisherCredential`; the erp-1 "Publish to marketplace" screen
per product/service, setting `visibleTo`/`engagementMode`; issuing and
rotating the credential (shown once, per doc 18.1's own UX).

**WO-165.3 — discovery (platform side).** `GET /marketplace/v1/listings`,
audience-filtered by the caller's `MarketplaceViewerProfile.declaredType`;
the directory's own minimal browse UI; `INQUIRY` delivery via one more
outbox HTTP sink.

**WO-165.4 — transactional path.** Auto-provisioning the seller-tenant's
own `TradingPartner` row (`kind: CUSTOMER`, name `"Marketplace"`) the
moment `MarketplacePublisherCredential` is first issued; `ORDER_REQUEST`
delivery through that tenant's own existing `POST
/trading-partner/v1/documents` (doc 18.2), unchanged.

**WO-165.5 — `oidc-client.ts` extraction + platform nID login.** Pull the
issuer-agnostic OIDC mechanics out of `apps/api`'s `oidc.provider.ts` into
`packages/shared/src/oidc-client.ts`; `apps/api`'s `OidcProvider` becomes a
thin caller; `apps/platform` gets its own thin caller hardcoded to nID's
issuer, gated entirely on §4's cross-repo dependency being confirmed first.

**WO-165.6 — `enforceSso` on erp-1 staff login.** The additive
`SsoConnection.enforceSso` column and the password-route guard clause in
`AuthController`, per §3's piece one.

**WO-165.7 — deferred, named, not started.** Phase 2's `verifiedType`/
`requireVerified` wiring (§5), and directory search-at-scale (the
hundred-thousandth-row lens above) — both wait on a real trigger (nID
shipping KYB; the directory's own listing count actually reaching a size
where Postgres indexing stops being enough) exactly as doc 18.5's EDI
adapter waits on a real partner naming a standard.

## Acceptance

- A tenant with no `MarketplacePublisherCredential` sees no new behavior
  anywhere in their own erp-1 deployment — proven by the absent-collaborator
  lens above, checked as a spec.
- A published listing is invisible to a viewer whose `declaredType` is not
  in its `visibleTo` set, proven by a spec on the discovery query.
- An `ORDER_REQUEST` delivered twice (simulated redelivery) posts exactly
  one order on the receiving tenant's side, via doc 18.2's own existing
  `externalRef` guard — proven by a spec, not a new de-dup mechanism.
- Revoking a `MarketplacePublisherCredential` stops new listing writes and
  delists every listing that credential's tenant owns, automatically — "the
  grant that ends itself" lens above; built as `delistAllForTenant()`, not
  an offer a human has to act on.
- With `SsoConnection.enforceSso: false` (the default), erp-1's login screen
  is byte-identical to today's, restated from doc 161's own acceptance.

## Out of scope

**Centralizing `Product`, `Service`, `Person` or `Organization` data itself**
across tenants — the literal reading of "centralize" the owner's own
follow-up ("not sure yet — just flagging the duplication") left open. What
this document builds is narrower and safer: a published *subset* of fields
a tenant explicitly opts to expose, never the underlying tables. If a
genuine shared master-data need is identified later (a shared brand
taxonomy, a shared supplier registry) that is a separate, future decision —
not something this document's publish/discover mechanism should be
stretched to cover.

**Payment/escrow centralization** (§2) — deferred until a tenant actually
asks the directory to collect payment on their behalf, at which point it is
doc 155's own stored-value design extended one level, not a new mechanism.

**Full-text/faceted search at scale** — WO-165.7, deferred until the
listing count justifies it.

**A specific nID OIDC implementation** — blocked on §4's cross-repo
dependency; nothing here can be built past the `oidc-client.ts` extraction
until nID's own issuer surface is confirmed to exist.

**Ratings, reviews, or a reputation system for marketplace sellers** — not
named anywhere in the owner's own request; would be genuinely new
speculative functionality if added here.
