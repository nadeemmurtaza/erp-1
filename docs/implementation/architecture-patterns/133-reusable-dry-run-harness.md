# 133 — One dry-run harness, not six independently-built preview modes

`TaxRate` changes, `ApprovalChain` policy edits, doc 132's own webhook
test-delivery mode, and doc 144's own sandboxed formulas each
independently answer "The dry run before live" scope lens with their own,
separately-built preview mechanism. This document is the small,
consolidating step: a shared convention (not a shared runtime) so the
sixth and seventh future policy-as-data mechanism gets dry-run for the
cost of following a pattern, not reinventing one.

## The convention: every policy-as-data mechanism exposes a pure `preview()` alongside its `apply()`

```ts
// The shape every existing dry-run already independently arrived at,
// named once so it's copy-pasteable rather than rediscovered:
interface DryRunnable<TInput, TOutcome> {
  /** Pure: no prisma.*.create/update/delete, no publish() — computes
   *  exactly what apply() would do, without doing it. */
  preview(input: TInput): Promise<TOutcome>;
  apply(input: TInput): Promise<TOutcome>;
}
```

This is **not** a shared base class or a generic runtime every mechanism
must inherit from — per this repository's own "each entity's own shape
differs enough that inheritance would hide more than it shares"
reasoning (doc 72's own explicit rejection of a shared import-service base
class), this is a *naming convention* two methods follow, checked by
review, not enforced by a type system that would force an artificial
common interface onto genuinely different mechanisms.

## Scope lenses

Not applicable — this document introduces no new schema or write path; it
names a convention every future policy mechanism's own document should
follow, with that mechanism's own full scope-lens treatment (including its
own "Dry run before live" answer) written at that time.

## Work orders

**WO-133.1 (documentation only)** — add this convention to
`.claude/rules/services.md` or the nearest fitting scoped rule file, so
"does this expose a `preview()`" becomes a standing question for any new
policy-as-data mechanism, the same way "does this state its failure path"
already is.

## Acceptance

- No schema or code change from this document alone.
- The next new policy-as-data mechanism's own document cites this
  convention by name rather than re-deriving a preview design from
  scratch.

## Out of scope

A generic, shared preview-execution runtime — declined for the same
"two mechanisms for one job" reasoning `CLAUDE.md` applies throughout this
document set; the convention is the reuse, not a shared runtime.
