# 114 — Custom formulas: a restricted expression evaluator, not arbitrary sandboxed code execution

> **Status: this document's own recommendation stands, again.** Per
> **ADR-026** (`DECISIONS.md`), the owner briefly instructed that a
> general WASM sandbox be built anyway (specified as doc 144). Per
> **ADR-027**, the owner reviewed the actual security exposure a general
> code-execution sandbox carries and reversed that instruction — doc 144
> is withdrawn and deleted. This document's own recommendation (a
> restricted expression evaluator, no ambient authority, no general code
> execution) is this repository's own current, standing answer for the
> two named examples (commission/shipping formulas).

"Provide a secure WebAssembly (Wasm) or embedded execution environment
that allows implementation partners to write custom calculation formulas
(e.g., dynamic commission algorithms or custom shipping weight logic)
directly into the platform without compromising core system stability"
names a security-sensitive capability — letting a partner or client
author code that this repository's own server executes — that deserves
the same caution this repository already applies to every trust-boundary
decision (`.claude/rules/security.md`'s own standing rule, and the
`security` subagent's own `max`-effort routing for exactly this class of
question). This document does not implement anything; it names the real,
narrow need behind the bullet's two examples and recommends the smallest
mechanism that serves them, explicitly declining full sandboxed code
execution unless a concrete future need outgrows it.

## What the bullet's own two examples actually need

"Dynamic commission algorithms" and "custom shipping weight logic" are
both, in every real case, **arithmetic over a small set of named
variables** — a commission is some function of `saleAmount`,
`productCategory`, `salesRepTier`; a shipping weight adjustment is some
function of `itemWeight`, `distanceBand`, `packagingType`. Neither
example requires loops, file I/O, network access, or Turing-completeness
— they require a formula. A general WASM sandbox or embedded scripting
runtime (Lua, a JS `vm` sandbox) is the wrong tool sized for this job: it
is real attack surface (sandbox escapes are a recurring, serious class of
vulnerability across every embedded-runtime product that has ever shipped
one) purchased for a need a much narrower, much safer mechanism already
serves.

## The recommended mechanism: a restricted expression evaluator, never arbitrary code

```ts
// A safe, narrow evaluator over a fixed variable set and a fixed operator
// grammar — no loops, no function calls to anything but a small allowlist
// of pure math functions (round, min, max, abs), no access to anything
// outside the variables explicitly passed in.
interface FormulaContext {
  variables: Record<string, number | string>;
}

function evaluateFormula(expression: string, context: FormulaContext): number {
  // A well-audited, narrow expression-parser library (e.g., a restricted
  // arithmetic grammar, never `eval()`, never a general scripting
  // language's own interpreter) — the formula string itself is a
  // CustomFieldDefinition-shaped, per-organization configuration row
  // (doc 104's own pattern), validated at save time against the known
  // variable names, never executed against untrusted input at runtime
  // beyond the named variables it was given.
}
```

`CommissionFormula`/`ShippingWeightFormula` rows (per-organization,
editable by an admin, per doc 104's own custom-configuration pattern)
store the expression string; `evaluateFormula()` is called at the exact
moment a real commission or shipping-cost calculation needs it, with a
narrow, explicit variable set — never a general "run this code" surface.

## Why this stays a recommendation, not a build order, until a real case names it

No concrete client requirement for either commission algorithms or custom
shipping-weight logic has been named yet in this repository's own
documents — `CLAUDE.md`'s own "No speculative functionality" section
applies directly: building an expression evaluator (or, worse, a full
WASM sandbox) with no real formula to evaluate yet is exactly the
"unused abstraction" this repository declines to ship ahead of a real
need. This document exists so that **when** a real requirement arrives,
the answer is already scoped correctly (a restricted evaluator) rather
than defaulting to the bullet's own oversized ask (a general sandboxed
runtime) under time pressure.

## Scope lenses

Deferred — no schema or mechanism is being built by this document; a full
scope-lens treatment (particularly "The threshold nobody approves
alone" for a formula affecting real commission payouts, and "The failure
path" for a malformed formula) belongs to the future document that
actually builds `evaluateFormula()` against a real, named requirement, at
which point it should route through the `security` subagent's own
`max`-effort review per this repository's own model-routing table, given
its trust-boundary nature (an admin-authored formula executing against
real payroll/shipping figures).

## Work orders

None. This document is a recommendation on record for when a real
requirement arrives, not a build order.

## Acceptance

- No schema or code change from this document.
- Any future implementation of custom formulas cites this document's own
  recommendation (a restricted expression evaluator) rather than
  defaulting to a general sandboxed code-execution runtime without
  re-justifying that heavier choice against a specific, concrete need
  the narrow evaluator cannot serve.

## Out of scope

A general WebAssembly sandbox or embedded scripting language (Lua, a JS
`vm` module) for implementation partners to write arbitrary code — not
recommended above, and not built here; if a future concrete need
genuinely outgrows a restricted expression evaluator (true custom
business logic beyond arithmetic), that decision requires its own
`DECISIONS.md` entry and a `security`-subagent review before
implementation, never adopted casually on this promotional bullet's
authority.
