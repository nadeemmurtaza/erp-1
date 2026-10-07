# 37 — Scaling for future upgrades and additions without a rewrite

`MULTI-SECTOR.md` and `CLAUDE.md`'s "Scale: the three axes" already answer
**where new domain capability goes** (a module pack, a `Location`, a brand
value — never a git branch, never an `if`). `ENTERPRISE-SCALE.md` already
answers **where new tenant/branch capacity goes** (a node, a database, a
scoped query). Neither answers a third, different question this document
exists for: **how does an already-running system accept a code change —
a new interface implementation, a new API version, a new module — without
a client on the old version breaking, and without a feature rolling out to
everyone at once being the only option.** That is a software-lifecycle
question, not a data-shape or a tenancy question, and this repository has
no document for it today.

> **Status (2026-09-27): built, WO-37.1–37.5, with two named exceptions
> deferred by ADR-037/doc 34, not built here.** `core/versioning/`
> (`ApiVersionPolicyService` + `DeprecationHeaderInterceptor`, bound
> globally in `app.module.ts`) implements the `Deprecation`/`Sunset` (RFC
> 8594) header mechanism this document's §1 asks for — unit-tested by
> directly registering a fake deprecated version and asserting the headers
> and the post-sunset 404 both appear, since nothing has ever actually been
> deprecated (v1 is the only version this platform has ever shipped) and
> there is no live route to exercise it against, the same "ships inert,
> ready the day it's needed" posture doc 38's own `CircuitBreaker` takes.
> **Not built**, honestly: the `apiVersion` column on `ApiClientRequestLog`
> and the admin "who still calls v1" report, both named in this document's
> own §1 — `ApiClientRequestLog` does not exist in this codebase.
> `34-partner-developer-api-access.md`'s own `ApiClient` is **deferred**
> (ADR-037: an organisation-level service account is postponed in favor of
> doc 163's personal API keys), and building it here as a side effect of
> this work order would reopen a settled decision without new evidence,
> which `CLAUDE.md`'s "Preserve existing systems" rule forbids. Both
> pieces are real, small, additive follow-ups the day doc 34 ships.
>
> `core/feature-flags/feature-flags.service.ts`'s `FeatureFlag` model
> (`feature-flags.prisma`, migration `20260927090000_wo37_feature_flags`)
> adds `moneyOrStockPath` and a `removalCriteria` column doc 37's own
> Prisma sketch named a need for (WO-37.3's audit) but never gave a field —
> both necessary completions of what this document already asked for, not
> scope creep. `isEnabled(key, organizationId)` implements the stated
> precedence (killSwitch forces off; `enabledOrgIds` forces on; otherwise a
> stable SHA-256-bucketed percentage check, deterministic per organization,
> never re-randomized; a missing row fails closed to `false`), cached 30s
> in-process — a rollout-percentage edit takes up to 30s to reach every
> process, named honestly rather than hidden, while `killSwitch=true`
> invalidates its own process's cache entry synchronously so an incident
> stop is immediate on the process that flips it. `FeatureFlagsAdminController`
> (`/admin/feature-flags`) is the CRUD surface, plus the maker-checker pair
> this document's own "threshold nobody approves alone" lens asks for: a
> money/stock-path flag's 100%-rollout or kill-switch-clear transition is
> refused inline and must go through `propose-rollout` then `approve-rollout`,
> which refuses the same actor approving their own proposal — the identical
> shape `SettlementsService.approveWriteoff()` and
> `BankFacilityDrawdown.approvedById` already establish, both permissions
> (`platform.flags.manage`, `platform.flags.approve_rollout`) seeded onto
> ADMIN the same way `finance.settlement.approve_writeoff` is, relying on
> that distinct-actor check rather than withholding the permission.
> `FeatureFlagAuditCron` (nightly, `@Cron('0 3 * * *')`) logs every flag
> older than 90 days with no `removalCriteria`; the real surface a
> `platform.flags.manage` holder reads is the live admin screen
> (`/admin/feature-flags`, with a staleness banner) and its detail page
> (`/admin/feature-flags/[id]`), queried fresh on every load rather than off
> the cron's own cached output, reachable from the Settings nav group.
> [`SDK-CONTRACT.md`](../SDK-CONTRACT.md) publishes the extension-point
> interfaces, a judged stable subset of the domain-event catalogue, and the
> module-registration checklist (citing `MULTI-SECTOR.md` rather than
> re-deriving it); `apps/api/src/modules/system/example-hello-world-pack/`
> (registered under a new, non-`core` `'example'` `PackName`, `offByDefault:
> true`) is the reference pack this document's own acceptance criterion
> asks for — `pnpm lint`'s `check-module-boundaries.mjs` passes with it
> present and zero edits to any core module file (verified: "Module
> boundaries OK (64 module(s) — core: 61, example: 1, apparel: 2, …)").

## What already exists, referenced rather than repeated

- **Module packs + the `MODULES` allowlist** (`MULTI-SECTOR.md`) — adding a
  sector adds a folder, never edits core.
- **Extension-point interfaces** (`PaymentProvider`, `StorageDriver`,
  `AiProvider`, `NotificationChannel`, `VectorStore`, `OutboundConnector`
  from doc 36) — adding a provider is a new class, never a rewrite of a
  caller.
- **Forward-only, hand-written migrations** (`00-HOUSE-RULES.md`) — the
  database itself never has to be rolled back to add capability.
- **URI API versioning** (`main.ts`: `VersioningType.URI`, `/api/v1/...`,
  "a future v2 can be introduced route by route") — already wired, never
  used yet because nothing has needed a breaking route change.

## What is genuinely missing

### 1. A version and deprecation policy for the URI versioning that already exists

Versioning exists as infrastructure with no policy attached — nobody has
written down what happens between "v2 exists" and "v1 is gone." This
document supplies it:

- A route only gets a new version (`/api/v2/orders`) for a **breaking**
  change (a field removed, a type changed, a required field added). An
  additive change (a new optional field, a new endpoint) never bumps the
  version — this is what stops version-bumping from becoming the default
  reaction to any change at all.
- A deprecated version stays live for a stated minimum window (a
  organization-configurable default, e.g. 12 months) with a
  `Deprecation`/`Sunset` HTTP header (RFC 8594) on every response, so a
  consuming `ApiClient` (doc 34) or `OutboundConnector` (doc 36) integrator
  gets a machine-readable warning before the version disappears, not a
  surprise 404 on the sunset date.
- `ApiClientRequestLog` (doc 34) gains a `apiVersion` column so an admin
  can see, before sunsetting v1, exactly which live integrations still call
  it — never guessing whether it's safe to remove.

### 2. Feature flags: the missing piece between "built" and "everyone has it"

Nothing in this repository today can ship a finished capability to 5% of
organizations, watch it, then widen the rollout — every `MODULES` allowlist
entry is all-or-nothing per deployment, which is correct for a sector pack
(a grocery shop either needs `lots` or it doesn't) but wrong for a genuinely
new capability inside an already-enabled module that the team wants to
de-risk before a full rollout.

```prisma
// new: feature-flags.prisma

model FeatureFlag {
  id          String  @id @default(cuid())
  key         String  @unique  /// "payroll.advance-salary-v2", "pos.kitchen-ticket"
  description String
  /// Rows, not a single global boolean — an org-level allowlist, a
  /// percentage rollout, or both, exactly the way LeaveType/Rank favour
  /// rows over a hardcoded enum for the same reason: one rollout shape
  /// does not fit every flag.
  rolloutPercent Int    @default(0)
  enabledOrgIds  String[]
  killSwitch     Boolean @default(false) /// true = force off regardless of the above, for an incident

  @@index([key])
}
```

`killSwitch` is the operational reason this table exists at all: a feature
causing an incident in production gets turned off in one write, with no
deploy, exactly the way `tax.enabled` already lets a shop opt out of the
whole tax module without a rollback — this generalizes that one-off
pattern into a reusable primitive, rather than every future risky feature
inventing its own settings-table boolean the way `tax`/`FinanceRecurringRunHour`
each did independently.

**A flag is a de-risking tool, not a permanent branch in the code.** Every
flag names, at creation, either a removal date or the criteria that ends
it (100% rollout and the flag is deleted from the codebase, or it becomes
a real, permanent `Setting`/`MODULES` entry if it turns out to be optional
long-term) — an un-owned flag left in code for a year is exactly the kind
of speculative complexity `CLAUDE.md` already warns against, just wearing a
flag's clothes instead of an unused abstraction's.

### 3. A documented contract for a pack built outside this repository

`MULTI-SECTOR.md` already proves the module-pack seam works *inside* this
codebase. The genuinely new question this document answers is whether it
can work for a pack **nobody on this team wrote** — a client's own
development team, or a third-party vendor, building a new sector pack
against a published contract, without ever touching `core`.

The answer is: **yes, if and only if the contract `pnpm lint`'s
`check-module-boundaries.mjs` already enforces internally is published as a
real, versioned interface**, not left as tribal knowledge encoded only in
a lint script. This document is that publication:

- A pack is a folder registered in `module-packs.ts` and
  `modules.registry.ts` — both files stay in this repository (a pack cannot
  self-register into a `MODULES` allowlist it does not control, which is
  the correct security boundary: an external pack proposes, this
  repository's own admin decides).
- A pack may depend on any `core` extension point (a `NotificationChannel`,
  a domain event subscription) and **may never import another pack's
  internals** — the existing rule, restated as the actual publishable
  contract a third party needs to build against.
- A pack ships its own migrations, scoped to its own tables, following the
  same forward-only discipline — never a migration touching a `core` table.
- **`SDK-CONTRACT.md`** (new, alongside this document) is the actual
  published reference: the extension-point interfaces, the domain-event
  catalogue's stable subset (which events are safe to build against
  long-term versus internal-only), and the module-registration checklist —
  the thing an external team actually reads before writing code, so this
  capability is real, not aspirational.

## Scope lenses

**The actor with three tables** — n/a: no new counterparty; feature flags
and API versions gate existing callers, they do not introduce one.
**The principal with no permission key** — n/a.
**The grant that ends itself** — n/a.
**Whose rows, and which columns** — `FeatureFlag.enabledOrgIds` is visible
only to `platform.flags.manage`; an organization cannot see or toggle its
own flag membership (this is an internal de-risking tool, not a
customer-facing settings screen — conflating the two is how a flag meant
for staged rollout turns into a support burden).
**The threshold nobody approves alone** — flipping a flag to 100% rollout
or removing a `killSwitch` capability from a flag needs a second approver
if the flag gates a money- or stock-writing path, mirroring doc 36's
own event-scope threshold, for the same reason: an under-tested rollout of
a payment-adjacent change is a real blast-radius event.
**The toxic pair** — n/a.
**Authority and blast radius** — who may create/adjust a `FeatureFlag`
(engineering-ops role, platform-wide, not per-organization); the worst
value is a flag with no removal criteria living in the codebase
indefinitely, which the flag-audit report (below) surfaces rather than
relying on someone remembering.
**Audience is a capability, not an address** — n/a.
**Request or record** — a flag check (`isEnabled(key, organizationId)`) is
a pure read with no side effect and cannot be "refused"; a version-sunset
enforcement (returning 404 past the deprecation window) is the one REQUEST-
shaped refusal this document introduces, and it is announced in advance via
the `Sunset` header, never a surprise.
**The movement with no address** — n/a.
**Four hours down, the counter stays open** — n/a: flags and version
routing are in-process checks, not external dependencies with their own
uptime to worry about.
**Click the number** — a flag's rollout percentage links to which
organizations are actually in the enabled set, never a bare number with no
drill-down; the "which integrations still call v1" report (§1) links to
the exact `ApiClientRequestLog` rows behind it.
**The unwritten posting rule / Every column or none / The period that
already moved** — n/a: no money fact.
**The second legal entity** — n/a beyond the existing per-organization
scoping every other document in this set already applies.
**Dry run before live** — `isEnabled(key, organizationId)` is exactly
this lens already, by construction: a pure function every caller uses to
decide behavior, testable in isolation from any request.
**Three silhouettes** — Solo: flags rarely touched, versioning never
exercised (a Solo shop is unlikely to run integrations that care about API
versions at all). Chain: a flag rolled out branch-by-branch via
`enabledOrgIds`-equivalent branch scoping. Organization: percentage
rollout matters at real scale, version-sunset communication to many
integrators matters (doc 34's usage report is exactly for this).
**The absent collaborator** — a module with no flags defined behaves
exactly as it does today; the flags table itself is meaningless without at
least one `FeatureFlag` row, and its absence changes nothing.
**The second copy of the write** — n/a: flag checks are reads; nothing here
writes a business fact that could duplicate.
**The hundred-thousandth row** — flag and version-routing checks happen on
the hot path of every request that touches a flagged feature — `isEnabled`
must be a cached, indexed lookup (`key` is already unique-indexed),
never a query that scans `enabledOrgIds` as an unindexed array scan at
request volume.
**The reversal document** — n/a.
**The undo fan-out** — flipping `killSwitch` to true stops the feature
immediately for every organization (automatic) but does not undo whatever
that feature already wrote while it was on (deliberately irreversible —
the kill switch stops new occurrences, it is not a rollback tool).
**The version stamp** — restated as this document's own subject: an API
version is exactly a version stamp on a contract, and a flagged feature's
rollout state at the time an action occurred is not retroactively
reinterpreted by a later flag change — an order placed under the old
behavior stays explainable from what was true when it was placed.
**The erasure the ledger cannot obey** — n/a: no personal data.
**The failure path** — a `FeatureFlag` lookup failure (cache miss racing a
DB outage) fails closed to the flag's own stated default (off, unless the
flag was explicitly created with a documented fail-open reason) — never an
undefined/crash state, and never silently fails open by accident for a
money-adjacent flag.

## Work orders

**WO-37.1 — versioning policy**: `Deprecation`/`Sunset` headers on a
deprecated version, `apiVersion` column on `ApiClientRequestLog` (doc 34),
an admin "who still calls v1" report.
**WO-37.2 — `FeatureFlag` schema + `isEnabled()`** with the killSwitch/
percentage/allowlist precedence rules, cached lookup.
**WO-37.3 — flag lifecycle audit**: a nightly report listing every flag
with no stated removal criteria past a staleness window, surfaced to
engineering-ops, never silently ignored.
**WO-37.4 — `SDK-CONTRACT.md`**: the published extension-point/domain-event
reference for a pack built outside this repository.
**WO-37.5 — permissions**: `platform.flags.manage`,
`platform.flags.approve_rollout` (the money/stock-path threshold).

## Acceptance

- A route change that only adds an optional field ships with no version
  bump; a route change removing a field is refused in review without one
  (a lint/reviewer checklist, not automatable, named explicitly as such).
- A deprecated version serves the `Sunset` header from the day it is
  deprecated, and the sunset report correctly lists every `ApiClient`
  still calling it in the trailing 30 days.
- `killSwitch = true` disables a feature for every organization on the very
  next request, with no deploy.
- A flag with a rollout percentage but no removal criteria past 90 days
  appears on the staleness report.
- An external pack built strictly to `SDK-CONTRACT.md` passes
  `pnpm lint`'s module-boundary check with zero core edits — proven by a
  reference "hello world" pack built and lint-checked as part of this work
  order's own acceptance.

## Out of scope

A full internal plugin marketplace with billing/discovery (this document
publishes the *contract*; a storefront for third-party packs is a much
larger, separately-scoped product decision). Blue-green or canary
infrastructure-level deployment (this document's flags are
application-level rollout control; infrastructure deployment strategy is
an operations decision for whoever runs the hosting, named in doc 39 where
it actually matters at platform scale). Automatic migration rollback
tooling — this repository's migrations are already forward-only by
deliberate policy (`00-HOUSE-RULES.md`); this document does not reopen
that decision.
