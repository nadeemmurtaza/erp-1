# 128 — Port-coverage audit: two real gaps found — SSO/identity and shipping carriers

This repository already has a strong, consistent extension-point pattern
(`PaymentProvider`, `StorageDriver`, `AiProvider`, `NotificationChannel`,
`FiscalComplianceProvider`, `EdiTranslator`, `VectorStore`,
`OutboundConnector`) — doc 115's own finding that this is already
hexagonal architecture in substance. This document is the audit doc 115
implied but did not perform: checking every plausible third-party swap
point against whether a port actually exists for it. Two real, concrete
gaps were found by grep against the actual codebase, not assumed.

## What was checked, and what was found missing

- **SSO / identity provider** — no `SsoProvider`, `IdentityProvider`, SAML,
  or OIDC login path exists anywhere in `apps/api/src` (confirmed by
  search). Every login today goes through this repository's own
  `AuthService`/`bcryptjs` password path (doc 126's own citation). A
  client wanting "log in with Google" or "log in with our own Microsoft
  Entra tenant" has no seam to plug into today.
- **Shipping carrier integration** — no `ShippingCarrier`/`CarrierProvider`
  interface exists (confirmed by search); `Shipment.cost` (doc 68's own
  citation of `OrderEconomics.shippingCost`) is populated from whatever
  process already exists for recording a shipment's cost, but there is no
  typed seam for "call DHL/TCS/Leopards's own API to get a live rate or a
  tracking number."
- **What was checked and found already covered**: payment (doc 15/50),
  storage (doc 36), AI (doc 09), notification channels (doc 33/101), fiscal
  compliance (doc 15), EDI/trading-partner translation (doc 18), vector
  search (doc 35/121), generic outbound webhooks (doc 36), MCP tool
  exposure (doc 116). No gap found in any of these.

## 1. `IdentityProvider` — a login method port, alongside the existing password path

```ts
export interface IdentityProvider {
  readonly name: string; // "google", "microsoft-entra", "saml-generic"
  /** Verifies an external identity assertion (an OIDC id_token, a SAML
   *  response) and resolves it to this repository's own User, never
   *  creating a User with elevated permissions by default — a new SSO
   *  login still lands as whatever role this organization's own
   *  provisioning policy assigns a first-time login, exactly the
   *  existing invite/self-registration flow's own rule. */
  verifyAssertion(assertion: string): Promise<{ email: string; externalId: string }>;
}
```

Registered exactly like `PaymentProvider`: an organization with no
`IdentityProvider` configured continues to use the existing password
login path unchanged — a correct, silent absence, never forced adoption.

## 2. `ShippingCarrier` — a rate/label/tracking port, alongside `Shipment.cost`

```ts
export interface ShippingCarrier {
  readonly name: string; // "tcs", "leopards", "dhl"
  getRate(input: { originLocationId: string; destinationAddress: Json; weightGrams: number }): Promise<{ costMinor: number }>;
  createLabel(shipmentId: string): Promise<{ trackingNumber: string; labelUrl: string }>;
  getTrackingStatus(trackingNumber: string): Promise<{ status: string; lastUpdatedAt: Date }>;
}
```

`Shipment.cost` (already existing) is populated from `getRate()`'s own
result once a carrier is registered; with none registered, `Shipment.cost`
continues to be entered manually exactly as it is today — additive,
never a required dependency.

## Scope lenses

**The actor with three tables** — an `IdentityProvider`'s external
assertion resolves to doc 20's existing `User`, never a new actor kind; a
`ShippingCarrier` is a typed provider, not a counterparty of its own.
**The principal with no permission key** — n/a: both ports authenticate
*this repository* to a third party (identity verification, carrier API
calls), not the reverse.
**The grant that ends itself** — an `IdentityProvider` registration can be
revoked (disabling that login method) without affecting existing
password-based accounts; a `ShippingCarrier` credential rotates via the
same encrypted-credential discipline `OutboundConnector` already
establishes.
**Whose rows, and which columns** — an SSO-resolved `User` gets exactly
the same row-level visibility any other `User` in that role gets — SSO
changes *how* someone authenticates, never *what* they can see once
authenticated.
**The threshold nobody approves alone** — a shipping-rate quote commits no
money by itself; the resulting `Shipment.cost` still flows into
`OrderEconomics` (doc 68) under its own existing rules, unchanged.
**Authority and blast radius** — registering a new `IdentityProvider` is a
real trust decision (a misconfigured SAML endpoint could let an
unintended email domain log in) — gated by `settings.sso.manage`,
audited old/new configuration value.
**Audience is a capability, not an address / Request or record / Dry run
before live** — n/a beyond what each port's own calling context already
answers (a login attempt, a rate quote).
**The movement with no address** — a `ShippingCarrier.getRate()` call
always names its own `originLocationId` explicitly, never a
default-location fallback, the identical discipline every other
location-aware call in this repository already follows.
**Three silhouettes** — Solo: unlikely to need either. Chain/Organization:
SSO is a real enterprise-client requirement; carrier integration is a
real fulfillment-scale requirement — both become relevant at exactly the
scale where a client already has an IT department mandating SSO or ships
enough volume to need live carrier rates instead of manual entry.
**The absent collaborator** — both ports degrade to today's exact existing
behavior with nothing registered — password login continues, manual
shipment cost entry continues.
**The second copy of the write** — an SSO login resolves to an existing
`User` by email/externalId, never creating a duplicate account for a user
who already has a password-based one (matched by email, with an explicit
merge/link step if both exist).
**The hundred-thousandth row / The reversal document / The undo fan-out /
The version stamp** — n/a: both are stateless provider calls, no new
high-volume table.
**The erasure the ledger cannot obey** — n/a beyond doc 20's own existing
answer for `User`; a carrier's own tracking data is retained per
`Shipment`'s own existing retention rule.
**The failure path** — an `IdentityProvider` verification failure falls
back to "this login method is unavailable," never silently granting
access; a carrier API failure surfaces as a visible error on the
shipment screen, with manual entry remaining the fallback.

## Work orders

**WO-128.1 — `IdentityProvider` interface + registry**, one
implementation per SSO protocol/vendor as a real client requirement names
it (never speculatively pre-built for a vendor nobody has asked for).
**WO-128.2 — `ShippingCarrier` interface + registry**, same rule.
**WO-128.3 — permissions**: `settings.sso.manage`,
`settings.carriers.manage`.

## Acceptance

- An organization with no `IdentityProvider` registered continues to log
  in via password exactly as today.
- An order with no `ShippingCarrier` registered continues to record
  `Shipment.cost` manually exactly as today.

## Out of scope

Implementing a specific SSO vendor or carrier today — this document adds
the seam; a specific implementation ships once a real client names the
vendor, per this repository's own "write a typed interface once a real,
repeated need exists" rule (doc 36).
