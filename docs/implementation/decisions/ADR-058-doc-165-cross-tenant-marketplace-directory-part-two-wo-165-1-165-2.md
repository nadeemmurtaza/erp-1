# ADR-058 — Doc 165 (cross-tenant marketplace directory), part two: WO-165.1/165.2/165.6 built; WO-165.3/165.4/165.5 deferred together as ADR-047 already scoped them; the publisher credential is ops-issued, not self-service; `enforceSso` gates by legacy `User.role`, exempting whoever turned it on

[← Decision log](../DECISIONS.md)


### Context

ADR-047 recorded doc 165's design without building it. This session built
the work orders ADR-047's own Consequences already named as immediately
buildable with no external dependency (WO-165.1, the schema; WO-165.6, the
`enforceSso` column) plus WO-165.2 (the publish API and its erp-1 admin
screen), and left WO-165.3/165.4/165.5 exactly where ADR-047 already put
them — blocked on nID's own OIDC surface, in a repository
(`nadeemmurtaza/nID`) not attached to this session. Two questions doc 165's
own text does not fully answer came up during the build and needed a
decision: who issues a `MarketplacePublisherCredential`, and which accounts
are exempt from `enforceSso`.

### Options considered

**Credential issuance:**
1. **Self-service** (doc 165 §2's own wording: "the tenant generated
   once") — rejected: doc 166's own already-built mechanism
   (`MarketplaceCredentialsController`, `OpsAuthGuard`,
   `RequireOpsPermission('platform.marketplace.manage')`) is ops-only, and
   building a second, tenant-facing issuance path would be a duplicate
   implementation of the exact credential doc 166 already mints, the kind
   of drift CLAUDE.md's search-before-creating rule exists to prevent.
2. **Mirror doc 166's ops-only mechanism, erp-1 reads the issued credential
   from server-side env** — selected. Matches doc 14's
   `ManagedServicesService` pattern exactly: `MARKETPLACE_API_URL`/
   `MARKETPLACE_API_KEY`, never sent to the browser bundle,
   `ServiceUnavailableException` when unconfigured. A documented deviation
   from doc 165's own §2 wording, not a silent one.

**`enforceSso`'s scope and its escape hatch:**
1. **Block every account's password login** — rejected: `/auth/login` is
   the same route a storefront customer signs in through
   (`AuthService.login()` has no separate staff endpoint), so this would
   lock out every customer the moment any tenant enabled SSO for their own
   staff — a severe, undocumented regression doc 165's own text does not
   ask for ("erp-1 staff login" is the phrase used throughout §3).
2. **Gate on `User.roleAssignments` (the real RBAC)** — considered,
   rejected as unnecessarily indirect: the legacy `role: UserRole` enum
   (`CUSTOMER`/`STAFF`/`TAILOR`/`ADMIN`) already reliably distinguishes a
   customer from a staff account — `SsoService.resolveOrProvision()` itself
   sets `role: 'STAFF'` on every SSO-provisioned account, and the schema's
   own comment says a public signup is always assigned `CUSTOMER`. Reusing
   this field needed no new query against the grants table.
3. **A dedicated `User.isBreakGlassAdmin` flag** — rejected: doc 165's own
   text says "the one break-glass admin doc 161's own design already
   assumes exists" without naming a concrete mechanism, and inventing a new
   column for it would be exactly the kind of un-asked-for schema addition
   CLAUDE.md's "no speculative functionality" rule forbids.
4. **Exempt `SsoConnection.createdByUserId`** — selected. The admin who
   flips `enforceSso` to true is, by definition, the one person who must
   never be locked out by their own change — otherwise a misconfigured
   connection (wrong issuer, an outage at the identity provider) would be
   unrecoverable without direct database access. `createdByUserId` already
   exists on the row for exactly this kind of accountability, needs no new
   field, and gives a single, auditable, self-consistent answer to "who is
   the break-glass admin" grounded in what actually got built rather than
   what doc 165 assumed.

### Decision

Built: the full WO-165.1 schema (`MarketplaceListing`,
`MarketplaceViewerProfile`, `MarketplaceEngagement`, alongside doc 166's
`MarketplacePublisherCredential`); WO-165.2's platform publish API
(`MarketplaceListingsController`/`Service`, upsert on
`[tenantId, externalRef]`, `getOwnedOrThrow` toxic-pair check, auto-delist
on credential revocation) and erp-1's thin proxy (`MarketplaceModule`, off
by default, `catalog.manage`-gated, mirroring `ManagedServicesService`) plus
its admin "Publish to marketplace" screen; WO-165.6's
`SsoConnection.enforceSso` column, `AuthService.login()`'s guard clause
(refuses password sign-in for `role !== 'CUSTOMER'` once any `ACTIVE`
connection has `enforceSso: true`, except that connection's own
`createdByUserId`), and the admin toggle on the connection's own settings
screen. WO-165.3, WO-165.4 and WO-165.5 are untouched, exactly as ADR-047
already scoped them — not re-litigated here, per this repository's own "do
not repeatedly revisit a settled decision without new evidence" rule: no
new evidence about nID's OIDC surface exists this session.

### Reasoning

Every deviation above traces to a real, already-built artifact rather than
an assumption: the ops-only credential path exists in code today
(`marketplace-credentials.controller.ts`), so erp-1's side had to be built
against what actually gates that credential, not against doc 165's own
description of it. The `enforceSso` exemption traces to a field
(`createdByUserId`) that already exists on `SsoConnection` for auditing —
reusing it for the break-glass exemption needed no new column and kept the
change to "a column and a guard clause," exactly the scope doc 165's own
§3 asks for. Deferring WO-165.3/165.4/165.5 together, rather than trying to
carve out a partially-unblocked slice (e.g., building an inbound
"marketplace calls into erp-1" endpoint ahead of the OIDC client), was
judged and rejected during this session's own scoping: it would introduce a
novel, security-sensitive inbound surface with no existing precedent and no
reviewer available to check it against a real nID contract — worse than
waiting.

### Consequences

- A tenant with no `MarketplacePublisherCredential` configured sees no new
  behavior: `marketplace` is `offByDefault` in `modules.registry.ts`, and
  its nav entry, routes and controller are all gated the same way
  `managed-services` already is.
- `enforceSso` is additive and defaults to `false` — every existing
  deployment's login screen is byte-identical until an admin explicitly
  opts in per connection, restated from doc 161's and doc 165's own
  acceptance criteria.
- The exemption is per-connection, not global: an org running two
  enforced `SsoConnection` rows has two independent break-glass admins,
  one per connection's own `createdByUserId`. This was not named as a
  goal in doc 165 but falls out correctly from reusing the existing field
  rather than adding a new one.
- WO-165.3/165.4/165.5 remain named, not silently dropped: doc 165's own
  status blockquote and `docs/implementation/README.md`'s entry are both
  updated to state exactly what is built versus still blocked, so a future
  session (or one with `nadeemmurtaza/nID` attached) has an accurate
  starting point rather than rediscovering this scoping from scratch.
- `MarketplaceViewerProfile`/`MarketplaceEngagement` exist as tables with
  no reader or writer yet — intentional, matching WO-165.1's own framing
  as one work order bundling all four models, and this repository's
  established precedent (doc 18.5's EDI deferral) for shaping a genuinely
  blocked future phase so a real request is not a design exercise.

### Status
**Accepted.**
