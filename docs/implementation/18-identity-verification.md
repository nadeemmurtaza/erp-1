# 18 — Identity verification via nID

**Read `00-HOUSE-RULES.md` first.**

> **Status: built, off by default (2026-09-17).** The `identity-verification`
> module exists, passes typecheck/lint/the full test suite, and its schema
> migration has been applied against a real Postgres. It is not in the
> `MODULES` default and `NID_API_URL`/`NID_API_KEY`/`NID_WEBHOOK_SECRET` are
> unset in every `.env*` — the module is real but inert until this shop
> actually has a nID tenant account. Turning it on is an env change, not a
> deploy.

## What this is

[nID](https://github.com/nadeemmurtaza/nID) is Newax's own external identity
and KYC verification platform — a separate product, sold to third parties,
not a Yaseen-specific service. This shop (Yaseen) is meant to become nID's
first real tenant. This module is the erp-1 side of that integration: it
calls nID's external REST API exactly as any other nID tenant would, over
plain HTTPS with an API key, with no shared code and no shared database.
There is nothing erp-1-specific on nID's side and nothing nID-specific
baked into erp-1's core — the whole integration lives in one module, behind
one interface, and can be deleted by deleting this folder.

## Design

### One interface, one implementation, on purpose (house rule 8)

`IdentityVerificationProvider` (`identity-verification-provider.ts`) has a
single implementation, `NidVerificationProvider`
(`providers/nid.provider.ts`), mirroring the shape of `PaymentProvider`
rather than `StorageDriver`'s enum-selected style, because a second
provider (a different KYC vendor, or a test double) is a real and
foreseeable second implementation — the interface exists so that arrives as
a new file, not a rewrite of `IdentityVerificationService`.

### Idempotency lives on erp-1's side, not nID's

nID's Phase 0 has no dedup of Subjects by `externalRef` — a second
`POST /v1/subjects` with the same `externalRef` creates a second Subject.
`IdentityVerification.nidSubjectId` is where that idempotency actually
lives: `NidVerificationProvider.start()` only creates a new nID Subject when
`existingProviderSubjectId` is absent, and `IdentityVerificationService.start()`
passes the previously stored `nidSubjectId` on every retry. If nID grows its
own dedup in a later phase, this becomes redundant but not wrong — it would
just always find its own Subject id and skip the (now-idempotent) create.

### One `IdentityVerification` row per User, not per case

erp-1 is single-tenant today, so there is exactly one nID tenant (this shop)
and this integration verifies one thing: whether a User's identity is
verified. A retry after `REJECTED`/`EXPIRED` reuses the same row —
`nidCaseId` always points at nID's most recent case for that user, and the
row's own `status` is the shop's answer to "is this user verified," not a
log of every attempt. If a future phase needs the attempt history, that is
an `IdentityVerificationAttempt` table added then, not now.

### Raw-body webhook verification

Unlike `PaymentProvider.handleCallback`, which verifies individually signed
form fields, nID signs the exact JSON bytes it sent
(`HMAC-SHA256("${timestamp}.${rawBody}")`, hex — see nID's own
`packages/shared-types/src/webhook.ts`). Re-parsing and re-stringifying the
body before verifying risks a byte-different string (key order, whitespace)
that fails a genuine callback's signature. `main.ts` now boots Nest with
`rawBody: true`, and the webhook route reads `req.rawBody` directly rather
than the framework-parsed body — see `nid-callback-verification.spec.ts` for
a test that specifically exercises a re-ordered-but-equivalent body failing
verification, to keep this from regressing back to the parsed-object
approach.

### Self-service, not a permission

Starting your own verification, submitting your own OTP, and checking your
own status don't need `@RequirePermission` — they're the same "acting on
your own record" category as changing your own password or address, gated
by being authenticated (the global `JwtAuthGuard`), not by a capability.
There is no admin/staff view of who is verified yet; that is dashboard work
for a later phase; if it's needed, it's a `identity_verification.manage_own`/
`.manage_all`-shaped pair through `assertCanManage()`, per
`16-pbac-row-scoping.md`, not a bespoke check.

## What's built

- `apps/api/prisma/schema/identity-verification.prisma` — the
  `IdentityVerification` model + `IdentityVerificationStatus` enum, and a
  back-relation field added to `User` in `core.prisma` (same pattern as
  `Contact`/`ContactUser`). Migration `20260917155537_add_identity_verification`
  — purely additive, applied against a real Postgres during development.
- `identity-verification-provider.ts` / `providers/nid.provider.ts` — the
  interface and the nID HTTP client.
- `identity-verification.service.ts` — `start()`, `submitOtp()`, `status()`,
  `handleWebhook()`.
- `identity-verification.controller.ts` — `POST start`, `POST otp/submit`,
  `GET me` (authenticated), `POST webhook` (`@Public()`, signature-verified).
- `identity-verification.module.ts`, registered in `modules.registry.ts`
  (not `alwaysOn`).
- Three new domain events — `identity_verification.approved`/`.rejected`/
  `.expired` — published from inside the same transaction that resolves the
  `IdentityVerification` row, carrying `{ userId, method }`. No subscriber
  exists yet; a later phase's notification-on-verified feature is a new
  subscriber file, not an edit to this module (house rule 3).
- `NID_API_URL` / `NID_API_KEY` / `NID_WEBHOOK_SECRET` in `env.validation.ts`
  and both `.env*.example` files.
- `nid-callback-verification.spec.ts` — six tests, all passing, covering: no
  signature, wrong signature, unconfigured secret, a re-serialized body,
  and both a correctly signed `APPROVED` and `REJECTED` result.

## Explicitly out of scope for this module

- **A notification when verification resolves.** The domain events exist;
  a subscriber (email/push, matching `payments/notification.subscriber.ts`'s
  shape) is a follow-up, not bundled in here.
- **Requiring verification for anything.** Nothing in erp-1 currently checks
  `IdentityVerification.status` before allowing an action — this module only
  answers "is this user verified," it doesn't yet enforce that answer
  anywhere. Wiring "must be verified to X" into checkout, stitching, or
  wherever the business decides it matters is a deliberate, separate
  decision.
- **An admin/staff view.** No dashboard screen, no `manage_all` capability.
  Only self-service today.
- **KYB / organization verification.** nID supports it (Phase 2+ on its
  side); erp-1 has no `Organization`/`Company` concept to attach it to yet.
  Out of scope until erp-1 itself grows one.
- **Retrying a failed webhook delivery from nID's side.** If nID's callback
  never arrives, the `IdentityVerification` row stays `PENDING` indefinitely.
  `GET me` polling nID directly, or a reconciliation cron, is a real gap —
  deferred because nID's Phase 0 has no "list cases by status" endpoint to
  reconcile against yet.

## Local setup

```bash
# .env: set these once a nID tenant account exists for this shop
NID_API_URL="http://localhost:4000"          # nID's apps/api, locally
NID_API_KEY="nid_test_..."                    # from nID's `pnpm db:seed`
NID_WEBHOOK_SECRET="..."                      # matches the Tenant row's webhookSecretPlaintext on nID's side
MODULES="...,identity-verification"
```

nID's webhook target for this shop's Tenant row must be set to this API's
`POST /api/v1/identity-verification/webhook`.
