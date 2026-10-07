# ADR-057 — Docs 133 (dry-run harness), 134 (hexagonal-purity CI check) and 138 (technology substitution playbook): a naming convention shipped with better evidence than it cited, a real static check built and wired into `pnpm lint`, one CI overclaim corrected

[← Decision log](../DECISIONS.md)


### Context

Three more architecture-patterns documents, all genuinely small and
buildable rather than deferred-pending-a-real-requirement like the
previous batch: doc 133 proposes a `preview()`/`apply()` naming
convention so future policy-as-data mechanisms don't each reinvent a
dry-run design; doc 134 proposes a static check enforcing that a service
file never imports a transport-layer or frontend-framework dependency;
doc 138 is a written swap-path playbook for every core dependency not
already behind a provider-registry interface.

### Decision — doc 133: shipped, with its own citations replaced by stronger real evidence

Doc 133's opening cited `TaxRate` changes and `ApprovalChain` policy
edits as already having "separately-built preview mechanisms" — neither
does; `TaxRate` is effective-dated (a different technique, a future-dated
row, not a "compute what apply() would do without doing it" method), and
`ApprovalChain` has no simulate/preview method at all. Its other two
citations, doc 132's webhook test-delivery and doc 144's sandboxed
formulas, both carry no `Status:` note — neither is built. The actual
codebase has stronger evidence than any of these: at least four real,
independently-built `preview()`/apply()-shaped pairs —
`CategoryPresetService.preview()`/`.apply()` (an exact match to the
document's own proposed interface), `OrgUnitGrantService
.previewIssue()`/`.issue()`, `AttendanceService.previewAdjust()`/
`.adjust()`, and `MerchantPayableService.previewPayoutRun()`/
`.processPayoutRun()` — each arrived at independently, in a different
module, with no shared base class, exactly the pattern the document
argues for. WO-133.1 (record the convention) is built:
`.claude/rules/services.md` — which already loads for every
`*.service.ts` file per its own `paths:` frontmatter — states it under a
new "Dry run before live" heading, citing the four real pairs above.

### Decision — doc 134: shipped, `scripts/check-hexagonal-purity.mjs` wired into `pnpm lint`

Verified doc 115's own claim first: no `*.service.ts` file in this
codebase imports `express`, `react`, `next`, or uses an `@Req()`/`@Res()`
decorator — the claimed zero-violation baseline holds. Built
`scripts/check-hexagonal-purity.mjs` following `check-module-boundaries
.mjs`'s own file-walking and error-reporting shape, and `check-rebrand
.mjs`'s own `--self-test` convention (8 synthetic cases: an Express
import, a type-only Express import, a React import, a Next.js subpath
import, a bare `@Req()` decorator with no import, and three cases that
must NOT trigger — an ordinary NestJS import, a same-repo service
import, a comment merely mentioning the word). Wired into `pnpm lint`
immediately after `check-module-boundaries.mjs`, with its own `pnpm
check:hexagonal-purity` alias matching every other standalone check in
this repository. Run against the live codebase: 153 service files,
zero violations.

### Decision — doc 138: corrected, one CI overclaim found and fixed

Doc 138's fourth playbook entry claimed a Node.js runtime bump is "a
`Dockerfile` change, tested in CI before rollout." Verified false:
`.github/workflows/ci.yml` runs lint, typecheck and tests directly
against the Node runtime and never builds or runs either
`apps/api/Dockerfile` or `apps/web/Dockerfile`; `.github/workflows
/deploy-cloudflare.yml` is a deployment-status notifier for Cloudflare
Pages' own auto-build, not a Docker pipeline — no workflow in this
repository builds or tests a Docker image today. The Dockerfiles
themselves are real (doc 94's own "verified" status already confirms
this) and a runtime bump genuinely is a small, contained edit — the
overclaim was specifically "tested in CI," now corrected to name the gap
honestly: a runtime bump is manually verified before rollout until a CI
step actually builds and smoke-tests the image. Every other entry
(`PasswordHasher`'s real pluggable-algorithm interface, doc 100's own
outbox-to-broker trigger condition, the provider-registry pattern for a
vendor going out of business) checked out real on inspection.

### Reasoning

Doc 133 and doc 138 both repeat a pattern this whole batch keeps
surfacing — a document's own citations are only as reliable as the last
time anyone checked them, and correcting them is often not a downgrade:
doc 133's real evidence (four independent, unprompted implementations of
the identical shape) is a *stronger* argument for its own thesis than the
fabricated one it originally cited. Doc 138's CI-testing overclaim is a
different, subtler failure mode worth naming on its own: a document
claiming a REAL artifact (the Dockerfiles) is protected by a process that
does not exist (CI building/testing it), which is exactly the gap
`CLAUDE.md`'s own "Observable" pillar row warns against — "never claim
monitoring exists where only logging does," restated here as "never claim
CI coverage exists where only the artifact does." Doc 134 is this
session's rare document that needed no citation correction at all: its
own zero-violations baseline held, and the check it proposed was cheap
enough to just build, matching its own "worth building even though the
audit found zero violations today" argument for why a check like this
earns its keep before the first violation ever lands.

### Consequences

- `.claude/rules/services.md` now states the dry-run naming convention
  next to the failure-path and observability rules every `*.service.ts`
  file already loads — the next policy-as-data mechanism has a named
  pattern and four real examples to follow.
- `pnpm lint` now catches a service file importing a transport-layer or
  frontend-framework dependency the moment it lands, rather than relying
  on review to notice — the same "prevent the first violation" reasoning
  that already justifies `check-module-boundaries.mjs`.
- Doc 138's playbook no longer claims a CI safety net that doesn't exist;
  a future reader deciding whether a Node runtime bump is safe to ship
  knows to verify it manually rather than trusting an automated check
  that was never built.

### Status
**Accepted.**
