# 171 — Layer 2: a per-tenant Build Manifest and a controlled Update Agent, on doc 39's tenant row and doc 37's rollout rules

> **Status: proposed (2026-09-27), not yet built.** Every mechanism this layer
> needs to *decide* a rollout already exists and is reused rather than
> reinvented: `FeatureFlag`'s precedence rules and maker-checker (doc 37,
> ADR-068), `DeploymentProvisioner` and its `prisma migrate deploy` step
> (doc 39), `TenantExportService`'s `pg_dump` export (doc 39 WO-39.7), and
> `GET /meta` as the running deployment's own statement of what it is. What is
> genuinely new is the control-plane state that says **which release and which
> `MODULES` set each tenant should be running**, and the Update Agent that moves
> a tenant between releases one idempotent, resumable step at a time.

## 1. What already exists

`RETAIL-ERP.md` Part 4 opens its pipeline with "SME modules (active manifest) →
`MODULES` + `MODULE_PACKS` + `GET /meta` — ALREADY SHIPPED". That is true, and it
is the whole of the manifest today:

- **`MODULES`** — an env var per deployment, parsed by `env.validation.ts`,
  applied at boot by `modules.registry.ts` (`FEATURE_MODULES`, `offByDefault`,
  `alwaysOn`).
- **`GET /meta`** — `core/config/meta.controller.ts` returns
  `{ modules, packs, nodeRole }`: the deployment's own account of what it
  booted. It does not report *which build* it is.
- **`FeatureFlag`** — in-tenant, per-behaviour de-risking:
  `FeatureFlagsService.isEnabled(key, organizationId)`
  (`core/feature-flags/feature-flags.service.ts:60`) with the precedence
  killSwitch → allowlist → stable SHA-256 bucket → missing row fails closed,
  and `FeatureFlagsAdminService.proposeRollout()/approveRollout()` refusing the
  proposer on a `moneyOrStockPath` flag.
- **Provisioning** — `ProvisioningService.provisionTenant()` (idempotent on
  `slug`, resumable from `PROVISIONING`) calls a `DeploymentProvisioner`; the
  real `PostgresDatabaseProvisioner` runs `CREATE DATABASE` and then
  `applyTenantSchema()` — `prisma migrate deploy` against `apps/api`'s own
  migration history (`postgres-database.provisioner.ts:73`, `:89`).
- **What is explicitly nobody's yet.** Doc 37's own out-of-scope: "Blue-green or
  canary infrastructure-level deployment (this document's flags are
  application-level rollout control; infrastructure deployment strategy is an
  operations decision… named in doc 39 where it actually matters at platform
  scale)". Doc 39's own out-of-scope: the orchestrator. So *moving a tenant from
  one build to the next* has no owner today. This layer is that owner, at the
  level of state and decisions — never the orchestrator.

## 2. What "version-pinned modules" can honestly mean here

`RETAIL-ERP.md` R1: "One schema, one image, one commit." Every module in a
release ships in the same image against the same migration head. A tenant
therefore **cannot** run `planning` from release 41 beside `orders` from
release 38 — and should not be able to: per-module versions would need
per-module schemas and per-module migration streams, which is precisely the
drift R1 exists to prevent.

So the manifest pins two things, and de-risking happens at two levels:

| Level | Pins | Decided in | Mechanism |
|---|---|---|---|
| **Release** — which image, which migration head | `PlatformRelease` | the control plane | this document's `ReleaseRollout`, per tenant ring |
| **Module set** — which modules boot | `MODULES` | the control plane | the manifest's `modules` list, rendered into the tenant's environment |
| **Behaviour inside a module** — which code path a request takes | `FeatureFlag` | the tenant's own database | doc 37, unchanged |

"A module's version" is therefore "the release that ships it", and a tenant's
Build Manifest is: **release + `MODULES` + `NODE_ROLE` + resource tier**.

## 3. Schema — additive to `apps/platform/prisma/schema/platform.prisma`

Checked first: `platform.prisma` and `marketplace.prisma` declare no model or
enum containing `Release`, `Manifest`, `Rollout` or `Update` (grep over both).

```prisma
/// One buildable, deployable release of the tenant application (apps/api +
/// apps/web built together, R1). Immutable once registered — a fix is a new
/// release, never an edited row (the version-stamp lens).
model PlatformRelease {
  id              String   @id @default(cuid())
  /// "2026.10.1" — human-facing; unique.
  version         String   @unique
  /// The immutable image reference the orchestrator deploys — a digest,
  /// never a mutable tag.
  imageDigest     String   @unique
  /// The last migration directory name in this release's apps/api history —
  /// what `prisma migrate deploy` will bring a tenant database up to.
  migrationHead   String
  /// Whether this release's new migrations are all expand-phase (additive,
  /// old code still runs against the new schema) or include a contract step.
  /// Decides whether an app-image rollback is safe (§5).
  migrationSafety ReleaseMigrationSafety
  /// Set by the release author when the diff touches a money- or stock-
  /// writing path (the list in §6). Mirrors FeatureFlag.moneyOrStockPath.
  moneyOrStockPath Boolean @default(false)
  /// The distinct MODULES sets this release has been boot-tested against in
  /// CI (§7) — a manifest whose set is absent here cannot receive it.
  bootTestedModuleSets Json
  releaseNotes    String
  registeredById  String
  createdAt       DateTime @default(now())

  rollout   ReleaseRollout?
  manifests TenantBuildManifest[] @relation("PinnedRelease")
}

enum ReleaseMigrationSafety {
  EXPAND_ONLY
  INCLUDES_CONTRACT
}

enum ReleaseRing {
  CANARY    // NEWAX's own internal tenants
  EARLY     // tenants who opted in
  GENERAL
  PINNED    // never moved by the Update Agent; only an explicit, approved change
}

/// What one tenant SHOULD be running. The running deployment's own
/// GET /meta is what it IS running; the Update Agent closes the gap.
model TenantBuildManifest {
  id               String      @id @default(cuid())
  tenantId         String      @unique
  releaseId        String
  /// Exactly the MODULES allowlist the tenant's instance boots with — the
  /// control plane renders it into the instance's environment; the tenant
  /// reports it back through GET /meta (drift check, §5 VERIFY).
  modules          String[]
  nodeRole         String      @default("STANDALONE") // every pilot SME is Solo edition (R14)
  ring             ReleaseRing @default(GENERAL)
  /// The tenant's own business-hours-safe window, in its StoreTimezone —
  /// the Update Agent never starts a MIGRATE/ROLL step outside it.
  updateWindowStartLocal String @default("02:00")
  updateWindowEndLocal   String @default("05:00")
  /// Set while a pilot cutover is in parallel running (doc 179) — the Update
  /// Agent refuses to move a frozen tenant, whatever its ring.
  frozenUntil      DateTime?
  frozenReason     String?
  updatedAt        DateTime    @updatedAt

  tenant  PlatformTenant  @relation(fields: [tenantId], references: [id])
  release PlatformRelease @relation("PinnedRelease", fields: [releaseId], references: [id])

  @@index([ring, releaseId])
}

/// How far a release has been offered — FeatureFlag's own fields and
/// precedence, applied to (release, tenant) instead of (flag, organization).
/// §4 explains why this is the same mechanism, not a second one.
model ReleaseRollout {
  id               String   @id @default(cuid())
  releaseId        String   @unique
  ring             ReleaseRing          // the widest ring currently offered
  rolloutPercent   Int      @default(0) // within that ring, by rolloutBucket(release.version, tenantId)
  enabledTenantIds String[]             // explicit allowlist, precedence over percent
  killSwitch       Boolean  @default(false) // stop offering this release to anyone, now
  /// Set automatically when a ring's failure rate crosses the halt threshold
  /// (§5) — stopping is unilateral; resuming a money/stock-path release is not.
  haltedAt         DateTime?
  haltedReason     String?
  /// The identical pending maker-checker pair FeatureFlag carries.
  proposedRing           ReleaseRing?
  proposedRolloutPercent Int?
  proposedKillSwitchOff  Boolean  @default(false)
  proposedById           String?
  proposedAt             DateTime?
  approvedById           String?
  approvedAt             DateTime?
  updatedAt        DateTime @updatedAt

  release PlatformRelease @relation(fields: [releaseId], references: [id])
}

enum TenantUpdateStep {
  PLANNED
  PREFLIGHT
  SNAPSHOT
  MIGRATE
  ROLL
  VERIFY
  DONE
  HELD     // stopped for a human, with a reason — never silently retried forever
  FAILED
}

/// One attempt to move one tenant from one release (and module set) to
/// another. The Update Agent's own durable state machine — the resumable
/// shape ProvisioningService already uses for PROVISIONING.
model TenantUpdateAttempt {
  id             String           @id @default(cuid())
  tenantId       String
  fromReleaseId  String
  toReleaseId    String
  fromModules    String[]
  toModules      String[]
  step           TenantUpdateStep @default(PLANNED)
  /// The TenantDataExport taken at SNAPSHOT — the restore point if MIGRATE
  /// fails half-way (§5).
  snapshotExportId String?
  startedAt      DateTime         @default(now())
  finishedAt     DateTime?
  failureReason  String?
  /// Idempotency: one live attempt per (tenant, target) — a re-run of the
  /// agent resumes it, never starts a second one.
  attemptKey     String           @unique  // `${tenantId}:${toReleaseId}:${sortedModulesHash}`

  @@index([tenantId, startedAt])
  @@index([step])
}
```

`PlatformTenant` gains the back-relation `buildManifest TenantBuildManifest?`
and nothing else — the manifest is its own row so a tenant with no manifest yet
(every tenant provisioned before this ships) is simply "not managed by the
Update Agent", the same "nullability *is* the state" idiom doc 14 used for
`apiKeyHash`.

## 4. One rollout algorithm, across two databases

The instruction for this layer was *never invent a second rollout mechanism*.
It is kept literally, and the one place that looks like a second mechanism —
`ReleaseRollout` beside `FeatureFlag` — is explained, not waved through:

- **One algorithm.** `FeatureFlagsService.stableBucket()` is private today
  (`feature-flags.service.ts:78`): SHA-256 over `${key}:${subjectId}`, first 4
  bytes as an unsigned int, modulo 100. It is extracted verbatim into
  `packages/shared` as `rolloutBucket(key, subjectId)`; `FeatureFlagsService`
  calls the shared function (a behaviour-preserving refactor, proven by a spec
  that asserts identical buckets for a fixed corpus of keys and ids before and
  after), and the control plane calls the same function with
  `(release.version, tenantId)`. Widening a release from 20% to 40% therefore
  only ever *adds* tenants, exactly as widening a flag only adds organisations.
- **One precedence.** killSwitch forces off → `enabledTenantIds` forces on →
  `rolloutPercent` by bucket → no rollout row fails closed ("not offered").
- **One maker-checker.** A `moneyOrStockPath` release's move to `GENERAL` at
  100%, or its kill-switch clear, goes through propose → approve with the
  approver refused if equal to the proposer — the shape `approveRollout()`,
  `SettlementsService.approveWriteoff()` and `BankFacilityDrawdown` already
  share (ADR-068's own reasoning, reused).
- **Two tables, because two databases.** A `FeatureFlag` row lives in a
  tenant's own database and decides behaviour *inside* a running deployment.
  Which release that deployment *is* has to be decided before it boots, by
  something outside it. Writing release decisions into each tenant's
  `FeatureFlag` table would make a tenant's own data depend on the control
  plane — breaking doc 39's acceptance criterion that "removing the entire
  control plane… requires zero code changes inside that deployment". The table
  is duplicated because the isolation boundary requires it; the mechanism is
  not.

## 5. The Update Agent

`TenantUpdateService` (the state machine) and `TenantUpdateCron` (the driver),
in a new `apps/platform/src/modules/releases/` module. **Controlled** means:
it never moves a `PINNED` or frozen tenant, never starts a disruptive step
outside the tenant's own update window, never runs more than a configured
number of attempts at once (`PLATFORM_UPDATE_MAX_CONCURRENT`), and halts a
whole ring on its own evidence.

| Step | What it does | Idempotent / resumable because | On failure |
|---|---|---|---|
| `PLANNED` | The cron finds tenants whose manifest release ≠ the release offered to their ring (§4) and creates one attempt per tenant via `attemptKey` | `attemptKey @unique` — a second run finds the same attempt | — |
| `PREFLIGHT` | Refuses if: the tenant is `PINNED` or `frozenUntil > now`; the target release's `bootTestedModuleSets` does not contain this manifest's `toModules` (§7); the target is `INCLUDES_CONTRACT` and its rollout lacks an approval; the tenant's `PlatformTenant.status` is not `ACTIVE`/`TRIAL` | Pure checks, no write but the step | `HELD` with the refusing reason |
| `SNAPSHOT` | Calls `TenantExportService.requestExport(tenantId, 'MANUAL')` (`tenant-export.service.ts:36`, which runs `PgDumpExportRunner`'s `pg_dump --format=custom`) and waits for the `TenantDataExport` to reach `COMPLETE` | Re-uses a `COMPLETE` export taken for this attempt | `HELD` — no migration ever runs without a restore point |
| `MIGRATE` | `DeploymentProvisioner.upgrade()` — a new interface method whose Postgres implementation is the existing private `applyTenantSchema()` (`prisma migrate deploy`), made public | `prisma migrate deploy` is itself idempotent over `_prisma_migrations` | `FAILED`; see "half-migrated" below |
| `ROLL` | Asks the orchestrator to run the target `imageDigest` with the rendered `MODULES` — through `DeploymentProvisioner.rollApplication()`, an interface method whose implementation is the operator's (doc 39: orchestrator out of scope) | Re-requesting the same digest is a no-op for any orchestrator worth using | For `EXPAND_ONLY`: roll back to `fromRelease`'s digest (old code runs on the expanded schema by construction). For `INCLUDES_CONTRACT`: `HELD` — never an automatic rollback past a contract step |
| `VERIFY` | Polls the tenant's `GET /meta` until it reports `release == toRelease.version` and `modules == toModules`, and `GET /health/ready` returns 200, within `PLATFORM_UPDATE_VERIFY_TIMEOUT_MINUTES` | Pure reads | Same as `ROLL`'s failure column |
| `DONE` | Sets `TenantBuildManifest.releaseId`/`modules` to the target | Single update keyed by tenant | — |

**The database never rolls back.** Migrations are hand-written and forward-only
(ADR-008, `00-HOUSE-RULES.md`). "Rollback" at this layer means the *application
image* only, and is automatic only when every migration in the release is
expand-phase. A half-applied migration (`MIGRATE` failed mid-way) leaves
`_prisma_migrations` recording exactly which steps ran; the attempt is `FAILED`
with the Prisma error, the tenant keeps serving on its old image against a
schema that is at worst partially expanded (safe for old code, by the
expand/contract rule), and recovery is either re-running `MIGRATE` after a fix
release or restoring the `SNAPSHOT` export — a human decision on a screen, never
automatic.

**Auto-halt.** When the share of `FAILED`/`HELD` attempts for a release within a
ring over the trailing hour exceeds `PLATFORM_UPDATE_HALT_FAILURE_PCT` (and at
least `PLATFORM_UPDATE_HALT_MIN_ATTEMPTS` attempts ran), the agent sets
`ReleaseRollout.haltedAt` and stops planning new attempts for that release.
Stopping is unilateral, the error-budget freeze posture doc 38 §3 names;
resuming a `moneyOrStockPath` release is the maker-checker transition of §4.

**`GET /meta` gains one field.** `apps/api`'s `MetaController.get()` adds
`release: string` read from a `BUILD_RELEASE` env var baked at image build —
additive to the response (never a version bump, doc 37 §1). It is the only
`apps/api` change this layer makes, and it is what makes drift detectable:
declared (manifest) vs. running (`/meta`).

## 6. Which releases count as money/stock-path

`PlatformRelease.moneyOrStockPath` is set by the release author, and CI refuses
to register a release with it `false` when the release's diff touches any of:
`apps/api/src/modules/inventory/inventory.service.ts`,
`apps/api/src/modules/payments/**`, `apps/api/src/modules/settlements/**`,
`apps/api/src/modules/accounting/**`, `apps/api/src/modules/orders/orders.service.ts`,
`apps/api/src/modules/wallet/**`, `apps/api/src/modules/purchasing/purchasing.service.ts`,
the connectors module's sink promotion path (doc 172 §8), or any migration.
The list is data in the CI script, reviewed like code; the check can only make
a release *more* guarded, never less.

## 7. The boot test per `MODULES` set — closing `ENTERPRISE-SCALE.md`'s S4 gap where it bites

`ENTERPRISE-SCALE.md`'s enforcement table lists "S4 pack absence survivable —
nothing; no boot test per `MODULES` set — **review — gap**", and names the fix:
"One CI job per representative `MODULES` set would close it." At 50,000 tenants
this stops being theoretical: a release that fails to boot for one module
combination breaks every tenant with that combination at once.

The representative sets are not guessed. They are the **distinct `modules`
arrays present in `TenantBuildManifest`** — the pilot SME fleet will share a small
number (connect-only, invoicing-migrated, full-engine; doc 179's waves), and
the control plane exports that list to CI. A CI job boots `apps/api` against a
freshly migrated database once per set and requires `/health/ready` and
`GET /meta` to answer; the passing sets are recorded on
`PlatformRelease.bootTestedModuleSets`. `PREFLIGHT` refuses any tenant whose
set is not in it. This does not close S4 for every conceivable set — only for
every set actually deployed, which is the one that matters.

## Scope lenses

Shared lenses are answered in doc 172 (ingestion) and doc 175 (money); the
lines below answer what this document's own artifacts introduce: the four
control-plane tables, the Update Agent, `/meta.release`, and the per-set boot
test.

**The actor with three tables** — NEWAX hosting-operations staff (doc 170 §3.4) and
`PlatformOpsClient` automation are the only actors; a tenant never writes its
own manifest.
**The principal with no permission key** — the Update Agent runs as the
control plane itself (a cron), authorised by the state a human approved;
`GET /meta` is `@Public()` today and stays so (it exposes module names and a
release string, nothing tenant-specific beyond them).
**The grant that ends itself** — `frozenUntil` ends a cutover freeze without a
human remembering; a `PINNED` ring does not end on its own, deliberately, and
the release screen lists every pinned tenant with its age.
**Whose rows, and which columns** — manifests and releases are visible to
`platform.releases.manage`; a tenant never sees another tenant's manifest;
`imageDigest` is operator data, not tenant-facing.
**The threshold nobody approves alone** — a `moneyOrStockPath` release to
`GENERAL` 100% and its kill-switch clear require `platform.releases.approve`
held by someone other than the proposer; an `INCLUDES_CONTRACT` release
requires the same approval before `PREFLIGHT` passes for any tenant.
**The toxic pair, caught at grant or at act** — `platform.releases.manage` +
`platform.releases.approve` in one principal is allowed (as ADR-068 allows the
flag pair on ADMIN) because the approve method refuses the proposer at the act.
**Authority and blast radius** — the worst value is a `rolloutPercent` of 100
in `GENERAL` for a broken release; bounded by `PLATFORM_UPDATE_MAX_CONCURRENT`
and auto-halt; the audit row is the `ReleaseRollout` proposal/approval pair
plus an evidence-class entry with old and new ring and percent.
**Audience is a capability, not an address** — a halted release notifies holders
of `platform.releases.manage`; a tenant whose attempt is `HELD` is told through
its `billingContactEmail` (doc 39's own tenant audience column) only when the
hold affects its service.
**Request or record — classify every write** — proposing a rollout: REQUEST.
A `TenantUpdateAttempt` step transition: RECORD of what the agent did. A
failure is recorded, never swallowed.
**The movement with no address** — n/a: no stock or cash moves.
**Four hours down, the counter stays open** — control plane down: no tenant is
moved; every running tenant keeps running its current release. A tenant down
mid-`ROLL`: the orchestrator's own restart; `VERIFY` times out into `HELD`.
**The unwritten posting rule / Every column or none / The period that already
moved / The second legal entity** — n/a: no money fact.
**Dry run before live** — `PREFLIGHT` is pure and can run for every tenant in a
ring as a report ("which tenants would this release reach, and which would it
refuse, and why") before any rollout percent moves.
**Click the number** — a ring's "37 of 1,200 updated" links to the exact
`TenantUpdateAttempt` rows.
**Three silhouettes, and the day the tier above appears** — every pilot SME is
`STANDALONE`; the manifest's `nodeRole` column exists so a chain SME's BRAND and
BRANCH nodes are managed by the same table the day one appears.
**The absent collaborator** — no manifest row: the tenant is simply not managed
(today's behaviour). No orchestrator implementation of `rollApplication()`:
`ROLL` goes straight to `HELD` with "no orchestrator configured" — never a
silent success.
**The second copy of the write** — `attemptKey @unique`; `DONE`'s manifest
update is a single idempotent write.
**The hundred-thousandth row** — `TenantUpdateAttempt` grows one row per tenant
per release: 50,000 × ~26 releases/year ≈ 1.3 M rows/year, indexed by
`[tenantId, startedAt]` and `[step]`; aged out of the hot path once `DONE` rows
are older than the dispute window.
**The adoption test** — `PlatformRelease.version` is unique and centrally
assigned; no node generates one.
**The reversal document, not the reversal flag** — a bad release is superseded
by a new release, never an edited one; a rolled-back tenant is a new attempt
back to the previous release, recorded.
**The undo fan-out** — setting a kill switch: new attempts stop (automatic);
in-flight attempts finish their current step and then halt (automatic);
tenants already moved stay moved until a new release or an explicit attempt
back (human).
**The version stamp** — each attempt names the exact from/to release and
module sets; a tenant's history is reconstructible from its attempts.
**The erasure the ledger cannot obey** — no personal data is held here.
**The failure path, and who is allowed to walk it** — `HELD`/`FAILED` attempts
list on the release screen (`platform.releases.manage`), with the reason, the
snapshot export id, and two actions: retry the step (safe by the idempotency
column above) or restore from snapshot (maker-checker).

## Work orders

**WO-171.1 — Extract `rolloutBucket()`** into `packages/shared`; point
`FeatureFlagsService` at it; spec proving bucket identity over a fixed corpus.
**WO-171.2 — Control-plane schema**: `PlatformRelease`, `TenantBuildManifest`,
`ReleaseRollout`, `TenantUpdateAttempt`, the enums, `PlatformTenant`
back-relation; hand-written forward-only migration.
**WO-171.3 — `DeploymentProvisioner.upgrade()` / `.rollApplication()`**: the
Postgres implementation of `upgrade()` exposes `applyTenantSchema()`;
`rollApplication()` ships as an interface with a refusing default.
**WO-171.4 — `TenantUpdateService` + `TenantUpdateCron`**: the §5 state
machine, windows, concurrency cap, auto-halt.
**WO-171.5 — `/meta.release`** from `BUILD_RELEASE`, set in the image build.
**WO-171.6 — Per-set boot test CI job** fed by the manifests' distinct module
sets; writes `bootTestedModuleSets`.
**WO-171.7 — Money/stock-path CI guard** (§6).
**WO-171.8 — Release screens + permissions** on the control plane
(`platform.releases.manage`/`.approve`), on the staff sign-in of WO-170.7.

## Acceptance

- `FeatureFlagsService.isEnabled()` returns identical results for a fixed
  corpus before and after WO-171.1.
- Running the Update Agent twice for the same tenant and target creates one
  `TenantUpdateAttempt`.
- A tenant whose `modules` set is not in the target release's
  `bootTestedModuleSets` is `HELD` at `PREFLIGHT`, never migrated.
- No `MIGRATE` step starts without a `COMPLETE` snapshot export for that
  attempt.
- An `INCLUDES_CONTRACT` release is never automatically rolled back; an
  `EXPAND_ONLY` release that fails `VERIFY` is rolled back to its previous
  digest, proven in a test environment with a deliberately broken image.
- A `moneyOrStockPath` release cannot reach `GENERAL` 100% with one person
  acting alone.
- Auto-halt stops a release after the configured failure share, proven with
  forced failures.

## Out of scope

The orchestrator itself (doc 39 and doc 37 both leave it to the operator —
NEWAX's own hosting-operations team chooses it; this layer calls it through
`rollApplication()`). Per-module independent versions (refused by R1, §2).
Automatic database rollback (forward-only by ADR-008). Rolling releases to
self-hosted or desktop nodes (doc 48) — they update through doc 11/12's
extractor path, not the control plane.
