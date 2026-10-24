# 170 — Layer 1: the stable core is reused as it stands; these are the only deltas

> **Status: proposed (2026-09-27), not yet built.** Almost all of Layer 1 is
> already built and is reused with **zero change** (§1). The deltas this
> program needs are few and each is named with the file it touches: four
> tenant permission keys and two control-plane keys (§2, each grepped against
> the existing catalogues first), four principal-type deltas (§3), tenant-side
> enforcement of doc 39's `SupportAccessGrant` plus purpose-scoping (§4), a
> currency-neutrality sweep the UAE makes mandatory (§5), and the runtime
> tenant legal identity that 50,000 SMEs on one image require (§6, which needs
> its own ADR and is **not** decided here).

## 1. Reused with zero change

Every row below was read in this pass; "zero change" means no edit to the
named file for this program.

| Capability | Real code | Why no change is needed |
|---|---|---|
| Authentication | `JwtAuthGuard`, `jwt.strategy.ts`, `auth.service.ts` (`core/auth/`) | Every SME user is an ordinary `User` in its own tenant database |
| Authorization | `PermissionsGuard` (`core/auth/guards.ts`), `@RequirePermission`, `PermissionsResolverService.resolveForUser()` (`permissions.service.ts:42`) | New capabilities are new keys in the catalogue, not new guard logic |
| Role hygiene | `TOXIC_PERMISSION_PAIRS`, `ADMIN_LOCKED_PERMISSIONS` (`packages/shared/src/permissions.ts`), `RolesService.create()/.update()` | §2 adds no toxic pair (reasoned per key) |
| Machine keys for agents/scripts | `ApiKey` (doc 163), `NON_DELEGATABLE_PERMISSIONS` (`packages/shared/src/api-keys.ts:109`) | Effective access = key scopes ∩ owner's live permissions; §2 adds one key to the non-delegatable list |
| Audit | `AuditService.record()` (best-effort) and `.recordEvidence(tx, …)` (evidence-class, ruling 9) — `core/audit/audit.service.ts` | Every new state change in this program declares its class at the call site |
| Events | `EventBusService`, `OutboxDispatcher` (`core/events/`), `@OnDomainEvent` | New events are catalogue entries (`domain-events.ts`), additive per its own header |
| Client idempotency | `IdempotencyKey` (`idempotency.prisma`, doc 157) | Reused for every new mutating route that a client may retry |
| Module loader | `FEATURE_MODULES` (`modules/modules.registry.ts`), `AppConfigService.isModuleEnabled()`, `MODULES` env, `GET /meta` (`core/config/meta.controller.ts`) | A new module is one registry line and one `MODULE_PACKS` line |
| Extension points | `ExtensionPointsModule` (`core/extension-points/extension-points.module.ts`, `@Global`) | Adding `CanonicalRecordSinkRegistry` (doc 172 §8) is an additive provider, the same edit every registry before it made |
| Feature flags | `FeatureFlagsService.isEnabled()` | Reused as-is inside tenants (doc 171) |
| Settings | `SettingsService`, `DEFAULT_SETTINGS` (`core/settings/settings.defaults.ts`) | §6 extends one setting's shape |
| Storage | `StorageService` / `StorageDriver` | Raw ingested files land here (doc 162 §3) |
| AI | `AiService` / `AiProvider`, `AiFeature.IMPORT_CLEANUP`, `PLANNING_NARRATION` | Mapping suggestions reuse `IMPORT_CLEANUP` (doc 172 §4) |
| Document numbers | `documentNumber()` (`core/settings/document-number.ts:31`) | Node-folding already makes independently generated numbers merge-safe |
| Action hub | `ActionHubSource` (`core/action-hub/action-hub-source.ts`) | Ingestion review items register as a source (doc 172) |

## 2. Permission keys — checked against both catalogues first

**Checked first.** `PERMISSION_CATALOG` (`packages/shared/src/permissions.ts`) holds 125 keys today; none
starts with `connectors.`, none is `planning.recommendations.*`, and no key
names ingestion, import review, or recommendation decisions (grep over
`PERMISSION_CATALOG`). `apps/platform/src/core/security/ops-permissions.ts`'s
`PLATFORM_PERMISSIONS` has nine keys; none names releases or manifests. Docs
36/160/162 already **reserve** the name `connectors.manage` ("doc 36's own
existing permission") — it was specified and never added, so this program
adds it under the name those documents already use rather than inventing a
second.

### 2.1 Tenant keys (`PERMISSION_CATALOG`)

```ts
// packages/shared/src/permissions.ts — additive entries
{
  // Docs 36/160/162 reserved this name; added now. Registers a connector,
  // installs its credential (an OAuth refresh token, SFTP credentials, an
  // inbound signing secret) and edits field mappings in DRAFT.
  key: 'connectors.manage',
  label: 'Connect external systems, and install or rotate their credentials',
  category: 'Connections',
  sensitivity: 'high',
},
{
  key: 'connectors.ingestion.review',
  label: 'See imported data waiting for review, its confidence and its errors',
  category: 'Connections',
  sensitivity: 'medium',
},
{
  // Confirms a mapping version, releases a batch held for schema drift,
  // resolves a record held at advisory. The human confirmation doc 172 §6
  // requires before a simulation is trusted. Evidence-class audited.
  key: 'connectors.ingestion.confirm',
  label: 'Confirm that imported data describes this business, so it can be used in planning',
  category: 'Connections',
  sensitivity: 'medium',
},
{
  // Accept / modify / dismiss a ranked recommendation (doc 174). Never
  // executes anything: the draft it opens still needs the owning module's
  // own permission (transfers.manage, purchasing.manage, …) at the act.
  key: 'planning.recommendations.decide',
  label: 'Accept, modify or dismiss a recommended recovery action',
  category: 'Purchasing',
  sensitivity: 'medium',
},
```

- **One more key, owned elsewhere.** Doc 181 adds `privacy.requests.manage`
  (sensitivity `high`, `system-admin` group, seeded to `ADMIN` so the workflow
  is reachable on day one — a deployment may move it to a dedicated privacy
  role) with its request workflow;
  it is specified there because its only consumer is that workflow.
- **Groups.** A new `PERMISSION_GROUPS` entry `connections` ("Connections &
  data import") holds the three `connectors.*` keys;
  `planning.recommendations.decide` joins the existing `purchasing` group beside
  `planning.propagation.view`, where doc 144 put the planning key.
- **Seeds, all the way through.** `ROLE_PERMISSION_SEED.ADMIN` gains all four.
  `STAFF` gains `connectors.ingestion.review` only (seeing why data is held is
  day-to-day; confirming it and installing credentials are not). This is the
  `seedPermissions()`-vs-`seedRoles()` trap `CLAUDE.md` names: the plan is not
  done until `apps/api/prisma/seed.ts` grants these to real roles, verified by
  `GET /auth/me` on a seeded ADMIN.
- **Non-delegatable.** `connectors.manage` joins `NON_DELEGATABLE_PERMISSIONS`
  with the reason `pos.manage` already states for the same shape: *"Installs a
  credential for an external system — a second credential that would survive
  this key being revoked and its owner being deactivated."* Its routes are
  also `@SessionOnly()`, like `settings.sso.manage`.
- **Toxic pairs — none added, reasoned.** `connectors.manage` +
  `connectors.ingestion.confirm` lets one person map data and confirm it. For a
  Solo SME that one person is the owner, and refusing the pair would make the
  product unusable (ruling 16: a control short of people degrades into a
  recorded exception, never a wall). The confirmation is instead recorded
  evidence-class with the confirmer and whether the same person authored the
  mapping version (doc 172 §6), so the combination is visible, counted and
  reportable rather than forbidden. `planning.recommendations.decide` +
  `transfers.manage` is not toxic: deciding and then executing a transfer is
  the ordinary workflow, and the transfer itself is still a RECORD audited by
  `transfers`.

### 2.2 Control-plane keys (`PLATFORM_PERMISSIONS`)

```ts
// apps/platform/src/core/security/ops-permissions.ts — additive
'platform.releases.manage',   // register a release, set a tenant's ring/pin, propose a rollout change (doc 171)
'platform.releases.approve',  // second approver for a money/stock-path release at 100% or a kill-switch clear (doc 171)
```

The split mirrors `platform.billing.manage`/`platform.billing.approve` (doc 153)
and `platform.flags.manage`/`platform.flags.approve_rollout` (doc 37) exactly:
the second key exists because the approve method refuses the proposer, not
because it is withheld from a role.

Doc 38 reserved `platform.resilience.view`, `.oncall` and `.tune` (WO-38.6) and
never added them. Doc 176 uses those names when its SLO surface is built,
placed in `PLATFORM_PERMISSIONS` because the surface is NEWAX hosting
operations', not a tenant's.

## 3. Principal types — four deltas

`CLAUDE.md`'s "principal with no permission key" lens asks, for every actor
that is not a `User`, what it is checked against. This program introduces
four, and extends none of the existing key-hash principals (`TradingPartner`,
`PosTerminal`, `Node`, `ApiKey`, `PlatformOpsClient`).

### 3.1 An inbound push source (tenant side)

A POS or accounting vendor that *pushes* sales rather than being polled
authenticates as doc 132's `InboundWebhookEndpoint` — a per-endpoint signing
secret, HMAC-verified over the raw body exactly as `NidVerificationProvider`
verifies nID (`${timestamp}.${rawBody}`, `timingSafeEqual`). Checked against:
**nothing in `PERMISSION_CATALOG`**, by design — it is authenticated by
signature, and its entire reach is "create staged `IngestionRecord`s for its
own connector" (doc 172). It can never write a canonical row, never read
anything, and an unverified request writes nothing at all (the
`PaymentCallbackResult.verified` discipline, applied fail-closed from the
start — see doc 175 §3 for why fail-closed matters).

### 3.2 A national identity provider for SME users (UAE PASS)

UAE PASS is an OIDC identity provider, so doc 161's `OidcProvider` and
`SsoConnection` are the right mechanism — but doc 161's one load-bearing
control is wrong for it. `SsoConnection.allowedEmailDomains` is "the hard gate
… checked *before* any user lookup": safe for a workforce IdP where a company
owns a domain; meaningless for a national IdP where every citizen and resident
has an arbitrary email. Linking a UAE PASS sign-in to a `User` by email would
be account takeover by configuration — the exact threat
`settings.sso.manage`'s non-delegatable reason names.

The delta, additive to `sso.prisma`:

```prisma
enum SsoBindingMode {
  EMAIL_DOMAIN     // doc 161's existing behaviour, unchanged, the default
  SUBJECT_INVITE   // new: never match by email; a sign-in binds only to a
                   // User pre-invited by an admin, by the IdP's stable subject
                   // identifier, on first use of a single-use invite
}

model SsoConnection {
  // existing fields unchanged
  bindingMode SsoBindingMode @default(EMAIL_DOMAIN)
}

/// SUBJECT_INVITE only: the one-time link between an invited User and the
/// national IdP's subject id. Consumed exactly once; the unique subject is
/// what makes a second person's sign-in unable to land on this User.
model SsoSubjectBinding {
  id           String    @id @default(cuid())
  connectionId String
  userId       String    @unique
  subject      String?   // null until the invite is consumed
  inviteTokenHash String @unique
  invitedById  String
  expiresAt    DateTime
  consumedAt   DateTime?

  @@unique([connectionId, subject])
}
```

No JIT provisioning in `SUBJECT_INVITE` mode: a UAE PASS sign-in with no
consumed or live invite is refused before any `User` lookup, which keeps doc
161's own "refuse before lookup" property with a different key. This change is
security-critical and goes through the `security` review routing
(`docs/index/cross/model-routing.md`) before merge.

### 3.3 Emirates ID verification (the second `IdentityVerificationProvider`)

`IdentityVerificationProvider` (`identity-verification/identity-verification-provider.ts`)
has one implementation, `NidVerificationProvider` — Newax's own nID KYC
platform (not NADRA; see doc 168 §3). A UAE implementation — verifying an
Emirates ID through a licensed UAE KYC channel or UAE PASS's verified
attributes — is exactly the second implementation the interface's own header
comment foresees ("a different KYC vendor"). It needs **two additive** changes,
stated rather than hidden:

```ts
export interface IdentityVerificationStart {
  providerSubjectId: string;
  providerCaseId: string;
  status: 'PENDING';
  /** new, optional — a redirect-based provider (UAE PASS) sends the subject
   *  here; nID's OTP flow leaves it undefined, unchanged. The identical shape
   *  PaymentInitiation.redirectUrl already has. */
  redirectUrl?: string | null;
}

export interface IdentityVerificationProvider {
  // …
  /** now optional — nID implements it; a redirect provider does not. */
  submitOtp?(providerCaseId: string, code: string): Promise<void>;
}
```

Both are additive (an optional field, an optional method), module-local
(`identity-verification`, not core), and change nothing for `nid`. The
provider's `handleCallback` keeps the fail-closed `verified` rule. Whatever
the UAE channel's actual API is — which endpoint, which signature scheme — is
taken from that channel's own documentation when a contract names it, never
guessed here (doc 15's discipline).

### 3.4 NEWAX hosting-operations staff in the control plane

`apps/platform` authenticates only `PlatformOpsClient` — a key-hash principal
for tooling, with scopes on the row and "no role/seed system" (doc 39 status).
NEWAX's control plane is operated by people — doc 39's own "Newax's own
hosting-operations staff" — and doc 39 itself names the gap ("a true tenant
self-service portal is named, not invented"; "this control plane has no
tenant-login principal yet"). The delta is a staff sign-in for
`apps/platform` that reuses doc 161's OIDC design against **NEWAX's own
workforce IdP** (`EMAIL_DOMAIN` binding is correct there), resolving to the same
`PLATFORM_PERMISSIONS` scopes `OpsAuthGuard` already checks. Key-hash
`PlatformOpsClient` stays for automation. This is net-new code in
`apps/platform` (it has no staff login of any kind today), specified here and
built under doc 171's work orders because the release screens are its first
consumer.

## 4. Expiring grants for the program's highest-trust operations

Doc 39's `SupportAccessGrant` is the right shape — every grant expires
(`PLATFORM_SUPPORT_GRANT_MAX_HOURS`), every use appends to `accessedAt`, a
DEDICATED tenant's grant needs a second approver, and the engineer a grant is
for can never approve it (`support-access.service.ts`). Two things are missing
for this program.

### 4.1 The grant is not enforced where the data is

`SupportAccessService.recordAccess()` checks liveness in the control plane
(`support-access.service.ts:82–97`), but **nothing in `apps/api` consults a
grant** (grep: no reference to support access anywhere under
`apps/api/src`). The tenant deployment cannot tell a support engineer holding a
live grant from one holding an expired one, because the door itself — how the
engineer actually signs into the tenant — is not modelled. For a PDPL- and
ISO 27001-mapped offer (doc 181) that is the gap an auditor finds first.

The delta keeps doc 39's own acceptance criterion intact ("removing the entire
control plane… requires zero code changes inside that deployment"):

1. **The control plane mints, the tenant verifies, and neither calls the
   other.** For a live, approved grant, `SupportAccessService` mints a
   short-lived support token (≤ 15 minutes, re-minted while the grant lives),
   signed with a control-plane private key and carrying `grantId`, `tenantId`,
   `expiresAt`, and the grant's purposes (§4.2).
2. **`apps/api` gains one authentication path**, `SupportSessionStrategy`
   (`core/auth/`), that verifies the signature against
   `SUPPORT_ACCESS_PUBLIC_KEY` (a new optional env var) and the embedded expiry.
   **With the variable unset the strategy refuses everything** — a deployment
   with no control plane simply has no support door, which is the fail-closed
   reading of doc 39's own "zero code changes" test.
3. **The session acts as a fixed, login-disabled support `User`** created at
   provisioning (so every `AuditLog.actorId` resolves), whose effective
   permissions are exactly the purposes' keys — never a
   `NON_DELEGATABLE_PERMISSIONS` key, whatever the token says.
4. **Every request under a support session writes an evidence-class audit row**
   (`AuditService.recordEvidence()`) naming the `grantId` — so the tenant's own
   audit log proves what the control plane's `accessedAt` array only asserts.

Revocation lag is bounded by the token lifetime (≤ 15 minutes) and stated as
such; an immediate cut-off is `SUPPORT_ACCESS_PUBLIC_KEY` rotation, an
operator act.

### 4.2 A grant names what it is for

Today a grant is all-or-nothing. This program's own highest-trust operations
are narrower, so the grant gains a purpose list (additive to `platform.prisma`):

```prisma
enum SupportAccessPurpose {
  READ_ONLY_DIAGNOSTICS        // view config, staged batches, errors — no write
  INGESTION_MAPPING_ASSIST     // draft a mapping version on the SME's behalf; never confirm it
  CONNECTOR_CREDENTIAL_ROTATE  // rotate (never read) a connector credential
  TENANT_DATA_EXPORT           // run TenantExportService for the tenant
  CUTOVER_SIGNOFF              // NEWAX's implementation lead's and program owner's signatures on a system-of-record cutover (doc 179 §5.3) — sign only
}

model SupportAccessGrant {
  // existing fields unchanged
  purposes SupportAccessPurpose[]   // at least one; validated at issue()
}
```

Two operations are deliberately **not** grantable: confirming an ingestion
mapping (`connectors.ingestion.confirm` is the SME's own attestation that the
data describes its business — support may draft, never attest) and deciding a
recommendation. A support engineer who confirms a mapping is manufacturing the
customer's consent.

## 5. The currency-neutrality sweep (mandatory before the first UAE tenant)

`brand.ts` made currency a value ("A client in Dubai or London is a change to
this block, not a project", `brand.ts:97–100`). The UAE is the first time that
promise is tested, and it fails in specific, verified places:

| Defect | Where | Effect on a UAE tenant |
|---|---|---|
| Schema default `"PKR"` | `Order.currency` (`orders.prisma:41`), `Payment.currency` (`payments.prisma:24`), `Supplier.currency` (`purchasing.prisma:15`), `PurchaseOrder.currency` (`:107`), `SupplierBill.currency` (`:233`), `Expense.currency` (`finance.prisma:49`), `GiftCard.currency` (`giftcards.prisma:27`), `WalletAccount.currency` (`wallet.prisma:65`) | Any create path that omits `currency` stamps an AED amount as PKR |
| Create paths that omit `currency` | `PaymentsService.createForOrder()` (`payments.service.ts:105–113`); `Order` placement (`orders.service.ts` sets no `currency`) | Every UAE order and payment row is labelled PKR |
| Code literal `'PKR'` | `finance.service.ts:234` (`dto.currency ?? 'PKR'`), `expense.dto.ts:20` (`default: 'PKR'`), `settings.defaults.ts:456` (`FinanceDefaultCurrency: 'PKR'`) | Expenses default to PKR |
| Currency word in identifiers and text | `rupeesSpentMinor` (doc 173), `marginBeforePaisa`/`marginAfterPaisa` (`MarkdownSuggestion`, `inventory.prisma`; `markdown-suggestion.ts`), `price_pkr`/`compare_at_pkr` (`ProductImportService` `COLUMNS`), "paisa" in the narration prompt and an action description | Misleading field names in an AED product; a CSV contract that says PKR |
| Scale of the word-level debt | 370 matches for "paisa" and 151 for "rupee" (case-insensitive) across `apps/*/src` + `packages/*/src` | Mostly comments; a ratchet, not a rewrite |

The fix, in three parts:

1. **Every create path sets `currency: BRAND.locale.currency`** (or the
   document's own currency, R16) explicitly — `PurchasingService` already does
   (`purchasing.service.ts:499`), as do `QuoteService`/`InvoiceService`/
   `WalletService`; `PaymentsService.createForOrder()` and order placement join
   them.
2. **The eight schema defaults are dropped** in one hand-written, forward-only
   migration (`ALTER TABLE … ALTER COLUMN "currency" DROP DEFAULT`), so a
   future create path that forgets `currency` fails to compile against the
   Prisma client instead of silently writing PKR. Existing rows keep the value
   they were written with (House Rule 7).
3. **A ratchet, not a big-bang rename.** A `scripts/check-currency-neutrality.mjs`
   run by `pnpm lint`, derived from `BRAND.locale.currency` and a small list of
   minor-unit words, carrying a declared baseline of today's count that may
   shrink and may not grow — the exact pattern `check-contrast`/`check-links`
   already use for their own debt. New code cannot add a currency word; old
   comments are paid down opportunistically. Identifiers the program touches
   anyway (`rupeesSpentMinor`, `price_pkr`/`compare_at_pkr` via a
   `price_major`/`compare_at_major` alias period) are renamed in their own work
   orders.

**Arabic, by the same logic.** `brand.ts` already supports a second,
right-to-left locale (`locales: ['en','ur']`, `rtlLocales: ['ur']`) — Urdu
exercised the RTL machinery, so a UAE build's `['en','ar']`, `['ar']` rides on
proven code. Catalogue copy is already locale rows (`ProductTranslation.locale`),
so Arabic is a new row value, not a column. What is **not** locale-neutral, and
must become translation rows or locale-keyed data (ADR-006) before an Arabic
build: `PaymentProvider.labelUr/descriptionUr` (`payment-provider.ts:77/80`,
doc 175), `StoreSettings.nameUr` and `BRAND.identity.nameUr`,
`ProductImportService`'s `name_ur`/`description_ur` columns, the Urdu branch of
`core/notifications/email/copy.ts`, and `InvoiceLine.nameEn`. The web app's
`apps/web/messages/ur.json` (745 lines) needs an `ar.json` sibling — translation
work, not code.

## 6. The SME's legal identity at runtime — bounded, and needing its own ADR

At 50,000 tenants on one NEWAX image, the fields an SME's own tax invoice prints —
legal name, TRN (tax label + number), registration label + number, address,
banking, logo — cannot be compiled per tenant from `brand.ts`. Today:

- `SettingKey.Store` is already a **runtime** row per tenant database, seeded
  *from* `BRAND` (`settings.defaults.ts:362–368`), but its `StoreSettings` type
  holds only `nameEn`, `nameUr`, `supportPhone`, `supportEmail`, `whatsapp`.
- `apps/web/src/config/business-profile.ts` reads `BRAND.legal.taxLabel/
  taxNumber/registrationLabel/registrationNumber` and `BRAND.banking` at
  compile time, "flattened for the ~60 call sites that read them".

The bounded change: `brand.ts` keeps **the product's own identity (NEWAX's,
as sold in that market) and the UAE locale block** (one build per country, not per SME — dozens of images at
international scale, never 50,000); the SME's **legal identity** moves into its
own runtime `SettingKey.Store` (extended with `legalName`, `taxLabel`,
`taxNumber`, `registrationLabel`, `registrationNumber`, `address`, `banking`),
and `business-profile.ts`'s legal/banking fields read that setting through the
API instead of `BRAND`. The e-invoice seller fields (doc 169 §8, IBT-027/031)
read the same setting.

**Why this is not decided here.** It changes what `ENTERPRISE-SCALE.md` Br1's
wording means in practice ("the brand is resolved at build time from
`brand.ts`") by drawing a line inside `brand.ts` between *product brand* and
*tenant legal identity*. `DECISIONS.md`'s own rule is that a settled decision
is reopened only with new evidence and in its own entry; the 50,000-tenant,
single-image requirement is that evidence, and WO-168.3 opens the entry. Until
it is decided, a pilot tenant's legal identity can be carried in its runtime
setting for display, and **no tax invoice is issued natively** — which is
exactly Wave 1's connect-only posture (doc 179), so the pilot is not blocked.

## Scope lenses

Lenses that the ingestion and settlement capabilities raise are answered in
full in docs 172 and 175. The lines below answer what **this** document's own
artifacts introduce — the six keys, the four principals, the grant changes,
the sweep and the runtime identity.

**The actor with three tables** — the support principal is a login-disabled
`User` row (so `AuditLog.actorId` resolves) plus a control-plane
`SupportAccessGrant`; a UAE PASS user is an ordinary `User` plus one
`SsoSubjectBinding`; an inbound push source is an `InboundWebhookEndpoint`,
never a `User`.
**The principal with no permission key** — the inbound push source is checked
against nothing in `PERMISSION_CATALOG` and can only create staged records
(§3.1); the support session is checked against exactly its purposes' keys,
minus every non-delegatable key (§4.1).
**The grant that ends itself** — a support token ends in ≤ 15 minutes and its
grant at `expiresAt`; a UAE PASS invite at `SsoSubjectBinding.expiresAt`; a
connector credential at its OAuth `expiresAt` (doc 160). Deactivating a `User`
(ruling 6) also removes their unconsumed invites in the same transaction.
**Whose rows, and which columns** — `connectors.ingestion.review` sees staged
records and their errors, never a connector's encrypted credential (write-only,
as `SsoConnection.credentialEncrypted` already is).
**The threshold nobody approves alone** — a DEDICATED tenant's support grant
keeps doc 39's second approver; a money/stock-path release keeps doc 171's.
**The toxic pair, caught at grant or at act** — none added (§2.1, reasoned);
the one refused combination here is structural — a support session can never
hold `connectors.ingestion.confirm` (§4.2).
**Authority and blast radius** — `SUPPORT_ACCESS_PUBLIC_KEY` is the widest
setting introduced: whoever controls its private half can open every tenant's
support door. It is an operator secret held only by the control plane, rotated
by NEWAX hosting operations, and its rotation is the emergency revocation path.
**Audience is a capability, not an address** — n/a: no message is introduced
here.
**Request or record — classify every write** — issuing a grant, an invite, a
key: REQUESTs, refusable. A support-session request's audit row: a RECORD,
written evidence-class in the same transaction as the act it describes.
**The movement with no address** — n/a: no stock or cash write.
**Four hours down, the counter stays open** — control plane down: no new
support tokens are minted and live ones expire within 15 minutes; tenants keep
running. UAE PASS down: SME users with a password keep signing in; UAE-PASS-only
users cannot, and that is shown on the sign-in screen, never masked.
**The unwritten posting rule / Every column or none / The period that already
moved** — n/a: no money fact is written by this document's artifacts; the
currency sweep changes which currency code a row carries, never an amount.
**The second legal entity** — §6 is this lens applied to 50,000 tenants: each
SME's tax label and number are its own runtime values.
**Dry run before live** — the currency sweep's migration is proven against a
copy of production data (D1): a count of rows per `currency` value before and
after must be identical.
**Click the number** — n/a: no figure is introduced.
**Three silhouettes, and the day the tier above appears** — every artifact
here is edition-independent.
**The absent collaborator** — `identity-verification` off: no Emirates ID
check, and doc 155's registry resolves every user unverified (fail-closed);
`SUPPORT_ACCESS_PUBLIC_KEY` unset: no support door.
**The second copy of the write** — `SsoSubjectBinding.inviteTokenHash @unique`
and `consumedAt` make an invite single-use; `@@unique([connectionId, subject])`
stops one national identity binding to two users.
**The hundred-thousandth row** — support audit rows grow per request during a
live grant only; bounded by grant hours.
**The adoption test** — n/a: no generated code or number.
**The reversal document, not the reversal flag** — revoking a grant is a
`revokedAt` stamp, never a delete; unbinding a UAE PASS identity is a new
invite after a recorded unbind, never an edit of `subject`.
**The undo fan-out** — revoking a grant: support tokens stop being minted
(automatic), live ones lapse within 15 minutes (automatic), key rotation for
immediacy (human, NEWAX hosting operations).
**The version stamp** — each support audit row names the `grantId` and its
purposes as they were when the token was minted.
**The erasure the ledger cannot obey** — `SsoSubjectBinding.subject` is a
national identifier; on `User` erasure it is pseudonymised in place (ruling 1),
never left behind.
**The failure path, and who is allowed to walk it** — a refused support token
lands in the tenant's `AuditLog` with the reason; NEWAX hosting operations see it through
the control plane's grant history, keyed by ticket reference.

## Work orders

**WO-170.1 — Permission keys**: the four tenant keys, the `connections` group,
`ROLE_PERMISSION_SEED` grants, `connectors.manage` in
`NON_DELEGATABLE_PERMISSIONS`, `seed.ts` updated; the two control-plane keys.
`permissions.spec.ts` and `api-keys.spec.ts` extended.
**WO-170.2 — Inbound push principal**: doc 132's `InboundWebhookEndpoint`
built with fail-closed HMAC verification, scoped to staged records (built with
doc 172's WO-172.3).
**WO-170.3 — Currency-neutrality sweep**: explicit `currency` on every create
path, the `DROP DEFAULT` migration, `scripts/check-currency-neutrality.mjs`
with its baseline and `--self-test`, wired into the root `lint` script.
**WO-170.4 — UAE PASS binding mode**: `SsoBindingMode`, `SsoSubjectBinding`,
the refuse-before-lookup path; security review routing before merge.
**WO-170.5 — `IdentityVerificationProvider` additive changes** and the UAE
implementation once a contract names the channel.
**WO-170.6 — Tenant-side support sessions**: `SupportSessionStrategy`,
`SUPPORT_ACCESS_PUBLIC_KEY`, the provisioned support `User`, evidence-class
audit per request; `SupportAccessGrant.purposes`; token minting in
`SupportAccessService`.
**WO-170.7 — Control-plane staff sign-in** (`apps/platform`, OIDC, NEWAX's
workforce IdP), resolving to `PLATFORM_PERMISSIONS`.
**WO-170.8 — Arabic enablement inventory → tickets**: the `*Ur`/`nameEn` list
in §5 turned into per-module translation-row changes; `ar.json`.
**WO-170.9 — Runtime legal identity**, gated on the ADR WO-168.3 opens.

## Acceptance

- A seeded ADMIN's `GET /auth/me` lists all four new keys; a seeded STAFF's
  lists `connectors.ingestion.review` only.
- Minting a personal API key carrying `connectors.manage` is refused with the
  recorded reason.
- With `SUPPORT_ACCESS_PUBLIC_KEY` unset, every support token is refused; with
  it set, an expired or forged token is refused and a valid one yields exactly
  its purposes' keys — proven by spec, including a token claiming a
  non-delegatable key.
- A UAE PASS sign-in whose subject has no consumed invite is refused before any
  `User` query runs, proven by a spec asserting the query count.
- After WO-170.3, creating an `Order` and a `Payment` on a deployment whose
  `BRAND.locale.currency` is `AED` writes `AED`; `pnpm lint` fails when a new
  "paisa"/"rupee"/`PKR` occurrence is added to application code.

## Out of scope

A shared principal type unifying `TradingPartner`/`PosTerminal`/`Node`/`ApiKey`
(the lens index names its absence; not this program's to build). Doc 34's
organisation-level `ApiClient` (deferred by ADR-037; not reopened). Deciding
Br1's wording (§6 — its own ADR). Translating the product into Arabic (a
content task; WO-170.8 only inventories the code blocking it).
