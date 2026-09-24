# 113 — Embedding a third-party dashboard: a narrow iframe pattern, not a micro-frontend architecture

"Break the monolithic web application into distinct, independently
deployable UI fragments. Specialized third-party tools, such as an
AI-based predictive analytics dashboard, can be seamlessly embedded
directly into the main ERP shell" names two different things worth
separating: **micro-frontend architecture** (module federation, separately
built and deployed UI fragments composed at runtime into one shell — a
real, heavyweight frontend architecture pattern), and the **narrow,
concrete use case** the bullet's own example names (embedding one
specific third-party tool's dashboard inside an admin screen). This
repository builds the second and declines the first, for reasons parallel
to doc 93's rejection of a second frontend framework.

## Why full micro-frontend architecture is declined here

Doc 93 already states the underlying reasoning: this repository
deliberately runs one frontend framework (Next.js/React) across every
web-based surface, one component library, one design-system enforcement
pipeline (`pnpm check:overflow`, `check:contrast`, the 150 design laws).
Module federation — the actual mechanism behind "independently deployable
UI fragments composed into one shell" — would mean a second build
pipeline, a version-compatibility matrix between the shell and each
fragment, and a second place `pnpm check:overflow`'s own sweep would need
to reach (a federated fragment loaded at runtime is invisible to a
build-time static sweep). This is real, ongoing operational cost this
repository's own single-Next.js-app convention does not pay today, for a
benefit (independently deployable *internal* fragments) this repository
does not need — every internal screen already ships in the same deploy as
everything else, by design.

## What the bullet's own concrete example actually needs: an embed, not a framework

"A specialized third-party tool... embedded directly into the main ERP
shell" is a real, narrow, and much simpler pattern: an `<iframe>` (or a
`postMessage`-bridged embed widget, if the third party provides one)
inside an ordinary admin screen, passing the current user's own scoped
context (organization/branch, never a raw session token) as a signed,
short-lived embed token — the same "governed, credentialed access to an
external system" shape doc 36's `OutboundConnector` already establishes
for outbound calls, mirrored here for an inbound-rendered widget.

```ts
// A narrow embed-token issuer, not a micro-frontend runtime:
async issueEmbedToken(userId: string, widgetKey: string): Promise<{ token: string; expiresAt: Date }> {
  // short-lived, scoped to the caller's own organizationId/locationId —
  // never a raw session token handed to a third-party iframe.
}
```

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: the embedded tool is a third-party
vendor's own service, authenticated by the short-lived embed token above,
never a `User` in this system.
**Whose rows, and which columns** — the embed token's own claims are
scoped to the caller's `organizationId`/`locationId`; the third-party tool
never receives broader access than the embedding admin user themselves
holds.
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — n/a: embedding a read-only dashboard commits no money
or stock; which vendor's widget may be embedded is an admin
configuration decision (`settings.embeds.manage`), audited like any other
setting change.
**Audience is a capability, not an address / Request or record / The
movement with no address / The unwritten posting rule / Every column or
none / The period that already moved / The second legal entity / Dry run
before live** — n/a: no money/stock fact, no notification, no computed
rule.
**Three silhouettes** — Solo: rarely used. Chain/Organization: a real
convenience — one predictive-analytics vendor's dashboard embedded once,
reused across every branch's own admin view, scoped per embed token.
**The absent collaborator** — with the embedding config off, the screen
simply shows nothing where the widget would be, never a broken iframe.
**The second copy of the write / The hundred-thousandth row / The
reversal document / The undo fan-out / The version stamp** — n/a: no
write of this repository's own beyond issuing a short-lived token.
**The erasure the ledger cannot obey** — the embed token's own claims
(user identity, scope) are never logged by the third party under this
repository's control; what the third-party vendor itself retains is
outside this system's own erasure guarantee, named honestly as a vendor-
contract concern, not a technical one this document can enforce.
**The failure path** — a third-party widget that fails to load shows the
screen's own "unable to load [vendor]" state, never a blank space
mistaken for "nothing configured."

## Work orders

**WO-113.1 — embed-token issuer**, scoped short-lived JWTs carrying
`organizationId`/`locationId`, never a raw session credential.
**WO-113.2 — UI**: an iframe/embed-widget container component, reusable
across any admin screen that wants to host one, with the "unable to load"
failure state per the design system's own "every state shipped" rule.

## Acceptance

- An embed token expires within its stated short lifetime and carries
  only the caller's own organization/location scope.
- A failed embed load shows a visible error state, never a silent blank.

## Out of scope

Full micro-frontend/module-federation architecture — declined above for
the same reasons doc 93 declines a second frontend framework; the narrow
iframe/embed pattern already serves the bullet's own concrete example.
