# 00 · Principles

How a design decision gets made when no rule covers the case.

Status: **binding by review.** These decide arguments; they are not checkable
by a command.

## The constitution

`CLAUDE.md`'s seven laws come first and are not restated here. Everything below
is how to apply them when two of them pull in different directions.

## Design philosophy

**The product is infrastructure, not an experience.** A merchant opens this to
finish a job — receive stock, approve a refund, close a till — and the best
outcome is that they stop thinking about the software. Nothing here exists to
impress; delight is a by-product of not being in the way.

**Calm is a feature with a cost.** Law 2 says power is moved, never removed.
The cost of calm is the work of deciding what goes one level down, and that
work is the design. A page that is calm because its capability was deleted has
failed, not succeeded.

**The system should feel smaller than it is.** 25 modules, 287 endpoints, 115
tables. The user must never feel that. If a page makes the product look big,
the page is wrong (Law 3) — that is the test the other laws serve.

## Product principles

1. **One page, one job.** Two jobs is two pages (Law 5). A page that answers
   "what do I do here?" with a list has no job.
2. **Overview first, detail on click** (Law 7). Never render the detail of
   everything. A table with twelve columns is usually a table with four columns
   and a detail panel.
3. **The operator's twin exists.** Every customer-facing capability has an
   operator-facing counterpart — a cart has an abandoned-cart view, an order a
   fulfilment queue. Designing one without the other ships half a feature.
4. **Never a dead end.** Every reachable screen offers a next step. This is a
   binding rule, in `.claude/rules/ui.md`.

## UX principles

1. **State is always visible.** A user should never have to guess whether
   something saved, is saving, or failed. Chapter 04 is the full matrix.
2. **The disabled control explains itself.** Greyed out with no reason is a
   puzzle, not an affordance.
3. **Destructive actions are reversible or confirmed — preferably reversible.**
   Undo beats a confirmation dialog, because a dialog trains people to click
   through it.
4. **Progressive disclosure over configuration.** Show what the task needs now;
   advanced options arrive when asked for.
5. **Latency is a design material.** A 400 ms action and a 4 s action are
   different interactions and deserve different feedback, not the same spinner.

## Visual principles

1. **A border must mean something** — binding, `.claude/rules/ui.md`.
2. **Whitespace and alignment before ornament.** If a tint or a gap can
   separate two things, it does; a line is the last resort.
3. **Proportion is derived, never picked.** `padding: 32px` because 32 is a
   familiar number is arbitrary. Chapter 01 is where the scale comes from.
4. **One palette.** A second grey is drift (`text-gray-*` is checked for).
5. **Density is a decision, not an accident.** An ERP table and a storefront
   hero have different correct densities; neither is "the" density.

## Decision principles

When the rules do not settle it, in this order:

1. **Does it make the user's job shorter?** Fewer steps, fewer decisions, less
   to read. This outranks everything below.
2. **Does it hold at every one of the seven screens?** (Law 4.) A design that
   works at `lg` and breaks at `xs` is not finished.
3. **Does it hold in Urdu?** Longer strings, right-to-left, different numerals.
   Chapter 07.
4. **Does it survive the empty, loading, error and permission-denied cases?**
   Chapter 04. A design shown only with happy-path data is a mockup.
5. **Can it be removed?** Law 6. If removing it costs no capability and no
   comprehension, remove it.

If two options remain, take the one that is easier to undo.
