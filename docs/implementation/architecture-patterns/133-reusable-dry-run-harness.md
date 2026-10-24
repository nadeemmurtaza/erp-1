# 133 — One dry-run harness, not six independently-built preview modes

> **Status: shipped, WO-133.1 (2026-09-26).** This document's own opening
> citations were wrong: `TaxRate` has no preview mechanism (it is
> effective-dated, a different technique — a future-dated row, not a
> "compute what would happen without doing it" method), `ApprovalChain`
> has no simulate/preview method either, and doc 132/doc 144 (its webhook
> test-delivery and sandboxed-formula citations) both carry no `Status:`
> note — neither is built. The actual evidence for this document's own
> thesis is stronger than what it cited: this repository already has at
> least four real, independently-arrived-at `preview()`/apply() pairs —
> `CategoryPresetService.preview()`/`.apply()` (an exact match to the
> convention below), `OrgUnitGrantService.previewIssue()`/`.issue()`,
> `AttendanceService.previewAdjust()`/`.adjust()`, and
> `MerchantPayableService.previewPayoutRun()`/`.processPayoutRun()` — each
> built independently, in a different module, with no shared base class,
> exactly the pattern this document names. WO-133.1 is built:
> `.claude/rules/services.md` now states the convention.

At least four services already independently arrived at the identical
shape — `CategoryPresetService`, `OrgUnitGrantService`,
`AttendanceService`, `MerchantPayableService` (see the Status note above)
— each answering "The dry run before live" scope lens with its own,
separately-built preview method. This document is the small,
consolidating step: a shared convention (not a shared runtime) so the
fifth and sixth future policy-as-data mechanism gets dry-run for the
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

**WO-133.1 (documentation only, shipped)** — the convention is recorded in
`.claude/rules/services.md`, which already loads for every
`*.service.ts` file per its own `paths:` frontmatter, so "does this
expose a `preview()`" is a standing question for any new policy-as-data
mechanism, the same way "does this state its failure path" already is.

## Acceptance

- No schema or code change from this document alone.
- The next new policy-as-data mechanism's own document cites this
  convention by name rather than re-deriving a preview design from
  scratch.

## Out of scope

A generic, shared preview-execution runtime — declined for the same
"two mechanisms for one job" reasoning `CLAUDE.md` applies throughout this
document set; the convention is the reuse, not a shared runtime.
