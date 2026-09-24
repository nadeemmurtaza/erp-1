# 134 — Enforcing "the core doesn't know its caller" the same way module boundaries are already enforced

Doc 115 found this repository already practices hexagonal architecture —
every service method is trigger-agnostic — but only as an *observed*
pattern, checked by code review, not by a machine. `scripts/
check-module-boundaries.mjs` already proves module independence isn't
just a convention people happen to follow; this document is the
identical treatment for hexagonal purity, so the resilience doc 115 found
already exists becomes resilience that *cannot silently erode* PR by PR.

## 1. The specific violation this check catches

```ts
// A violation this check must catch: a service method that imports or
// references anything HTTP-specific (Request, Response, an Express/
// Fastify type) or React-specific — evidence the "core" has started
// assuming a specific caller.
// apps/api/src/modules/orders/orders.service.ts
import { Request } from 'express'; // <- VIOLATION: a service importing a transport-layer type

// Correct: the controller extracts what it needs and passes plain,
// typed arguments — exactly what every service in this repository
// already does today.
```

```js
// scripts/check-hexagonal-purity.mjs — the same static-scan shape as
// check-module-boundaries.mjs, scanning *.service.ts files for imports
// from 'express', '@nestjs/common' Request/Response decorators used
// outside a *.controller.ts, or any React/Next.js import.
```

## 2. Why this is worth building even though the audit found zero violations today

`CLAUDE.md`'s own module-boundary check exists precisely because "this is
already true, we don't need to check it" is exactly the sentence that
stops being true the day someone under deadline pressure adds one
`import { Request }` to make a quick fix easier. This check is cheap to
write, has zero false positives against the current codebase (verified:
doc 115's own audit found no violation), and its entire value is
preventing the *first* violation from ever landing — the same logic that
already justifies `check-module-boundaries.mjs`'s own existence despite
this repository's module discipline already being consistently followed.

## Scope lenses

Not applicable — this is a static analysis script, not a runtime
mechanism; it introduces no schema, write path, or permission.

## Work orders

**WO-134.1 — `scripts/check-hexagonal-purity.mjs`**, scanning every
`*.service.ts` for a transport-layer or frontend-framework import,
failing with the specific file/line, following `check-module-boundaries.mjs`'s
own error-reporting format for consistency.
**WO-134.2 — wire into `pnpm lint`**, alongside the existing module-
boundary and rebrand checks.

## Acceptance

- The check passes against the current codebase with zero violations
  (the baseline this document's own audit established).
- A deliberately introduced violation (a test PR importing `Request` into
  a service file) is caught and fails the check, proven by the script's
  own `--self-test` mode, per this repository's own convention for every
  check in the `pnpm lint` chain.

## Out of scope

Nothing further — this is a small, complete, low-risk addition.
