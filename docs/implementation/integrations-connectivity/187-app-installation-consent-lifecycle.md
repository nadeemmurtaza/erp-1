# 187 — Installing an app: the consent screen, the second approver, upgrades that ask again, and uninstall that always works

> **Status: proposed, not yet built.** No `AppInstallation`,
> `AppInstallationConsent`, `app-installations` module, `apps.manage` or
> `api-access.approve_scope` exists (grep, `main` at `642b2831`). The
> installation's credential is doc 189's `ApiClient`, which completes doc
> 34. Doc 34 is itself unbuilt, deferred by ADR-037, and reopened by ADR-073
> because an installed app is exactly "an integration [that] must outlive
> the person who set it up" (ADR-037's own reopening condition). This is one
> of the two documents in the program carrying the **full scope-lens
> pass**. Part of [doc 184](./184-app-platform-overview-and-remote-only-decision.md)'s
> program.

## Implementation plan

### Objective
A tenant admin installs any app from the directory in one flow. First comes
a consent screen that names every permission key, the data scope, every
event topic, any provider capability and the price. A second person
approves when the grant touches money, cost or other people's data.
Installation creates a scoped, individually revocable identity that
outlives the installer. Upgrades that widen access ask again. Uninstall
revokes everything at once and is never blocked by any dependency.

### Existing state
- Identity: personal keys (`ApiKey`, doc 163) are built. They are owned
  by a `User`, capped by that person's live permissions, and die with
  them. There is no principal that survives its creator (ADR-037).
- Authorization: `JwtAuthGuard`/`PermissionsGuard`
  (`apps/api/src/core/auth/guards.ts`), fail-closed `decideApiKeyAccess()`
  (`core/auth/api-keys/api-key-access.ts`), `NON_DELEGATABLE_PERMISSIONS`
  and `@SessionOnly()` — all built.
- Grant-with-proof precedents: `OrgUnitGrantService.issue()`
  (`modules/people/orgstructure/org-unit-grant.service.ts`) refuses to confer a key
  the granter lacks — "you cannot confer what you were never given" — and
  has a `preview*` twin. `SupportAccessService.approve()` (`apps/platform`)
  refuses self-approval.
- Evidence audit: `AuditService.recordEvidence(tx, …)`
  (`core/audit/audit.service.ts`) — built.
- The tenant → platform proxy: `MarketplaceService`
  (`modules/supply-chain/marketplace/marketplace.service.ts`) — built.

### Required change
§1–§8 below.

### Files likely affected
New: `apps/api/prisma/schema/app-installations.prisma`;
`apps/api/src/modules/app-installations/**`
(`app-installations.module.ts`, `app-installations.service.ts`,
`app-installations.controller.ts`, `app-directory.client.ts`,
`app-consent.service.ts`, `app-installations.action-hub-source.ts`,
`app-status-feed.cron.ts` (doc 191), `app-conformance.service.ts` (doc
186)); `apps/web/src/app/(admin)/admin/(app)/apps/**`.
Changed: `apps/api/src/modules/module-packs.ts` (+`'app-installations': 'core'`);
`modules.registry.ts` (+ entry, `offByDefault: true`); `domain-events.ts`
(+5 events); `packages/shared/src/permissions.ts` (+3 keys, `connections`
group); `packages/shared/src/api-keys.ts` (non-delegatable additions, doc 189
§3); `core/extension-points/employee-offboarding.registry.ts` (§4.4);
`apps/web/src/components/admin/nav-registry.ts`; one forward migration
granting the new keys to the live `Admin` role (§8).

### Dependencies (reused)
Doc 189's `ApiClientsService`; `PermissionsResolverService.resolveForUser()`
and `.usersWithPermission()`; `AuditService.recordEvidence()`;
`EventBusService.publish(…, tx)`; `encryptSecret`/`decryptSecret`
(`@newax/shared/secret-crypto`) under `APP_ENCRYPTION_KEY`;
`ActionHubSource` (`core/action-hub/action-hub-source.ts`); the directory
proxy (doc 185 §6); doc 188's delivery engine. No new dependency.

### Risks
A consent screen that misstates the grant is worse than none, so the
rendered list and the enforced list come from one computation (§2). An
install that half-completes across two databases (platform record written,
tenant transaction failed) must never bill or grant (§3). An uninstall that
waits on anything external stops being a revocation, so it waits on nothing
(§6).

### Acceptance criteria, Out of scope, Scope lenses
The sections of those names at the end of this document.

## 1. What an installation is, in rows

An installation is **one tenant's grant to one app**. It lives entirely in
that tenant's own database. Four tenant-side rows and one core credential
make it up:

| Row | Owner | Holds | One writer |
|---|---|---|---|
| `AppInstallation` | `app-installations` | Which listing/version, status, the consented manifest snapshot, webhook URL and encrypted signing secret, the app's public keys | `AppInstallationsService` |
| `AppInstallationConsent` | `app-installations` | Every consent decision ever made about this installation — immutable evidence | `AppConsentService` |
| `AppInstallationTopic` | `app-installations` | The consented topics, indexed for fan-out (doc 188) | `AppConsentService` |
| `AppProviderBinding` | `app-installations` | Doc 190's per-installation provider switch | `AppProviderBindingsService` (doc 190) |
| `ApiClient` (+ its actor `User`) | core `auth` | **The enforced grant** — `permissionKeys` — and the credential's lifecycle | `ApiClientsService` (doc 189) |

**The grant is stored once, on `ApiClient.permissionKeys`**, where
`PermissionsGuard` reads it. `AppInstallationConsent` holds the
*evidence* of why the grant is what it is — what was shown, to whom, who
approved — never a second copy the guard could disagree with. Changing the
grant is one call, `ApiClientsService.setGrant(tx, clientId, keys)`, made
only by `AppConsentService` inside a consent transaction.

```prisma
// apps/api/prisma/schema/app-installations.prisma — tenant DB, module app-installations (core pack, off by default)

enum AppInstallationStatus { ACTIVE  SUSPENDED  UNINSTALLED }
enum AppSuspendedBy        { TENANT  PLATFORM }
enum AppUninstallReason    { TENANT_UNINSTALLED  LISTING_REMOVED  PUBLISHER_TERMINATED }

model AppInstallation {
  id                     String                @id @default(cuid())
  /// Platform AppListing id and slug — bare scalars: the listing lives in
  /// another database entirely (ADR-012's reasoning, one level up).
  listingRef             String
  listingSlug            String
  /// The platform's AppInstallationRecord id, returned by the preflight
  /// (§3 step 3). Unique: one platform record per installation.
  platformRecordRef      String                @unique
  versionRef             String
  version                String
  manifestSha256         String
  /// The manifest exactly as consented (the version stamp): re-renders the
  /// consent and explains the grant from stored fields alone.
  manifestSnapshot       Json
  /// Core ApiClient (doc 189) — core, always present, so a real FK is
  /// allowed (ADR-012 governs module↔module references, not module→core).
  apiClientId            String                @unique
  status                 AppInstallationStatus @default(ACTIVE)
  suspendedBy            AppSuspendedBy?
  suspendedAt            DateTime?
  suspendedReason        String?
  webhookUrl             String?               // null ⇔ the manifest subscribes to no topic
  /// 256 random bits, encryptSecret(APP_ENCRYPTION_KEY). Write-only: no
  /// admin read path returns it; only the app fetches it (doc 189 §2.3).
  webhookSecretEncrypted Bytes?
  webhookSecretRotatedAt DateTime?
  /// The app's current public signing keys [{kid, alg, publicKeyPem}] —
  /// refreshed by the status-feed poller on key-rotation versions (doc 191 §3).
  signingKeys            Json
  pricePlanKey           String?               // doc 192
  installedByUserId      String
  installedAt            DateTime              @default(now())
  firstTokenAt           DateTime?             // null ⇒ "waiting for the app to connect" (§3 step 6)
  uninstalledAt          DateTime?
  uninstalledByUserId    String?               // null when the platform removed it (uninstallReason says which)
  uninstallReason        AppUninstallReason?

  apiClient        ApiClient                @relation(fields: [apiClientId], references: [id])
  consents         AppInstallationConsent[]
  topics           AppInstallationTopic[]
  providerBindings AppProviderBinding[]
  conformanceRuns  AppConformanceRun[]

  @@index([status])
  @@index([listingRef])
}
// Hand-written in the migration (Prisma cannot express a partial index):
//   CREATE UNIQUE INDEX "AppInstallation_one_live_per_listing"
//     ON "AppInstallation" ("listingRef") WHERE "status" <> 'UNINSTALLED';
// One live installation of a listing per tenant — GitHub's own rule — and
// the "second copy of the write" guard for a double-clicked Install.

enum AppConsentKind     { INSTALL  UPGRADE  AUTO_UPGRADE  PRICE_CHANGE }
enum AppConsentDecision { PENDING_SECOND_APPROVAL  ACCEPTED  DECLINED  EXPIRED }

model AppInstallationConsent {
  id                      String             @id @default(cuid())
  /// Nullable edge (ruling 11), meaning written down: null ⇔ an INSTALL
  /// awaiting its second approver, for which no installation and no
  /// credential exist yet.
  installationId          String?
  listingRef              String
  kind                    AppConsentKind
  fromVersionRef          String?
  toVersionRef            String
  manifestSha256          String
  /// Exactly what the screen listed — the same arrays setGrant() applies.
  permissionKeys          String[]
  topics                  String[]
  providerCapabilities    String[]
  dataScope               String             // "DEPLOYMENT" in v1 (doc 185 §2.3)
  priceSnapshot           Json?              // AppPricePlan terms shown (doc 192)
  decision                AppConsentDecision
  /// Null only for AUTO_UPGRADE — applied by the status-feed poller under
  /// doc 185 §5's no-consent rule, with no human in the loop by design.
  requestedByUserId       String?
  requestedAt             DateTime           @default(now())
  secondApproverUserId    String?
  /// Ruling 16: distinct active holders of api-access.approve_scope other
  /// than the requester when decided, and whether this was the one-person
  /// fallback. Ships at every edition; the Solo screen shows only a badge.
  approverRosterSize      Int?
  approvalShortfall       Boolean            @default(false)
  decidedAt               DateTime?
  expiresAt               DateTime           // a pending request lapses after 7 days

  installation AppInstallation? @relation(fields: [installationId], references: [id])

  @@unique([installationId, toVersionRef, kind])   // an auto-upgrade replayed by the poller is a no-op
  @@index([decision, expiresAt])
  @@index([requestedByUserId, decision])
}
// Hand-written trigger, mirroring api_key_revocation_is_final
// (migrations/20260925120000_add_personal_api_keys/migration.sql):
//   app_consent_decided_is_final — refuses any UPDATE of a row whose decision
//   is ACCEPTED, DECLINED or EXPIRED. Consent evidence cannot be rewritten.

model AppInstallationTopic {
  id              String @id @default(cuid())
  installationId  String
  topic           String   // APP_EVENT_TOPICS key (doc 185 §3)
  domainEventName String   // denormalised: the fan-out lookup key (doc 188 §2)

  installation AppInstallation @relation(fields: [installationId], references: [id])

  @@unique([installationId, topic])
  @@index([domainEventName])
}
```

## 2. The consent screen — never a blind click

`/admin/apps/install/[slug]`, one job: decide whether to grant this. It is
rendered from **`AppConsentService.previewInstall(actor, slug,
pricePlanKey)`**, a pure computation over the fetched manifest and the
actor's live permissions (no write, no `publish`). The **same function's
output** is what `install()` applies. The list a person reads and the list
the guard enforces cannot differ, because they are one value.

What the screen shows, top to bottom, closing over absent sections
(`.claude/rules/design.md`: "layout closes over absent permissions and
modules"):

1. **Who.** App name, icon, publisher legal name, "Built by NEWAX" when
   first-party, and **"Reviewed by NEWAX"** with a one-line explanation
   linked to the directory policy: *"NEWAX checked what this app asks for,
   that it verifies messages from us, and who publishes it. NEWAX does not
   run this app or see what it does with your data after it receives
   it."* That is doc 186 §3's honest scope, in the screen's own words.
2. **What it can do — permission by permission.** For each requested key:
   the catalogue `label`; the `sensitivity` tier with the tier's own
   definition from `packages/shared/src/permissions.ts` (e.g. *medium —
   "touches money, cost, or another person's data"*); and the publisher's
   justification in the viewer's locale. Keys the admin does not hold are
   marked "You don't have this — you can't grant it" (§4.1) and the Install
   button is disabled with that reason (`PRM-2`: disable and explain, never
   silently hide).
3. **Whose data.** *"All brands and branches in this system"* — the
   `DEPLOYMENT` scope stated in plain words. On a node that is one brand of
   a group, it names that brand (`brand.ts`'s resolved name, never a
   literal).
4. **What it will be told.** Each topic, as "When an order changes status,
   the app is told the order number and new status" — the projection's
   field list rendered in words (doc 185 §3).
5. **Where it will appear.** For a provider capability: "Adds *Courier App
   Express* as a shipping option in Fulfilment" (doc 190). The binding is
   installed disabled and switched on separately (doc 190 §3), so this line
   tells the admin a switch will exist.
6. **What it costs.** The price plan's terms from doc 192, or "Free".
7. **Where your data goes.** Privacy policy, terms and support links from
   the manifest.
8. **Who else must approve.** When §4.2 applies: "Because this app can
   touch money or other people's data, a second person with *Approve app
   and API access* must approve it", with the number of such people.
   Alternatively, the ruling 16 notice (§4.3).
9. **One primary action**: *Install* (or *Request approval*). Secondary:
   *Cancel*.

**No partial grants.** The admin accepts the requested set or does not
install. That is GitHub's rule, for the same reason: a manifest's keys were
reviewed *as a set* against the app's function (doc 186 §3), and an app
running with an arbitrary subset fails in ways neither party can predict.
Narrowing is still possible, just not per click: suspend (§5.3), uninstall
(§6), or choose an app that asks for less. The screen itemises every
capability, so the decision is informed. "All or nothing" here means
all-or-nothing *on a fully disclosed list*, never blind trust.

**Version skew refuses before it renders.** If `validateAppManifest()` fails
on this tenant — a key this release does not know — the screen shows
"This app needs a newer NEWAX release" and no install button (doc 185 §2).

## 3. The install sequence — a REQUEST across two databases, made safe

`POST /admin/apps/install` — `@RequirePermission('apps.manage')`,
`@SessionOnly()` (it mints a credential that outlives any key;
`.claude/rules/security.md`). The body is `{ slug, pricePlanKey,
manifestSha256 }`. The client sends back the sha it rendered, and the
server refuses with 409 "This app changed while you were reading — review it
again" if the listing's current version moved in between.

1. **Preconditions.** `API_PUBLIC_URL` is set, or the manifest requests no
   permission keys — an app that must call in cannot reach a deployment with
   no public address, so it is refused with that sentence. A directory
   credential is present. `previewInstall()` shows no refusal.
2. **Second approval, if needed.** §4.2 writes an `AppInstallationConsent`
   with `decision = PENDING_SECOND_APPROVAL`, `installationId = null`, and
   stops. Nothing else exists yet. Steps 3–6 run when it is approved.
3. **Platform preflight.** `AppDirectoryClient.registerInstallation({
   slug, versionRef, pricePlanKey, installationRef })` calls `POST
   /app-directory/v1/installations`. `installationRef` is a cuid generated
   here, reused on retry, and it becomes `AppInstallation.id` in step 4, so
   both databases name the installation by the same id. The platform checks the listing is `LISTED` and
   visible to this tenant, the version `APPROVED` and current, the publisher
   `ACTIVE` and the plan valid. It writes `AppInstallationRecord`
   (`PENDING`, with the chosen `pricePlanId`) and returns
   `platformRecordRef`. No `AppSubscription` exists yet: the reused
   `SubscriptionStatus` enum has no pending value, and nothing may be billed
   before the tenant's own transaction commits (doc 192 §3). It is idempotent on `(tenantId,
   installationRef)`: a retried call returns the same record. **Platform
   unreachable ⇒ the install is refused with "The App Directory is
   unreachable; nothing was installed"**, and nothing has been written on
   either side.
4. **The tenant transaction** — one `prisma.$transaction`, all or nothing:
   - `ApiClientsService.issueForInstallation(tx, { label, permissionKeys,
     createdByUserId, approvedByUserId, approvalShortfall })` (doc 189 §1).
     It creates the login-disabled actor `User` (`principalKind =
     API_CLIENT`) and the `ApiClient` (`kind = APP_INSTALLATION`, `status =
     ACTIVE`).
   - `AppInstallation` (`ACTIVE`), with 256 random bits of webhook secret,
     encrypted.
   - One `AppInstallationTopic` per consented topic.
   - `AppProviderBinding` rows, disabled (doc 190 §3).
   - The `AppInstallationConsent` row → `ACCEPTED` (created, or the pending
     one updated in the same statement that checks it is still `PENDING`).
   - `EventBusService.publish(DomainEvent.AppInstalled, …, tx)`.
   - `AuditService.recordEvidence(tx, { action: 'app.installed', … })`,
     carrying the full permission list, topics, version, approver and
     shortfall flag — evidence-class under ruling 9, because it is a
     permission change.
5. **Confirmation, delivered not called.** `AppInstalled` fans out (doc 188)
   to two subscribers: the app's own `installation.created` lifecycle
   delivery, and the **platform** subscriber. The platform delivery moves
   `AppInstallationRecord` to `ACTIVE` and, for a paid plan, creates the
   `AppSubscription` (`ACTIVE`, doc 192 §3) in the same platform
   transaction. If the
   tenant transaction failed after step 3, no event exists, the platform
   record stays `PENDING`, and `AppInstallationRecordSweepCron` (platform,
   hourly) marks records `PENDING` for over an hour as `ABANDONED`. An
   abandoned record is never billed and never counted.
6. **Hand-off to the app.** The response is `{ installationId, setupUrl }`
   and the browser goes to `setupUrl?installation_id=…&api_base=<API_PUBLIC_URL>`.
   An installation id grants nothing without the app's private key, so the
   URL carries no secret. The app now mints its first token (doc 189 §2),
   which stamps `firstTokenAt`. Until then the installation shows "Waiting
   for the app to connect", with the setup link offered again. There is no
   auto-uninstall — the admin decides.

## 4. Who may install, and who must agree

### 4.1 You cannot grant what you do not hold

`previewInstall()` resolves the actor's live permissions
(`PermissionsResolverService.resolveForUser()`). It refuses any requested
key the actor lacks, with `OrgUnitGrantService.issue()`'s own sentence:
"you cannot confer what you were never given". Without this rule,
`apps.manage` would be an escalation path — install an app, then use its
token as a proxy for keys you were never granted. `apps.manage` is also on
`NON_DELEGATABLE_PERMISSIONS`, and the route is `@SessionOnly()`, so no key
of any kind can install an app (§8).

### 4.2 The threshold: a second person when the grant reaches money, cost or other people's data

The band is read from **existing** metadata: each key's
`PermissionDefinition.sensitivity` (`packages/shared/src/permissions.ts`).
The tiers' own definitions are the reason. `medium` "touches money, cost,
or another person's data"; `high` "grants power over other accounts or
brands/branches".

| Highest sensitivity among requested keys | Who decides | Why |
|---|---|---|
| `low` only | The installer alone | A day-to-day capability |
| `medium` or `high` | The installer **and** a second, distinct person holding `api-access.approve_scope` | Doc 34's own threshold ("a wrongly-broad API key is exactly as much a blast-radius event as a wrongly-large cash transaction"), measured on the tier that describes blast radius |
| `critical` | Nobody — refused | `critical` is exactly `ADMIN_LOCKED_PERMISSIONS`, all on `NON_DELEGATABLE_PERMISSIONS` (asserted by `api-keys.spec.ts`), so `validateAppManifest()` already refuses them |

**Upgrades apply the same bands to the added keys only.** A re-consent
adding only a `low` key needs no second person, even if the app already
holds `medium` keys.

**The approver's screen** is the consent screen (§2) plus the requester's
name, reached from the action hub. `AppInstallationsActionHubSource`
implements `ActionHubSource` and lists pending consents for holders of
`api-access.approve_scope`. `POST /admin/apps/consents/:id/approve|decline`
— `@RequirePermission('api-access.approve_scope')`, `@SessionOnly()`.
`AppConsentService.approve()` refuses when the approver is the requester
(the toxic pair, at the act), re-checks that the requester **still** holds
every key (their authority may have shrunk in the meantime), and refuses
with "This app changed since the request" if `manifestSha256` no longer
matches the listing's current version. Then it runs §3 steps 3–6. A
pending request expires after 7 days (`expiresAt`); `AppConsentExpiryCron`
marks it `EXPIRED`, and a person re-requests.

### 4.3 Ruling 16 — a Solo shop has no second person

A single-owner deployment usually has exactly one holder of every key. A
second-approver rule would either block that shop outright — ruling 16's
"wall" — or be quietly skipped — its "silence". Neither is allowed. When
the roster is empty — `usersWithPermission('api-access.approve_scope')`
filtered to active `PERSON` users other than the requester, counted at the
act — the screen says so. The installer may proceed as the only approver.
The consent row stores `approvalShortfall = true` and `approverRosterSize =
0`, recorded evidence-class. The installation carries a permanent "Approved
by one person" badge on its detail screen. The Solo screen shows only the
badge, never the roster machinery (ruling 16's "the Solo screen never
renders them").

### 4.4 When the installer leaves

The installation **does not die with the installer**. That is the entire
reason it is an `ApiClient` and not a personal key (ADR-037, doc 163 §9's
"Offboarding: it must not die with whoever created it"). What ruling 6
requires to happen in the deactivation transaction is narrower: **pending
decisions** keyed to the leaver.

`EmployeeOffboardingRegistry` (`core/extension-points/employee-offboarding.registry.ts`)
today holds one handler (hr's asset check) and no in-transaction hook. It
gains both, additively: `register()` appends to a list, and handlers may
implement `inDeactivationTransaction(tx, userId)`.
`UsersAdminService.update()`'s existing deactivation transaction — the one
that already calls `ApiKeysService.revokeAllForUserInTransaction()` —
calls every registered handler. `app-installations` registers one that
marks the leaver's `PENDING_SECOND_APPROVAL` consents `EXPIRED`. Installed
apps are untouched. The installed list shows "Installed by *(deactivated
account)*", so the remaining admins can review what the leaver installed.

## 5. After install: upgrades, price changes, tenant suspension

### 5.1 An upgrade that needs consent

A version with `requiresReconsent = true` arrives on the status feed (doc
191 §3). The installation stays on its current grant. `/admin/apps` shows
**Update available — needs your approval**. The consent screen renders the
**diff**: added keys, topics and capabilities highlighted as new; removed
ones listed as "no longer needed". §4's bands apply to the additions. On
acceptance, `AppConsentService.acceptUpgrade()` runs one transaction:
`ApiClientsService.setGrant()` to the new full set, topics replaced,
`manifestSnapshot`/`versionRef`/`signingKeys`/`webhookUrl` updated, consent
row `UPGRADE`/`ACCEPTED`, `AppInstallationScopesChanged` published
(delivered to the app as `installation.scopes_changed`), and evidence audit
`app.scopes_changed` with **from and to** key lists.

### 5.2 An upgrade that does not

Narrowing, URL, key-rotation and text-only versions are applied by the
status-feed poller automatically, in one transaction per installation
with an `AUTO_UPGRADE` consent row (`requestedByUserId = null`, by design).
`@@unique([installationId, toVersionRef, kind])` makes a replayed feed entry
a no-op. The admin sees it in the installation's history, not as a prompt.

### 5.3 The tenant's own suspend switch

`POST /admin/apps/:id/suspend` and `/reinstate` — `apps.manage`,
`@SessionOnly()`. Suspending is reversible and immediate:

- `ApiClient.status = SUSPENDED`, so every token is refused on its next
  request (doc 189 §2);
- fan-out skips the installation, so no new deliveries (doc 188 §2);
- pending deliveries are held, not dropped;
- provider bindings stop being offered (doc 190 §3);
- `AppInstallationSuspended` goes to the app as `installation.suspended`.

Events during a suspension are **not** replayed on reinstatement: a
suspension is a gap, and the app resynchronises by reading current state
after `installation.reinstated` (the thin-payload design makes that
natural, doc 185 §3). A tenant can lift only its own suspension
(`suspendedBy = TENANT`). A `PLATFORM` suspension is lifted only by the
feed (doc 191 §3).

### 5.4 A price change

A paid plan's price rising, or a free app becoming paid, arrives as a
`requiresReconsent` version. It is accepted as a `PRICE_CHANGE` consent,
never applied silently. Doc 192 §3 has the billing side.

## 6. Uninstall — a RECORD, never refused, never waiting on anything

`POST /admin/apps/:id/uninstall` — `apps.manage`, `@SessionOnly()`, with
`ACT-6` confirmation friction ("the app loses access immediately; it keeps
any data it already received — ask the publisher to delete it"). It is a
**record** of the tenant's decision. It writes locally, in one
transaction, and **calls nothing external**. The platform is told by
delivery afterwards, and an unreachable platform delays the platform's
knowledge, never the revocation. The transaction's full fan-out — credential
revoked by trigger-final `revokedAt`, tokens dead, actor deactivated,
deliveries cancelled, bindings retired, the final `installation.deleted`
notice — is doc 191 §2's, specified there once.

The five events this program adds to `domain-events.ts`, each published in
the transaction of the act it records:

| Event | Name | Published by | Subscribers |
|---|---|---|---|
| `AppInstalled` | `app_installation.installed` | `install()` | `OutboxFanOutListener` → the app (`installation.created`) and the platform |
| `AppInstallationScopesChanged` | `app_installation.scopes_changed` | `acceptUpgrade()`, auto-upgrade | → the app; → the platform (version on the record) |
| `AppInstallationSuspended` | `app_installation.suspended` | tenant or feed suspend | → the app; → the platform (tenant-initiated only) |
| `AppInstallationReinstated` | `app_installation.reinstated` | tenant or feed reinstate | same |
| `AppUninstalled` | `app_installation.uninstalled` | `uninstall()`, feed removal | → the app (`installation.deleted`, final); → the platform (record `UNINSTALLED`, subscription ended, doc 192) |

Each payload carries `installationId`, `listingRef`, `platformRecordRef`,
`versionRef`, the granted keys and topics after the change, and
`occurredAt`. There is never a secret. Doc 131's versioning rule applies.

## 7. Screens and reachability

| Screen | Job | Gate |
|---|---|---|
| `/admin/apps` — Installed apps | Overview: name, status badge, "Update available", "Waiting for the app to connect", "Approved by one person", last delivery health — never the detail of everything (Law 7) | `apps.manage`; nav key `apps` (doc 185 §6) |
| `/admin/apps/directory`, `/admin/apps/directory/[slug]` | Browse; the listing | `apps.manage` (doc 185) |
| `/admin/apps/install/[slug]` | The consent screen (§2) | `apps.manage` |
| `/admin/apps/consents/[id]` | The approver's consent screen (§4.2), reached from the action hub | `api-access.approve_scope` |
| `/admin/apps/[installationId]` | One installation: the grant (each key with label/sensitivity), topics, provider switches (doc 190), delivery health and failed deliveries with replay (doc 188 §6), request volume and 403 count (doc 189 §4), consent history, conformance check (doc 186 §3.2); actions suspend/reinstate, uninstall, report | `apps.manage` |

The app actor `User` never appears on `/admin/users` (doc 189 §1's
`principalKind` filter). An admin reaches an app's identity through its
installation, where it is explained, never as a mystery account among
staff. Every string in en and ur. Empty states: "No apps installed yet —
browse the directory", with the one action.

## 8. Permissions, seeded all the way through

| Key | Label | Sensitivity | Non-delegatable? | Seeded to |
|---|---|---|---|---|
| `apps.manage` | Install, update, suspend and uninstall apps | `high` | **Yes** — installing mints a principal that outlives any key (doc 163's criterion) | `ADMIN` |
| `api-access.approve_scope` | Approve app and API access that touches money or other people's data | `high` | **Yes** — a key must never be the second person (ADR-037's consequence) | `ADMIN` |
| `api-access.manage` | Create and revoke service accounts (doc 193) | `high` | **Yes** — same reason as `apps.manage` | `ADMIN` |

All three join the `connections` group doc 170 §2.1 specifies. If this
program ships before doc 170, it creates that group under doc 170's key and
label.

**The seeding trap, closed for real.** `ROLE_PERMISSION_SEED.ADMIN` gains all
three. That alone reaches **only fresh deployments**, and this is the
`seedPermissions()`-vs-`seedRoles()` gap `CLAUDE.md` names. In
`apps/api/prisma/seed.ts`, `seedPermissions()` writes the legacy
`RolePermission` rows, which `PermissionsResolverService` never reads, and
`seedRoles()` copies them into live `RoleGrant` rows **once**, returning
immediately if any `Role` exists. On every existing deployment the new
keys would reach nobody. So the program ships one hand-written, forward-only
migration that:

1. upserts the three `Permission` rows (key, label, category), and
2. inserts a `RoleGrant` for each into the `Role` named `Admin` —
   **only where that permission has no `RoleGrant` yet**. That is
   `seedPermissions()`'s own "only a brand-new permission picks up its
   defaults" rule, so an admin's later edits are never overridden. It uses
   `ON CONFLICT DO NOTHING` and is a no-op on a fresh database where `Role`
   is still empty (the seed's one-time copy then handles it).

Verified on an upgraded deployment by `GET /auth/me` for a seeded admin
listing the three keys. No precedent for this migration shape exists in
the repository (grep: only `20260917074228_add_custom_roles` writes
`RoleGrant`), so a reviewer should read it as new.

## Scope lenses

**The five shop-scale lenses first.**
*The transaction, start to finish* — browse → listing → consent → (second
approval) → platform preflight → tenant transaction → setup redirect → app
mints token → events flow and API calls succeed → upgrade/suspend/uninstall;
every step names a method above.
*The other side of the same transaction* — the approver's screen and action
hub item (§4.2); NEWAX's review queue upstream (doc 186); the platform's
`AppInstallationRecord` for billing (doc 192).
*What happens after "done"* — upgrades that ask again (§5.1), price changes
(§5.4), suspension (§5.3), uninstall (§6, doc 191), reports (doc 186 §5.1).
*The integrations a real business needs, not a demo* — a real credential,
real signed deliveries, a real consent record, and a real revocation, not a
status flag.
*The policy layer that governs it* — the sensitivity bands (§4.2), ruling
16's fallback (§4.3), no partial grants (§2), the directory policy (doc 186
§4).

**The actor with three tables** — the installer is a `User` (`PERSON`). The
installed app is an `ApiClient` (`kind = APP_INSTALLATION`) plus a
login-disabled `User` (`principalKind = API_CLIENT`), linked by
`ApiClient.actorUserId @unique`. The installation links to the credential by
`AppInstallation.apiClientId @unique`, and to the platform listing and
record by the bare scalars `listingRef` and `platformRecordRef`. The
publisher is a platform `AppPublisher`, never a tenant row.
**The principal with no permission key** — the app authenticates two ways,
both outside the session path. (1) A JWT signed by a key in
`AppInstallation.signingKeys`, which can **only** mint tokens for its own
`ACTIVE` installation — checked against installation status and key set,
never against `PERMISSION_CATALOG`. (2) The minted `nxc_` token, checked by
`PermissionsGuard` against exactly `ApiClient.permissionKeys` minus
`NON_DELEGATABLE_PERMISSIONS` minus `CHECKER_PERMISSIONS` (doc 189 §3). It
reads every row of this node (`DEPLOYMENT`), because its actor holds no
`AdminScope`.
**The grant that ends itself** — tokens expire in at most 60 minutes (doc 189
§2). A pending consent expires in 7 days (`AppConsentExpiryCron`). The grant
itself deliberately does **not** end with its installer (ADR-037's
reopening condition). It ends by uninstall, platform removal or publisher
termination (doc 191), and pauses on suspension. In the installer's
deactivation transaction: their pending consents → `EXPIRED` (§4.4);
`AppInstallation.installedByUserId`, `ApiClient.createdByUserId` and
decided consents stay as facts.
**Whose rows, and which columns** — only `apps.manage` holders see
installations, and only `api-access.approve_scope` holders see pending
consents. `webhookSecretEncrypted` and every token hash are never selected
by an admin read path. The app's own rows are this node's (`DEPLOYMENT`).
Its columns are whatever the routes it may call return for its effective
permissions: `stripOrderCost()` and every other check reading
`user.permissions` apply to it unchanged, so cost columns stay hidden
unless `inventory.view_cost` was granted. The app actor is filtered out of
`/admin/users`.
**The threshold nobody approves alone** — bands by `sensitivity` (§4.2):
`low` alone; `medium`/`high` plus a second holder of
`api-access.approve_scope`; `critical` refused. The same bands apply to the
additions in an upgrade. The undo — uninstall — needs one person, because
removing access is never gated (ruling 2: a RECORD). The check runs in
`previewInstall()` before any row exists.
**The toxic pair, caught at grant or at act** — requester and approver of
the same consent, refused in `AppConsentService.approve()` by comparing
`requestedByUserId`. `apps.manage` + `api-access.approve_scope` on one
person is allowed, because a Solo owner holds both. The fallback is
recorded (ruling 16), never refused.
**Authority and blast radius** — `apps.manage` holders install, bounded by
their own permissions (§4.1) and whole-node scope. The worst value is an app
granted every delegatable, non-checker `high` key the installer holds,
limited by review (doc 186), the second approver and revocability.
`app.installed` / `app.scopes_changed` evidence rows carry the full from and
to key lists, never "fields changed".
**Audience is a capability, not an address** — approval requests reach
holders of `api-access.approve_scope` through the action hub (pull, one item
each), never a mail blast. At 200 holders that is 200 hub entries and zero
emails. At zero holders it takes ruling 16's recorded fallback (§4.3).
"App installed" mails go to two people only: the installer and the
approver, both resolved from the consent row.
**Request or record — classify every write** — install and upgrade are
REQUESTS: refused for version skew, keys not held, platform unreachable or
approval pending. A consent decision is a RECORD of a human decision.
Uninstall is a RECORD, never refused and never waiting on a dependency. An
auto-upgrade is a RECORD of the feed. The refusal's variance row is the
`DECLINED`/`EXPIRED` consent itself, visible in history.
**The movement with no address** — n/a: installing moves no stock or cash. A
stock or cash write the app later makes goes through the route it calls,
which requires its own `locationId` exactly as for a person. No path in
this document reaches `InventoryService.defaultLocationId()`.
**Four hours down, the counter stays open** — the platform down means no new
installs; running apps are unaffected, and uninstall still works (the
platform learns by delivery later). The app down means deliveries queue
(doc 188). The tenant down means the app retries on its own schedule.
Nobody is mid-sale on this screen; no paper path is needed.
**The unwritten posting rule** — n/a: installing posts no `JournalEntry`. A
paid app's charge is NEWAX's own revenue, invoiced to the tenant on
NEWAX's books (doc 192 §6), never a posting in the tenant's ledger by this
code.
**Every column or none** — n/a: writes no `JournalLine`.
**The period that already moved** — n/a: nothing is dated into a
`FiscalPeriod`.
**The second legal entity** — n/a for the grant: an installation is per
node, and a second `RetailBrand` running its own node installs separately
with its own credential. The price per installation is doc 192's.
**Dry run before live** — `AppConsentService.previewInstall()` is pure (no
`prisma.` write, no `publish(`). Its second, read-only caller is the listing
page's "What this app will be able to do here" panel, which shows the same
list with the same refusals before anyone presses Install.
**Click the number** — "12 permissions" opens the list; "3 failed
deliveries" opens those `OutboxDelivery` rows pre-filtered (doc 188); "4,120
requests today" and "18 refused" open the installation's
`ApiClientRequestLog` windows (doc 189 §4). Each drill-down sums back to its
tile.
**Three silhouettes, and the day the tier above appears** — *Solo:* one
admin, ruling 16's badge, `DEPLOYMENT` is the shop. *Chain:* installed on
the brand node, it sees that node's data, including branch facts replicated
up (`RETAIL-ERP.md` R2), and branch nodes have no installation unless one is
made there. *Organization:* each node installs separately. The day a tier
appears above an existing node, its installations keep `DEPLOYMENT` scope
over exactly the same database; nothing is inherited downward, because
`ApiClient` is node-local like `ApiKey` (never registered with
`ReplicationRegistry`). The roster columns (`approverRosterSize`,
`approvalShortfall`) ship in the first migration and render only as a
badge on Solo.
**The absent collaborator** — `app-installations` off: no nav entry, no
routes, and core's `OutboxSubscriberRegistry` has no app source (doc 188).
`organization` off: no `AdminScope`, which changes nothing in v1. The
notification channel off: approvals still reach the action hub. No
directory credential: the directory says so (doc 185 §6). `API_PUBLIC_URL`
unset: inbound-requiring apps are refused with the reason. Each degrades on
the request and never fails Nest boot.
**The second copy of the write** — a double-clicked Install hits the partial
unique index `AppInstallation_one_live_per_listing` → 409. The preflight is
idempotent on `(tenantId, installationRef)`. Approve is predicate-on-write
(`decision = PENDING_SECOND_APPROVAL`). A replayed auto-upgrade hits
`@@unique([installationId, toVersionRef, kind])`. A redelivered
`AppInstalled` to the platform hits the platform record's own unique
`(tenantId, installationRef)`.
**The hundred-thousandth row** — installations per node are tens and
consents hundreds, so this document's pages read a handful of rows. The hot
paths — fan-out and authentication — are docs 188/189's and are indexed
there (`AppInstallationTopic @@index([domainEventName])`).
**The adoption test** — n/a: no human-readable code or series is invented.
Every id is a cuid, and nothing here is replicated between nodes.
**The reversal document, not the reversal flag** — uninstall is the reversal:
`uninstalledAt`/`uninstalledByUserId`/`uninstallReason` on the
installation, the `AppUninstalled` event and an evidence row, terminal
because the credential's revocation is trigger-final. **Partial** reversal
of a grant is deliberately not offered (§2: no partial grants). The
reversible partial measure is suspension.
**The undo fan-out** — install fires: actor `User` (uninstall deactivates it,
automatic); `ApiClient` (revoked, automatic); tokens (dead with the client,
automatic); topics (inert unless `ACTIVE`, automatic); pending deliveries
(cancelled, automatic); webhook secret (nulled after the final notice,
automatic); provider bindings (retired, automatic — in-flight payments are
doc 190 §4's human-free grace path); platform record and subscription
(ended by delivery, automatic, doc 192); data already sent to the app
(**deliberately irreversible** from our side — the directory policy's
deletion clause, doc 186 §4, is contractual); writes the app already made
(stand on their own authorization at the time — the same rule doc 163 gives
a revoked key).
**The version stamp** — `manifestSnapshot` + `manifestSha256` on the
installation. Consent rows are immutable (trigger
`app_consent_decided_is_final`) and name `toVersionRef` and the exact arrays
applied. An app's access on any day is explained by the consent rows up to
that day, from stored fields alone.
**The erasure the ledger cannot obey** — the actor `User` holds no personal
data (its name is the app's name). `installedByUserId`,
`requestedByUserId`, `secondApproverUserId` and `uninstalledByUserId` keep
their foreign keys and resolve to ruling 1's erased-subject tombstone. The
`AuditLog.data` of `app.*` rows holds ids and key lists, no free text about
the person. `OutboxDelivery.body` is thin and carries ids only by
construction (doc 185 §3). Personal data already delivered to the app is
outside this database: named, not assumed away, and governed by the
directory policy's deletion clause and the tenant's own agreement with the
publisher (doc 191 §6).
**The failure path, and who is allowed to walk it** — a refused install
shows its reason and writes nothing. An expired approval is an `EXPIRED`
consent row in the installation's history. An app that never connects
stays in "Waiting for the app to connect" with the setup link, visible to
`apps.manage` on `/admin/apps`. A platform preflight that succeeded before a
failed tenant transaction becomes an `ABANDONED` platform record, never
billed. Replay is re-running Install, which is safe because of the partial
unique index.

**Catalogue lenses this surface fires.**
*Which tier owns the credential* — the tenant node: `ApiClient` and the
webhook secret live in the tenant database, encrypted under that node's
`APP_ENCRYPTION_KEY`. The app's private key is the publisher's. The platform
holds only public keys and never a tenant credential.
*The gate checked once, not per action* — per action: every app request
re-reads the client's status and grant (doc 189 §2), and approval re-checks
the requester's live permissions at the moment of approval (§4.2).
*Who read it, not just who wrote it* — an app cannot hold a `critical` key,
the only class ruling 9 makes read-evidence. Its reads of `medium`/`high`
data are recorded per route per minute in `ApiClientRequestLog` (doc 189
§4), not per record — a stated limit, not a claim of a read trail.
*Quota has no owner* — the per-client rate limit, owned by the `ApiClient`
row (doc 189 §4).
*The switch, its scope, and who may throw it* — the tenant's own suspend
(§5.3, `apps.manage`, one node) and NEWAX's kill switch (doc 191 §3,
`platform.apps.suspend`, every node that installed it).

## Work orders

**WO-187.1 — schema**: `app-installations.prisma` (the enums,
`AppInstallation`, `AppInstallationConsent`, `AppInstallationTopic`), the
hand-written partial unique index and `app_consent_decided_is_final`
trigger, forward-only migration; `module-packs.ts` + `modules.registry.ts`
entries (`offByDefault: true`) + every `.env*.example` `# Available:` line.
**WO-187.2 — `AppConsentService`**: `previewInstall()` (pure), `approve()`/
`decline()` with the toxic-pair refusal and live re-check,
`acceptUpgrade()`, `applyAutoUpgrade()`, `AppConsentExpiryCron`.
**WO-187.3 — `AppInstallationsService`**: `install()` (§3, including the
platform preflight via `AppDirectoryClient.registerInstallation()`),
`suspend()`/`reinstate()`, `uninstall()` (fan-out per doc 191 §2), the five
domain events.
**WO-187.4 — platform side**: `POST /app-directory/v1/installations`
(idempotent preflight), `AppInstallationRecord`/sweep cron (doc 191 §5
carries the model), the platform `OutboxSubscriberRegistry` target's
receiving route (`POST /app-directory/v1/installations/:ref/lifecycle`,
idempotent on delivery id).
**WO-187.5 — `EmployeeOffboardingRegistry`**: multiple handlers plus the
optional `inDeactivationTransaction(tx, userId)`; `UsersAdminService`
calls them inside its existing deactivation transaction; the
`app-installations` handler; a spec proving a failed handler fails the
deactivation (the same rule as the key revocation it sits beside).
**WO-187.6 — permissions**: the three keys, the `connections` group,
`ROLE_PERMISSION_SEED.ADMIN`, the `RoleGrant` migration (§8), and the
non-delegatable entries with reasons (doc 189 §3).
**WO-187.7 — screens**: §7's five screens, the action-hub source, the nav
entry, en/ur copy, every empty/error/loading state.

## Acceptance

- The permission list on the consent screen and `ApiClient.permissionKeys`
  after install are the same array, proven by a spec calling
  `previewInstall()` then `install()`.
- An admin lacking a requested key cannot install; the reason names the
  key.
- An app requesting a `medium` key cannot be installed by one person on a
  deployment where another active holder of `api-access.approve_scope`
  exists; on a deployment with none, it can, and the consent row carries
  `approvalShortfall = true, approverRosterSize = 0`.
- The requester cannot approve their own request; approval fails if the
  requester lost a key meanwhile or the manifest changed.
- A platform outage during install writes nothing on the tenant. A tenant
  transaction failure after a successful preflight leaves a platform record
  that becomes `ABANDONED` and is never invoiced.
- A second Install of a live listing returns 409.
- An upgrade adding a key does nothing until accepted; an upgrade removing
  one applies automatically, recording an `AUTO_UPGRADE` row with from/to.
- Deactivating an installer leaves their installed apps running and expires
  their pending consents in the same transaction.
- On an **existing** deployment with custom roles, after migrating, the
  `Admin` role holds `apps.manage`, `api-access.manage` and
  `api-access.approve_scope` (`GET /auth/me`).
- No API key of any kind (`nxa_`, `nxs_`, `nxc_`) can reach any route in this
  document (`session-only-routes.spec.ts` extended).

## Out of scope

Partial grants (§2, reasoned). Brand- or branch-scoped installations — the
column shape exists (the actor's `AdminScope`), and the consent control waits
for `ENTERPRISE-SCALE.md`'s L2 enforcement (doc 185 §2.3). Apps acting for an
individual storefront customer with the customer's own consent (doc 185
§2.2). Bulk install across many nodes of a group from one screen — each node
consents for itself, which is correct for isolation; a group-wide installer
is a later convenience needing its own consent design. An in-admin app UI
(doc 185 Out of scope).
