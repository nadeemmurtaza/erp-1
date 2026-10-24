# 143 — Micro-frontend architecture, built by explicit owner override (ADR-026), added alongside doc 93's single-app convention rather than replacing it

> **Status: shipped (2026-09-26), WO-143.2/143.3/143.4 — WO-143.1 (literal
> module federation) substituted, not built as sketched.** `MicroFrontend
> Fragment` + `FragmentStatus` (`fragments.prisma`) and `FragmentsService`
> are live. Two corrections against this document's own sketch, recorded in
> `DECISIONS.md` ADR-049:
>
> - **No `organizationId`** — corrected against this repository's own
>   ADR-044/ADR-040 (this deployment IS the tenant), the same correction
>   already applied to docs 104/140.
> - **WO-143.1's literal `next.config.js` `@module-federation/nextjs-mf`
>   build is not built.** Checked against this repository's own actual
>   Next.js version (15.5.23, `apps/web/package.json`): that package's own
>   GitHub issue tracker names Next.js 15 support as open and unresolved,
>   with stated doubt about the package's maintenance past 2026, against
>   an App Router/RSC/`'use client'`-heavy admin app already committed to
>   Turbopack. Building it would mean pinning this repository's own
>   framework version to an unmaintained wrapper's own compatibility
>   window — a worse trade than the mechanism it exists to enable. **The
>   mount mechanism doc 143 itself already asks for at WO-143.4 (doc 113's
>   own iframe + short-lived embed-token pattern) is used as the actual
>   composition layer instead of literal module federation** — the same
>   iframe sandbox, the same scoped, short-lived token, reused unchanged.
>   `FragmentMountPoint`/`FragmentFrame` (`fragment-mount-point.tsx`) is the
>   reusable mount-point component; `FragmentsController`'s `/for-mount-
>   point` and `/:key/token` routes are its own doc-113-shaped
>   endpoints. The trade-off this document's own reasoning already named —
>   real fragment independence at the cost of a federation build — is kept
>   honest rather than half-built: this repository gets the opt-in,
>   registered, suspendable mount-point mechanism the document asks for,
>   without a framework-version lock this codebase cannot safely accept
>   today.
>
> Registration UI + the design-law attestation checkbox is at Settings >
> Fragments (`settings.fragments.manage`); `FragmentMountPoint` is embedded
> on the Supplier detail screen as the first real, reachable mount point
> (`mountPoint="supplier-detail"`). Suspend/activate is the kill switch, as
> specified; there is no delete endpoint, since a fragment's own history of
> having been registered is never erased by suspending it.

Doc 93 committed this repository to one frontend framework (Next.js/React)
across every web surface, for real reasons: one component library, one
build pipeline, one place `pnpm check:overflow` needs to reach. Doc 113
then declined full micro-frontend/module-federation architecture, scoping
the bullet's own concrete example (embedding a third-party dashboard) as
a narrow iframe/embed-token pattern instead. Per ADR-026, the owner
instructed the general form be built anyway, for near-term flexibility —
letting a specialized capability (a predictive-analytics widget, a
future AI-agent chat surface) be built and deployed independently of the
main admin app's own release cycle. This document builds it, keeping doc
93's own single-app convention as the *default* for ordinary screens and
introducing module federation as an **additional, opt-in composition
layer** for specifically-justified fragments, never a wholesale
replacement of the existing app.

## 1. Module federation as an addition, not a rewrite

```ts
// next.config.js — the admin shell app remains the primary, hand-authored
// Next.js application doc 93 already describes; module federation is
// added ONLY as a mechanism for loading specifically-designated remote
// fragments into specifically-designated mount points, never as the
// general composition model for the whole app.
const withModuleFederation = require('@module-federation/nextjs-mf');

module.exports = withModuleFederation({
  name: 'admin_shell',
  remotes: {
    // Registered per-fragment, per deployment — never a blanket "load
    // anything from anywhere" configuration.
  },
});
```

```prisma
model MicroFrontendFragment {
  id             String  @id @default(cuid())
  organizationId String
  key            String   // "predictive-analytics-widget"
  remoteUrl      String   // where the federated fragment is served from
  mountPoints    String[] // which admin screens may embed it
  status         FragmentStatus @default(ACTIVE)  // ACTIVE | SUSPENDED

  @@unique([organizationId, key])
}

enum FragmentStatus { ACTIVE  SUSPENDED }
```

## 2. What doc 93's own reasoning still governs, and what this document adds on top

Doc 93's cost analysis (a second build toolchain, a version-compatibility
matrix, an invisible-to-static-sweep runtime load) does not disappear
just because the owner wants the capability — it is the reason this
mechanism stays **opt-in per fragment**, not the default composition
model:

- **Every ordinary admin/storefront/POS screen remains a hand-authored,
  same-repository Next.js page**, exactly doc 93's own convention — this
  document adds a *new*, narrower category (a designated remote fragment
  mount point), it does not convert the existing app into a federation of
  fragments.
- **`pnpm check:overflow`'s own static sweep cannot reach a
  runtime-loaded remote fragment** — doc 93's own named blind spot. The
  mitigation: every `MicroFrontendFragment`'s own remote deployment is
  required to run its own equivalent overflow/contrast check against the
  seven widths before being registered `ACTIVE`, and the admin
  registration screen requires an attestation (a checked box, an
  uploaded report) that this was done — this repository's own design-law
  enforcement cannot reach across a federation boundary by tooling alone,
  so it is enforced by process at the one point (registration) this
  repository does control.
- **`FragmentStatus = SUSPENDED`** is the kill switch doc 36's own
  `ConnectorStatus` and doc 30's `FaceMatchProfile.REVOKED` already
  establish as this repository's standing pattern for "stop trusting this
  external thing immediately" — a fragment serving broken or malicious
  content is suspended without a deploy, the mount point simply renders
  nothing where the fragment would be (the same absent-collaborator
  degrade every optional integration in this repository already follows).

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: a remote fragment is a deployment
artifact, not a `User`; who may register one is gated by
`settings.fragments.manage`.
**Whose rows, and which columns** — `MicroFrontendFragment` is
`organizationId`-scoped; `mountPoints` explicitly enumerates which admin
screens may load it — a fragment never gets a blanket "embed anywhere"
grant.
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — registering a new fragment (introducing third-party
runtime code into the admin shell) is itself a real trust decision;
gated behind `settings.fragments.manage` and logged with old/new value
by `AuditService`, the same discipline every other trust-boundary change
in this repository already requires.
**Audience is a capability, not an address / Request or record / The
movement with no address / The unwritten posting rule / Every column or
none / The period that already moved / The second legal entity / Dry run
before live** — n/a: a fragment registration is configuration, not a
money/stock fact or notification.
**Three silhouettes** — Solo: essentially never used. Chain/Organization:
the one plausible real case (a client wants one specific specialized
third-party tool embedded without waiting for the admin app's own release
train) — this is deliberately a narrow, occasional mechanism, not a
default composition model at any silhouette.
**The absent collaborator** — a `SUSPENDED` or unregistered fragment's
mount point renders nothing, never a broken page.
**The second copy of the write** — n/a: fragment registration is
ordinary configuration, `@@unique([organizationId, key])` prevents a
duplicate registration.
**The hundred-thousandth row** — `MicroFrontendFragment` is small,
admin-authored configuration, never a high-volume table.
**The reversal document / The undo fan-out** — suspending a fragment is
the reversal; nothing else in this repository depends on a fragment's
own internal state, since it is deliberately sandboxed to its own mount
points.
**The version stamp** — a fragment's own `remoteUrl` can point to a new
version at any time (the vendor's own deployment, outside this
repository's control) — this repository has no version-pinning mechanism
of its own beyond the registered URL, named honestly as a real,
accepted risk of trusting an externally-deployed fragment.
**The erasure the ledger cannot obey** — n/a: a fragment receives only
the scoped embed-token doc 113 already designed (organization/location
claims, short-lived), never raw personal data pushed into it by this
repository.
**The failure path** — a fragment that fails to load shows the
mount point's own "unable to load [fragment]" state, per doc 113's own
already-specified failure UX, reused unchanged here.

## Work orders

**WO-143.1 — module-federation build configuration** for the admin
shell, opt-in per registered fragment.
**WO-143.2 — schema**: `MicroFrontendFragment`, `FragmentStatus`.
**WO-143.3 — registration UI + attestation flow** (the design-law
compliance attestation named above), gated by `settings.fragments.manage`.
**WO-143.4 — the embed-token issuer from doc 113**, reused unchanged as
the credential a federated fragment receives, never a raw session token.

## Acceptance

- An ordinary admin screen (not a registered mount point) is entirely
  unaffected by this mechanism — proven by the existing `pnpm check:overflow`
  sweep continuing to pass unchanged.
- A `SUSPENDED` fragment's mount point renders nothing, never stale or
  cached content from before suspension.
- A fragment registration without the design-law attestation is rejected
  by the admin form.

## Out of scope

Converting the existing admin/storefront/POS apps into a fully federated
composition of independently-deployed fragments — explicitly not
attempted; doc 93's own single-app convention remains the default, and
this mechanism is a narrow, opt-in addition for specifically-justified
cases only.
