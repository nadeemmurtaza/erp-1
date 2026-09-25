# 51 — Free demo, sandbox trials, and self-service onboarding

> **Status: shipped (2026-09-25), WO-51.1–51.5; WO-51.6 blocked on doc 28.**
> **WO-51.1 — schema**: `TenantStatus.TRIAL`, `PlatformTenant.trialExpiresAt`
> (plus `billingContactEmail`/`signupEmailVerifiedAt`, needed by WO-51.2
> and by doc 39's own "audience is a capability" lens for every tenant-
> facing notification this pass added).
> **WO-51.2 — self-service signup**: `modules/trials/signup.service.ts` +
> `signup.controller.ts` (public, no `OpsAuthGuard` — the one deliberate
> exception, per this document's own scope lens), rate-limited via
> `@nestjs/throttler` (5/min/IP, the same shape apps/api's own
> `auth.controller.ts` uses), calling the *existing*
> `ProvisioningService.provisionTenant()` with `trialDays` set — no
> second provisioning path. Email ownership is verified by a real,
> single-use, expiring token (`SignupVerification`) before anything
> provisions; CAPTCHA is a named, not-built "at the edge" concern (this
> document's own words), consistent with doc 51 §3 scoping it there.
> Verified end to end in this pass: a real public signup → email-link
> click → a real, isolated tenant database provisioned, and a
> double-clicked verification link converges on the same one tenant
> (proven live, not only unit-tested).
> **WO-51.3 — expiry job**: `trial-expiry.cron.ts` — `TRIAL -> SUSPENDED`
> via the existing `TenantsService.suspend()` (so it gets the identical
> hostname-cache invalidation every other suspension already has), a
> day-wide warning window needing no extra "already warned" column, and
> a digest to `PLATFORM_OPS_ALERT_EMAIL` past
> `PLATFORM_TRIAL_DIGEST_THRESHOLD` instead of one ping per trial.
> **WO-51.4 — conversion flow**: `trials.service.ts#convert()`, the
> sales-assisted path only. A self-service checkout needs a real payment
> gateway doc 50 itself never builds either (named there as "through
> whatever payment processor invoices the tenant") — not silently
> invented here as a payment flow.
> **WO-51.5 — permissions**: `platform.trials.extend`, seeded into the
> catalogue (`core/security/ops-permissions.ts`); `TrialsController`
> requires it for `extend` specifically, `platform.tenants.manage` for
> `convert`. `TrialExtension` is the audit trail behind
> `listExtendedMoreThanOnce()`, doc 51's own named report.
> **WO-51.6 — onboarding checklist**: **not built.** `apps/api` has no
> `OnboardingChecklistTemplate` — doc 28 itself is unimplemented (no
> `shipped` header, no such Prisma model in `apps/api/prisma/schema/`).
> Building a parallel checklist/template engine here would be exactly
> the "invent a new one" this document's own instruction warns against,
> and a generic checklist-template system is itself a separable,
> larger capability — named and left sequenced behind doc 28, not
> silently stubbed.
> UI: `modules/ui/pages/signup.html` (the public form) +
> `modules/ui/pages/verify.html` (the emailed link's own landing page,
> GET-safe — it POSTs the token itself, so an email-scanning bot
> prefetching the raw link can never consume it) + the "Trials" tab in
> `modules/ui/pages/admin.html` (list, extend, convert).

Doc 39's `ProvisioningService.provisionTenant()` already creates a real,
isolated tenant idempotently — the mechanism this document needs already
exists. What is missing is the one `TenantStatus` a demo/trial actually
needs (a tenant that provisions like any other but is understood, from the
start, to expire), and the self-service path that lets a prospect reach a
working sandbox in minutes with nobody on Newax's side touching a
keyboard — "rapid self-setup within minutes" is a real requirement on the
provisioning flow's own latency, not a new subsystem.

## 1. A trial is a tenant with an expiry, not a different kind of tenant

```prisma
// platform.prisma

enum TenantStatus {
  PROVISIONING
  TRIAL
  ACTIVE
  SUSPENDED
  DEPROVISIONED
}

model PlatformTenant {
  // existing fields unchanged
  trialExpiresAt DateTime?
}
```

A `TRIAL` tenant is provisioned through the exact same
`ProvisioningService` doc 39 already built — same isolated database, same
`DeploymentProvisioner`, same resource-tier quota — with `trialExpiresAt`
set and no `PlatformSubscription` charge until it converts. This is
deliberately not a separate, lighter-weight "demo mode": a prospect who
trials the real product and a paying tenant run on identical
infrastructure, which is what makes "risk-free operational trial" actually
true rather than a stripped-down preview that misleads about what they are
buying.

## 2. Conversion and expiry are both status transitions, never silent

```
TRIAL --[self-service checkout, or sales converts it]--> ACTIVE
TRIAL --[trialExpiresAt passes with no conversion]-------> SUSPENDED
```

A trial that lapses is `SUSPENDED`, not `DEPROVISIONED` — doc 39's own
data-portability commitment applies identically: the prospect's own trial
data (products they added, a sandbox order they placed) is retained
through the same retention window as any other suspended tenant, so
converting late does not mean starting over. `DEPROVISIONED` still needs
its own explicit act, exactly as doc 39 already requires.

## 3. Self-service signup is doc 34's own pattern, aimed outward for once

Every other document in this repository builds `ApiClient`-shaped access
for internal tools or partners (doc 34, doc 36). A public self-service
signup form is the one place this repository issues access to someone who
has not yet been vetted by a human — the form itself is a thin request
that calls `ProvisioningService.provisionTenant()` with `status: TRIAL`,
rate-limited and CAPTCHA/email-verified at the edge (an ordinary public-
form concern, not a new architectural pattern) before it ever reaches
provisioning.

## Scope lenses

**The actor with three tables** — n/a: a trial signup produces an
ordinary `PlatformTenant`, no new actor type.
**The principal with no permission key** — the public signup form itself
is unauthenticated by design (nobody has an account yet); it is bounded
by rate limiting and email verification, never by `PermissionsGuard`,
which is the correct, named exception rather than an oversight.
**The grant that ends itself** — `trialExpiresAt` is exactly this lens,
applied to a tenant instead of a role grant: a trial ends itself without a
human remembering, transitioning to `SUSPENDED` automatically.
**Whose rows, and which columns** — a trial's own admin sees only their
own sandbox, identical to any other tenant's isolation; Newax's own
`platform.tenants.manage` sees trial status and expiry across all
prospects for the sales pipeline this feeds.
**The threshold nobody approves alone** — n/a: a self-service trial
commits no money.
**The toxic pair** — n/a.
**Authority and blast radius** — who may manually extend a trial's
`trialExpiresAt` (sales/support role, narrower than full tenant
management) — the worst value is an indefinitely-extended trial that
never converts and never expires, caught by a report naming every trial
extended more than once (a real, if soft, policy signal, not a hard
block).
**Audience is a capability, not an address** — a trial nearing expiry
notifies the prospect's own signup email (doc 33's channels) and, once
past a threshold count of unconverted expiring trials, digests to
whoever holds the sales-pipeline audience — never one ping per trial to a
person, per doc 34/`CLAUDE.md`'s own audience-as-capability rule.
**Request or record** — signup is a REQUEST (refused: rate-limited, email
unverified, slug taken exactly as doc 39's own idempotency already
handles); the automatic `TRIAL → SUSPENDED` expiry transition is a
RECORD of a date having passed, never refused.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved** — n/a: a trial signup
posts no revenue; conversion to `ACTIVE` is where doc 50's own billing
first applies, unchanged by this document.
**The second legal entity** — n/a beyond doc 39's own existing
per-tenant scoping.
**Dry run before live** — n/a: signup either succeeds and provisions or
is refused; there is no computed rule to preview beyond what doc 39's
own provisioning preview already offers.
**Three silhouettes** — every trial starts as if it will be a Solo
deployment (doc 39's own default resource tier); nothing about this
document assumes a trial's eventual edition.
**The absent collaborator** — n/a: a trial uses exactly the modules any
other tenant on its plan would, nothing conditionally hidden because it
is "just a demo."
**The second copy of the write** — the signup form is idempotent on
email + a short window (a double-click does not create two trials for the
same prospect), and doc 39's own slug-idempotency handles the rest.
**The hundred-thousandth row** — trial volume can exceed converted-tenant
volume by a wide margin (most trials never convert) — the expiry job
processes lapsed trials in bounded batches, and `DEPROVISIONED`
(never-converted, past-retention) trials are eligible for actual database
teardown sooner than a paying tenant's own retention window, named
explicitly as a different (shorter) policy for trial data specifically.
**The reversal document / The undo fan-out / The version stamp** — n/a
beyond doc 39's own existing tenant-lifecycle rules, unchanged.
**The erasure the ledger cannot obey** — a never-converted trial's data
carries no billing/statutory retention obligation the way a paying
tenant's invoicing history does — it is deleted on its own (shorter)
schedule once past retention, not held indefinitely "just in case," which
is itself a privacy-by-default improvement over treating every trial like
a permanent customer record.
**The failure path** — a provisioning failure during self-service signup
shows the prospect a real, human-readable retry message (never a stack
trace) and leaves no partial tenant, identical to doc 39's own stated
provisioning-failure guarantee.

## Work orders

**WO-51.1 — schema**: `TRIAL` status, `trialExpiresAt` on `PlatformTenant`.
**WO-51.2 — self-service signup**: rate-limited, verified public form
calling `provisionTenant()` with `status: TRIAL`.
**WO-51.3 — expiry job**: `TRIAL → SUSPENDED` on `trialExpiresAt`,
notification before and at expiry (doc 33), digested past a threshold
count.
**WO-51.4 — conversion flow**: `TRIAL → ACTIVE` via checkout (doc 50's
pricing) or a sales-assisted action.
**WO-51.5 — permissions**: `platform.trials.extend` (narrower than
`platform.tenants.manage`).
**WO-51.6 — operator training/onboarding checklist**: reuses doc 28's own
`OnboardingChecklistTemplate` pattern, scoped to a new tenant's own admin
user rather than an employee — the identical schema shape, a different
subject.

## Acceptance

- A public signup provisions a working, isolated `TRIAL` tenant with no
  human action, within the provisioning flow's own existing latency
  target.
- A lapsed trial transitions to `SUSPENDED` automatically and its data
  survives the same retention window doc 39 already states for any
  suspended tenant.
- A double-submitted signup form produces exactly one trial tenant.
- Extending a trial requires `platform.trials.extend`, distinct from full
  tenant management.
- A never-converted trial past its own (shorter) retention window is
  eligible for teardown, proven by a spec distinguishing its retention
  clock from a paying tenant's.

## Out of scope

A stripped-down or feature-limited "demo mode" — explicitly rejected in
§1: a trial runs the real product, on real infrastructure, so what a
prospect evaluates is what they would actually buy. Guided in-app product
tours or interactive walkthroughs — a real, separate UX capability with
its own design-system lenses, not assumed as part of provisioning a
trial tenant.
