# 191 — Revocation, the kill switch, and tenant isolation: every grant ends completely, NEWAX can stop an app everywhere, and no app reaches past the tenants that chose it

> **Status: proposed, not yet built.** No `AppListingStatusChange`, status
> feed, `AppStatusFeedCron`, `AppInstallationRecord` or uninstall path
> exists (grep, `main` at `642b2831`). The disciplines it follows **are**
> built and cited: `SupportAccessGrant`'s "every grant expires … never trust
> a cron for liveness" (`apps/platform/src/modules/support-access/`),
> `api_key_revocation_is_final`, `PlatformTenant.suspendedAt` and
> `TenantsService.suspend()`, doc 37's `FeatureFlag.killSwitch`, and doc 39's
> isolated-database model. This is the second of the two documents carrying
> the **full scope-lens pass**. Part of [doc 184](./184-app-platform-overview-and-remote-only-decision.md)'s
> program (ADR-073).

## Implementation plan

### Objective
Uninstalling ends an app's access completely, in one transaction, on the
very next request, and never waits on any external party. A tenant can
pause an app reversibly. NEWAX can suspend or remove a published app on
every tenant that installed it, within a stated bound, without ever writing
into a tenant's database. A compromised app, key, publisher account, tenant
or even control plane is contained to what it could already reach, and
cannot reach further.

### Existing state
- Grants with a clock: `SupportAccessGrant` (`expiresAt`, `revokedAt`,
  `accessedAt[]`, `markedInertAt` display-only; `SupportAccessService.recordAccess()`
  re-derives liveness itself). `ApiKey` revocation final by trigger.
- Suspension: `TenantsService.suspend(id, reason)`/`reactivate(id)`
  (`apps/platform/src/modules/tenants/tenants.service.ts`). `reactivate()`
  clears `suspendedAt`/`suspendedReason` in place, so the history is lost
  (doc 184 §6 item 8).
- Kill switch precedent: `FeatureFlag.killSwitch` (doc 37, `core/feature-flags/`),
  "stops the feature immediately … does not undo whatever that feature
  already wrote".
- Isolation: doc 39 — "a tenant is a node", every tenant its own database, no
  path from one to another, "the control plane is invisible from inside".
- The platform has no outbox or outbound dispatcher (ADR-059).

### Required change
§1–§6.

### Files likely affected
Platform: `app-directory.prisma` (`AppListingStatusChange`,
`AppInstallationRecord`); `modules/app-directory/app-moderation.service.ts`,
`status-feed.controller.ts`, `installation-records.service.ts`,
`app-installation-record-sweep.cron.ts`. Tenant: `app-installations.prisma`
(`AppStatusFeedCursor`); `modules/app-installations/app-installations.service.ts`
(`uninstall`, `applyPlatformSuspension`, `applyPlatformReinstatement`,
`applyRemoval`), `app-status-feed.cron.ts`, `app-key-confirmation.service.ts`;
core `ApiClientsService.revoke()`/`.suspend()`/`.revokeTokensForKid()` (doc
189).

### Dependencies (reused)
Doc 189's `ApiClientsService`, doc 188's `OutboxDelivery` engine and
`safe-https.ts`, `AuditService.recordEvidence()`, `ActionHubSource`, the
directory proxy (`AppDirectoryClient`, doc 185 §6).

### Risks
A kill switch that fails closed when the platform is unreachable would turn
a control-plane outage into every app on every tenant stopping at once — a
correlated outage NEWAX itself would cause. It fails open, and says so
(§3.4). A control plane trusted alone for key and URL changes would be a
single point from which every installed app's grant could be hijacked. It
is not trusted alone (§4.3).

## 1. Four levers, four scopes

| Lever | Who | Scope | Reversible? | Takes effect |
|---|---|---|---|---|
| **Uninstall** | Tenant, `apps.manage` | One installation on one node | No — terminal | The very next request |
| **Suspend** (tenant) | Tenant, `apps.manage` | One installation | Yes | The very next request |
| **Suspend / remove a listing** (the kill switch) | NEWAX ops, `platform.apps.suspend` / `platform.apps.reinstate` | Every installation of the listing on every node | Suspend yes; remove no | Within the feed bound (§3.3) |
| **Revoke a signing key** | NEWAX ops, on a fast-tracked key-rotation version (doc 186 §3.3) | Every token minted with that key, everywhere | No | Within the feed bound |

## 2. Uninstall — the complete revocation, one transaction, waiting on nothing

`AppInstallationsService.uninstall(actor, installationId, reason)` is a
single `prisma.$transaction`. It is also the path the feed poller takes on
a `LISTING_REMOVED` entry, with `reason = LISTING_REMOVED` or
`PUBLISHER_TERMINATED`. Every row it changes is listed, as ruling 6 asks
of a deactivation:

| Row | Change | Why it is enough |
|---|---|---|
| `ApiClient` | `status = REVOKED`, `revokedAt`, `revokedReason`, `revokedById` (null when the platform removed it) — **final**: `api_client_revocation_is_final` refuses any later update | `ApiClientAuthService.authenticate()` checks client status on **every** request with no cache, so every token is refused on its next use |
| `ApiClientToken` (≤ 10 unexpired) | `revokedAt = now` | Belt and braces: a token-level listing also shows each one dead |
| Actor `User` | `isActive = false` | The actor can never be a live principal again. Reinstatement never exists for a revoked client; a reinstall makes a new client and a new actor |
| `AppInstallation` | `status = UNINSTALLED`, `uninstalledAt`, `uninstalledByUserId`, `uninstallReason` | The partial unique index frees the listing for a later reinstall |
| `AppProviderBinding` | `ENABLED`/`DISABLED` → `RETIRED`, `retireGraceUntil = now + 30 days` | Off checkout and fulfilment immediately; the verified-callback grace for references NEWAX created (doc 190 §5) |
| `AppInstallationConsent` pending for this installation | → `EXPIRED` | No approval can resurrect it |
| `OutboxDelivery` rows `PENDING`/`PROCESSING` for this subscriber | → `CANCELLED` | Nothing more of this tenant's data leaves toward the app |
| Outbox | `AppUninstalled` published | Fans out to exactly two rows: the app's **final** `installation.deleted` notice, and the platform subscriber |
| `AuditLog` | `app.uninstalled` via `recordEvidence(tx)`, with the grant that ended | Evidence class (ruling 9): a permission change |

**After commit.** The final notice is signed with the installation's secret
— the secret authenticates *NEWAX to the app* and grants the app nothing,
so keeping it until one notice is delivered widens nothing. When that row
reaches `DELIVERED`, `FAILED_EXHAUSTED` (72 h) or `CANCELLED`, the source's
`onFinal()` nulls `webhookSecretEncrypted` (doc 188 §2.2). The platform
learns through its own delivery, and an unreachable platform delays only
the platform's knowledge (§5).

**Never "disabled but the key still works".** No credential of the app's
survives the transaction: client revoked, tokens revoked, actor inactive.
The only thing that outlives it is doc 190 §5's 30-day window. There,
NEWAX still accepts a *verified report about a payment or shipment NEWAX
itself initiated*. That window grants no read or write of tenant data; it
exists because refusing it would turn money that already moved into an
unrecorded payment.

**What uninstall cannot do, stated on the confirmation dialog.** It cannot
recall data the app already received, and it does not undo writes the app
already made — those stand on their own authorization at the time, the rule
doc 163 applies to a revoked key. The first is the directory policy's
deletion obligation (doc 186 §4 item 2) and §6's confirmation trail.

## 3. The kill switch — NEWAX stops an app on every tenant without touching any tenant's database

### 3.1 The platform side: an append-only log that is also the feed

```prisma
// apps/platform/prisma/schema/app-directory.prisma

enum AppStatusChangeKind {
  VERSION_APPROVED       // doc 185 §5 — tenants upgrade or show "update available"
  LISTING_SUSPENDED
  LISTING_REINSTATED
  LISTING_REMOVED        // terminal — tenants uninstall
  SIGNING_KEY_REVOKED    // a compromised key — tenants revoke tokens minted with it
}

/// Append-only. Never updated, never deleted: a suspension that is later
/// lifted is two rows, not one row overwritten — the history
/// TenantsService.reactivate() loses by clearing suspendedAt in place is
/// kept here on purpose. `seq` is the feed cursor: one writer (the
/// platform), so a monotonic sequence is safe (the adoption test is moot).
model AppListingStatusChange {
  seq              BigInt              @id @default(autoincrement())
  listingId        String
  kind             AppStatusChangeKind
  versionId        String?             // VERSION_APPROVED
  revokedKid       String?             // SIGNING_KEY_REVOKED
  /// Tenant-facing, public-safe text ("Suspended pending a security
  /// review"). The private investigation note lives on the report or version,
  /// never here — this row is served publicly.
  publicReason     String
  actorOpsClientId String
  createdAt        DateTime            @default(now())

  listing AppListing @relation(fields: [listingId], references: [id])

  @@index([listingId, seq])
}
```

`AppModerationService.suspend(listingId, publicReason, actor)` does two
things in one platform transaction: sets `AppListing.status = SUSPENDED`
and appends a `LISTING_SUSPENDED` row. Reinstatement and removal work the
same way (doc 186 §5.3 for who may do each). **Suspending a publisher**
appends one `LISTING_SUSPENDED` row per listing, so tenants need only
understand listings.

### 3.2 The feed: public, cacheable, pulled

`GET /app-directory/v1/status-feed?after=<seq>&limit=500` →
`{ entries: [...], next: <seq> }`, ascending.

It is **`@Public()` on the platform**: an app's listing status and its
public reason are public facts, and the rows hold no tenant data. That lets
it be served with `Cache-Control: public, max-age=15`, `ETag`. At steady
state every tenant is caught up and requests the same `after`, so 50,000
tenants polling each minute hit one cache key. It is the same
platform-deliberately-outside-`OpsAuthGuard` shape as `GET /routing/resolve`
(doc 39, WO-39.3).

**Pull, not push, deliberately.** `apps/platform` has no outbox or outbound
dispatcher (ADR-059), and a push would need a per-tenant inbound credential
and a platform-side delivery engine. More important is doc 39's own
acceptance: "removing the entire control plane … requires zero code changes
inside that deployment". A tenant that *pulls* a public feed stays
independent of the platform, and the platform never writes into any tenant
database. `TenantCredentialResolverService`'s connection-per-call path is
used only for read-only reconciliation (§5), never here.

### 3.3 The tenant side: the poller

`AppStatusFeedCron` (`app-installations`, every 60 s, skipped when
`app-installations` is off or no directory credential is configured) reads
from `AppStatusFeedCursor.lastSeq`:

```prisma
// apps/api/prisma/schema/app-installations.prisma
model AppStatusFeedCursor {
  id            String    @id @default("singleton")
  lastSeq       BigInt    @default(0)
  lastSuccessAt DateTime?
  lastErrorAt   DateTime?
  lastError     String?
}
```

For each entry whose `listingId` matches a non-`UNINSTALLED` installation on
this node, in `seq` order, **one transaction per entry**, advancing the
cursor in the same transaction. A crash then replays at most the entry it
was on, and every handler is idempotent.

| Entry | Tenant action |
|---|---|
| `LISTING_SUSPENDED` | `applyPlatformSuspension()`: installation `SUSPENDED` (`suspendedBy = PLATFORM`, `suspendedReason = publicReason`); `ApiClient` `SUSPENDED`; **every unexpired token revoked** (a suspension must not leave hour-long tokens usable after reinstatement); provider bindings off checkout; fan-out skipped (doc 188); `AppInstallationSuspended` published; one action-hub item for `apps.manage` holders: "NEWAX suspended *App*: *reason*" |
| `LISTING_REINSTATED` | Only if `suspendedBy = PLATFORM`: installation and client `ACTIVE`, bindings restored to their prior state, `AppInstallationReinstated`. The app re-mints tokens. A tenant's own suspension is left alone |
| `LISTING_REMOVED` | `uninstall(reason: LISTING_REMOVED)` — §2 exactly; action-hub item and mail to the installer |
| `SIGNING_KEY_REVOKED` | `revokedKid` removed from `AppInstallation.signingKeys`; `ApiClientsService.revokeTokensForKid(clientId, kid)` revokes exactly the tokens it minted (`ApiClientToken.mintedWithKid`). Tokens from the app's other keys keep working |
| `VERSION_APPROVED` | Doc 185 §5 / doc 187 §5: auto-upgrade (subject to §4.3's confirmation for keys and URLs) or "Update available" |

**The bound, stated as a number, not as "immediately".** In normal
operation a kill switch reaches a tenant within the poll interval (60 s),
plus the feed's cache age (≤ 15 s), plus processing — **under 2 minutes**,
the same style doc 170 §4.1 uses ("revocation lag is bounded by the token
lifetime (≤ 15 minutes) and stated as such"). The tenant's own suspend and
uninstall take effect on the next request, with no bound.

### 3.4 When the platform is unreachable — fail open, visibly

The poller keeps the last-known state. Failing closed ("no confirmation
from NEWAX in N minutes → suspend every app") would make a control-plane
incident a simultaneous outage of every app on every tenant, which is worse
for tenants than the threat it guards against, because the tenant's own
lever is always available locally. The failure is not silent, though:

- `AppStatusFeedCursor.lastSuccessAt` older than 30 minutes →
  `/admin/apps` shows "Can't reach the App Directory since *time* — NEWAX
  safety notices can't reach this system until it reconnects."
- Older than 24 hours → one action-hub item for `apps.manage` holders with
  the same sentence.
- Doc 38's degradation matrix gains the row (doc 194).

## 4. Blast radius — what each compromise can reach, and what stops it

### 4.1 A malicious or compromised app

**Reach:** the tenants that installed it × the keys each granted × the time
until suspension. **It cannot:** hold a non-delegatable, checker or
`org.access.grant` key (doc 189 §3); reach a `@SessionOnly()` route (every
credential, install and approval route); widen its own grant (a re-consent
is a human act on each tenant); read a tenant it was not installed on (§4.4);
learn which tenants installed it from the directory (installs are bucketed,
doc 185 §6); push code into NEWAX (doc 184 §2). **Stopped by:** each
tenant's uninstall or suspend (immediate), NEWAX's kill switch (< 2 min),
the per-client rate limit (doc 189 §4), and the probing signal surfacing
repeated 403s to each tenant (doc 189 §4).

### 4.2 A compromised publisher signing key

**Reach:** whoever holds it can mint tokens — but only for installations
whose id and `API_PUBLIC_URL` they know, since the JWT's `sub` and `aud` bind
it (doc 189 §2.1) — until the key is revoked. **Stopped by:** a fast-tracked
key-rotation version (doc 186 §3.3, same-day SLA) whose approval appends
`SIGNING_KEY_REVOKED`. Every tenant then revokes exactly the tokens minted
with it (§3.3). For certainty, NEWAX suspends the listing first and
reinstates after rotation.

### 4.3 The control plane is not a single point of trust

A compromised `apps/platform` — or a compromised ops credential — could try
to approve a "no re-consent" version that adds an attacker's signing key or
repoints the webhook URL. Doc 185 §5 would auto-apply it, and the platform knows
installation ids (`AppInstallationRecord.installationRef`). That would hand
the attacker every grant of every installation of the app. So **no single
party can change where an app's traffic goes or who can mint its tokens**:

- The app publishes `https://<a verified domain of the currently consented
  manifest>/.well-known/newax-app.json`, listing its current `signingKeys`
  (by `kid` and key) and its endpoint URLs. It is a static file the
  publisher controls, fetched with `safe-https.ts`.
- `AppKeyConfirmationService` applies an **added** key, or a **changed**
  URL, from a `VERSION_APPROVED` entry only when that document — fetched
  from the domain the **previous** consented manifest used — lists the same
  value. It fetches when the entry arrives and retries hourly for 7 days. Until
  confirmed, the old key and URL keep working, and the installation shows
  "Update waiting for the app's confirmation".
- **Removals and revocations apply on either party's word alone** —
  `SIGNING_KEY_REVOKED`, a removed URL, a narrowed grant — because less
  access is always the safe direction.
- **A widening of permissions never auto-applies at all** (doc 185 §5): it
  needs each tenant's own consent, so a compromised platform cannot widen a
  grant.

To hijack an app's traffic or tokens, an attacker now needs **both** the
control plane and the publisher's domain. A compromised platform alone can
still suspend or remove apps — a denial of service in the fail-safe
direction, visible in the append-only log — but it cannot redirect or
impersonate.

### 4.4 Tenant isolation, by construction and by test

- An installation, its `ApiClient`, its token hashes and its webhook secret
  exist only in the installing tenant's database (doc 39: "there is no path
  to any other"). A token presented to another tenant finds no row. A minting
  JWT names one tenant's `API_PUBLIC_URL` as its `aud` (doc 189 §5).
- The platform holds no tenant credential for any app: only public keys,
  listing data, and `AppInstallationRecord`, which holds ids, status and a
  plan. It never writes into a tenant database. Its only read is §5's
  reconciliation query.
- An app cannot enumerate tenants. The directory never returns installers.
  The only party that knows an app is installed on tenant T is T itself,
  the app (told at setup), and NEWAX ops.
- A compromised **tenant** database yields that tenant's token hashes and an
  encrypted webhook secret. With its environment too, it yields that
  tenant's secret — never another tenant's, never a publisher's private key.

## 5. The platform's record, and reconciliation that catches what delivery missed

```prisma
// apps/platform/prisma/schema/app-directory.prisma
enum AppInstallationRecordStatus { PENDING  ACTIVE  SUSPENDED  UNINSTALLED  ABANDONED }

model AppInstallationRecord {
  id                        String                      @id @default(cuid())
  tenantId                  String
  listingId                 String
  installationRef           String                      // the tenant's AppInstallation.id (doc 187 §3)
  versionId                 String
  pricePlanId               String?
  status                    AppInstallationRecordStatus @default(PENDING)
  createdAt                 DateTime                    @default(now())
  activatedAt               DateTime?
  endedAt                   DateTime?
  endedReason               String?
  lastLifecycleDeliveryId   String?                     // X-Newax-Delivery of the last applied notice — idempotency
  /// Doc 186 §4 item 2: the publisher's confirmation that it deleted this
  /// tenant's data after installation.deleted — shown back to the tenant.
  dataDeletionConfirmedAt   DateTime?

  tenant  PlatformTenant @relation(fields: [tenantId], references: [id])
  listing AppListing     @relation(fields: [listingId], references: [id])

  @@unique([tenantId, installationRef])
  @@index([listingId, status])
  @@index([status, createdAt])
}
```

- **Written at preflight** (doc 187 §3 step 3, `PENDING`), **moved by
  lifecycle deliveries** (`POST /app-directory/v1/installations/:ref/lifecycle`,
  `MarketplaceCredentialGuard`, idempotent on `X-Newax-Delivery` via
  `lastLifecycleDeliveryId`), and **swept** by
  `AppInstallationRecordSweepCron` (`PENDING` > 1 h → `ABANDONED`).
- **Reconciled before billing.** A lifecycle notice can exhaust its 72 hours
  while the platform is down. So `AppInstallationReconciliationService`, run
  by the billing cron before invoicing (doc 192 §5), reads each tenant's live
  installations with **one read-only query** through
  `TenantCredentialResolverService`'s connection-per-call path —
  `SELECT "id", "listingRef", "status", "pricePlanKey" FROM "AppInstallation"`.
  That is the narrow-crossing discipline `SeatCounterService` documents:
  one query, no business data, nothing cached, connection closed in the same
  call. A mismatch corrects the record **toward the tenant's truth**, because
  the tenant's database is authoritative for its own installations — and
  flags it for ops, never silently. An uninstall the platform never heard of
  is therefore never billed past the next reconciliation.
- **Deletion confirmation.** `POST /app-directory/v1/publisher/installations/:recordId/data-deleted`
  (`AppPublisherCredentialGuard`, own listing only) sets
  `dataDeletionConfirmedAt`. The tenant's uninstalled-apps history, via the
  proxy, shows "Publisher confirmed deletion on *date*", or "Not confirmed"
  after 30 days, with **Report this app** beside it.

## 6. Data already sent — the one thing revocation cannot reach, said plainly

Every byte an app received through the API or a webhook is on the
publisher's infrastructure. NEWAX cannot delete it, and pretending otherwise
on an uninstall screen would be false. What exists instead:

- The **thin-payload design** (doc 185 §3) means webhooks alone never
  carried records. Only what the app actively fetched with its grant left.
- The **directory policy** obliges deletion within 30 days of
  `installation.deleted` (doc 186 §4). The **final notice** is the trigger,
  and **the confirmation trail** (§5) makes compliance visible per tenant.
- A **report** (`DATA_MISUSE`) starts doc 186 §5's process, up to removal
  and termination.
- The tenant's own **data-processing agreement** with the publisher is the
  tenant's legal instrument. NEWAX's consent screen links the publisher's
  privacy policy and terms before install (doc 187 §2 item 7) so that
  agreement is entered knowingly.

## Scope lenses

**The five shop-scale lenses first.**
*The transaction, start to finish* — install (doc 187) → use → tenant
suspend/reinstate → NEWAX suspend/reinstate/remove → uninstall → final
notice → secret nulled → platform record ended → publisher confirms deletion;
every step names a method above.
*The other side of the same transaction* — NEWAX's moderation tab (doc 186
§6) is the operator twin of the tenant's uninstall. The action hub is the
tenant's twin of NEWAX's kill switch.
*What happens after "done"* — the 30-day provider grace, the deletion
confirmation, reinstatement, reinstall (a new client and actor).
*The integrations a real business needs, not a demo* — a real feed, a real
cross-verification of key changes, real revocation.
*The policy layer that governs it* — the directory policy's deletion and
breach clauses (doc 186 §4); the fail-open rule (§3.4); the
two-party-confirmation rule (§4.3).

**The actor with three tables** — tenant admin (`User`), the app (`ApiClient`
+ actor `User`), NEWAX ops (`PlatformOpsClient`), the publisher
(`AppPublisher`). The installation is named in both databases by one id
(`AppInstallation.id` = `AppInstallationRecord.installationRef`).
**The principal with no permission key** — the feed poller authenticates to
nothing (the feed is public) and writes only to its own tenant. The platform
lifecycle route is authenticated by the tenant's existing directory
credential. The publisher's deletion confirmation is authenticated by
`AppPublisherCredentialGuard` for its own listing.
**The grant that ends itself** — tokens at most 60 minutes, checked per
request. Uninstall ends the client with a trigger-final `REVOKED`. A kill
switch suspends within the feed bound. Doc 190's grace ends at
`retireGraceUntil` by cron. Liveness is **never** read from a cron's
display flag. Like `SupportAccessGrant`, enforcement re-derives from
`ApiClient.status` and `ApiClientToken.expiresAt` on each request — the
poller *writes* the status, and the guard *reads* it fresh.
**Whose rows, and which columns** — the feed carries only public status and
public reasons, never tenant data. `AppInstallationRecord` is visible to
NEWAX ops and, for its own rows, to the tenant through the proxy; a
publisher sees only bucketed counts and its own deletion confirmations. The
reconciliation query selects four columns of one tenant table.
**The threshold nobody approves alone** — NEWAX: reinstatement by a second
ops principal (suspender ≠ reinstater, doc 186 §5.3); suspension by one,
because speed is the point. Tenant: uninstall and suspend by one
`apps.manage` holder, because removing access is never gated (ruling 2); a
tenant reinstatement of its own suspension by one, since it restores a grant
already approved at consent.
**The toxic pair, caught at grant or at act** — `AppModerationService.reinstate()`
refuses the suspender, comparing `actorOpsClientId` on the suspension's
`AppListingStatusChange`. `AppReviewService.approve()` refuses the ops client
that issued the publisher's credential (doc 186 §3.3), which matters here
because a key-rotation approval revokes keys.
**Authority and blast radius** — the widest act is `LISTING_REMOVED`, which
uninstalls the app from every tenant within the bound: it needs
`platform.apps.reinstate` (the risky direction), and it appends a row naming
the actor and public reason. The worst undetected act is §4.3's hijack,
which needs two independent parties. Every act is a new
`AppListingStatusChange` row, with old and new status recoverable from
consecutive rows, never an overwrite.
**Audience is a capability, not an address** — a platform suspension or
removal reaches each affected tenant's `apps.manage` holders through the
action hub (one item per installation), plus one mail to the installer
resolved from `AppInstallation.installedByUserId`. It is skipped if that user
is inactive or has no email; the hub item still stands. Zero holders: the
item waits for whoever is next granted `apps.manage`. Two hundred holders:
two hundred hub entries, zero mail blast. Ops receive the ops digest
(`PLATFORM_OPS_ALERT_EMAIL`).
**Request or record — classify every write** — uninstall and tenant suspend
are RECORDS of the tenant's decision, never refused and never waiting on a
dependency. Feed entries are RECORDS of NEWAX's decision, applied without
refusal. A key or URL *addition* is a REQUEST that §4.3's confirmation may
defer, never a record. Reinstatement by NEWAX is a REQUEST (second
principal).
**The movement with no address** — n/a: revocation moves no stock or cash;
doc 190 §5's grace settles payments already initiated, each on its order's
existing record.
**Four hours down, the counter stays open** — platform down: tenants keep
last-known state (fail open, shown after 30 min, hub item after 24 h); every
tenant lever still works locally; lifecycle notices queue for 72 hours
(doc 188) and reconciliation catches the rest (§5). App down: its final
notice exhausts; the secret is nulled anyway. Tenant down: nothing to
revoke until it is back; its apps cannot authenticate either.
**The unwritten posting rule** — n/a: revocation posts nothing. A paid app's
subscription ending is doc 192 §3's (NEWAX's books, not the tenant's).
**Every column or none** — n/a: no `JournalLine`.
**The period that already moved** — n/a: nothing dated into a
`FiscalPeriod`.
**The second legal entity** — n/a: revocation is per node, and a second
brand on its own node revokes independently.
**Dry run before live** — the feed handlers' decision — what this entry
means for this installation — is a pure `planFeedEntry(entry, installation)
→ action[]`. Its second caller is the ops tab's "Preview impact" (a count of
installations per status the suspension would touch, from
`AppInstallationRecord`) before an ops principal confirms.
**Click the number** — ops' "Suspending this affects 1,240 installations"
drills into `AppInstallationRecord` rows `WHERE listingId = … AND status =
ACTIVE`. The tenant's "Can't reach the App Directory since …" drills into
`AppStatusFeedCursor`'s last error.
**Three silhouettes, and the day the tier above appears** — *Solo:* one node,
one poller. *Chain/Organization:* every node polls for itself and revokes its
own installations; nothing is propagated between nodes because nothing app-
related is replicated. The day a parent node appears above, a child's
installations and their revocation are unchanged — each is node-local.
**The absent collaborator** — `app-installations` off: no poller, no
installations, nothing to revoke. No directory credential: the poller is
skipped (the feed is public, but a node with no installations has nothing to
apply) and the tenant levers work. Notifications off: hub items still
appear. `accounting`, `organization`: irrelevant here.
**The second copy of the write** — uninstall is predicate-on-write
(`status <> 'UNINSTALLED'`), and the trigger makes a second revoke a refusal
the service treats as done. Feed entries are applied one per transaction with
the cursor, so a replayed `seq` is a no-op (every handler checks current
state first). The lifecycle route is idempotent on `X-Newax-Delivery`;
reconciliation is an idempotent convergence.
**The hundred-thousandth row** — `AppListingStatusChange` grows by review and
moderation acts: thousands a year, read by `seq` range from the primary key.
`AppInstallationRecord` at 50,000 tenants × a few apps is hundreds of
thousands of rows, indexed `(listingId, status)` for kill-switch impact and
`(tenantId, installationRef)` for idempotency. The tenant poller reads at most
500 feed entries per minute and touches only matching installations.
**The adoption test** — `AppListingStatusChange.seq` is a platform sequence
from a single writer. Tenant ids are cuids. Nothing here is generated on two
nodes and merged.
**The reversal document, not the reversal flag** — a platform suspension's
reversal is its own `LISTING_REINSTATED` row, never an edit. Uninstall has no
reversal: a reinstall is a new installation, new client, new actor, with the
old ones kept as history. A tenant suspension's reversal is a reinstate
recorded as an `AppInstallationReinstated` event and evidence row.
**The undo fan-out** — uninstall: §2's table, each row automatic; data
already sent — deliberately irreversible from NEWAX's side (§6), human and
contractual through the deletion confirmation. Platform suspension: tokens
revoked (automatic, deliberately not restored on reinstatement), bindings
off (automatic), deliveries held (automatic). Removal: as uninstall.
**The version stamp** — every lever writes an append-only row:
`AppListingStatusChange` on the platform; consent, installation fields and
evidence audit on the tenant. "Why was this app suspended on 3 March" is
answered by the row with that `seq` and its public reason.
**The erasure the ledger cannot obey** — `publicReason` is written for public
display and must name no person. `AppInstallationRecord` holds no person. A
tenant's evidence rows keep actor foreign keys to ruling 1's tombstone. The
app's copy of a person's data is outside this database (§6), with the
deletion confirmation as its trail.
**The failure path, and who is allowed to walk it** — feed failures:
`AppStatusFeedCursor.lastError`, shown on `/admin/apps` to `apps.manage`,
retried each minute. Key confirmation pending: shown per installation,
retried hourly for 7 days, then held with an ops-digest line (the publisher's
domain does not confirm its own new key). Lifecycle notices exhausted:
`OutboxDelivery` dead letters with replay (doc 188 §6), and §5's
reconciliation regardless. A final notice exhausted: the secret is nulled
anyway, because ending the grant never waits on the app.

**Catalogue lenses this surface fires.**
*The switch, its scope, and who may throw it* — tenant switch: one
installation, `apps.manage`, immediate, evidence-audited. NEWAX switch: one
listing on every node, `platform.apps.suspend`, < 2 min, appended to the
public log. Reinstatement needs a different ops principal.
*Which tier owns the credential* — the tenant node owns every installation
credential; the platform owns none; the publisher owns the private key. The
two-party rule (§4.3) keeps the platform from becoming the owner by the back
door.
*Delivery is a fact, not a hope* — the final notice's `OutboxDelivery` row
answers whether the app was told. `dataDeletionConfirmedAt` answers whether
it acted.

## Work orders

**WO-191.1 — platform schema**: `AppStatusChangeKind`,
`AppListingStatusChange`, `AppInstallationRecordStatus`,
`AppInstallationRecord`.
**WO-191.2 — `AppModerationService`** writes the log (with doc 186
WO-186.6); `planFeedEntry()`-backed impact preview on the ops tab.
**WO-191.3 — the status feed** route (`@Public()`, cache headers, keyset by
`seq`).
**WO-191.4 — tenant uninstall**: `AppInstallationsService.uninstall()` per
§2's table in one transaction; the final notice; `onFinal()` secret nulling;
the confirmation dialog's wording.
**WO-191.5 — `AppStatusFeedCron`** + `AppStatusFeedCursor`; the five
handlers, one transaction per entry; token revocation on suspension; the
30-min/24-h visibility.
**WO-191.6 — `AppKeyConfirmationService`**: fetch and compare the
well-known document with `safe-https.ts`, the retry schedule, the held state;
the `/.well-known/newax-app.json` format published in `/ui/developers`.
**WO-191.7 — platform record**: lifecycle route, sweep cron,
`AppInstallationReconciliationService` (one read-only query per tenant,
correcting toward the tenant), publisher deletion-confirmation route, and
the tenant-side view of it.
**WO-191.8 — tests**: a two-tenant isolation test in the style of doc 39's
acceptance (a token and a JWT for A refused by B under a forced
misconfiguration); a kill-switch test (suspend on the platform → tenant
refuses tokens within one poll); a hijack test (a `VERSION_APPROVED` adding a
key without the well-known confirmation never lets the new key mint); a
fail-open test (feed unreachable → apps keep working, warning shown).

## Acceptance

- After uninstall, the app's next request with any token it holds is refused
  with 401 "revoked: UNINSTALLED"; no code path can un-revoke the client.
- Uninstall succeeds with the platform unreachable; the platform's record
  converges by delivery or, failing that, by reconciliation before the next
  invoice.
- A platform suspension reaches a tenant within one poll plus cache age and
  revokes every unexpired token; reinstatement requires a different ops
  principal and does not revive old tokens.
- `SIGNING_KEY_REVOKED` revokes exactly the tokens minted with that `kid`.
- A key or URL addition not confirmed by the app's well-known document on the
  previously consented domain is never applied; a removal applies at once.
- Feed unreachable: every installed app keeps working, and the warning
  appears after 30 minutes.
- A token or minting JWT from tenant A is refused by tenant B.
- `AppListingStatusChange` has no update or delete path.

## Out of scope

Recalling or verifying deletion of data an app already holds, beyond the
policy, the final notice and the confirmation trail (§6) — technically
impossible from NEWAX's side, and not pretended. Cross-tenant automated
anomaly detection feeding the kill switch (doc 186 §5.2, later). A
tenant-configurable fail-closed mode for the feed — only if a regulated
tenant asks, as an explicit, documented choice.
