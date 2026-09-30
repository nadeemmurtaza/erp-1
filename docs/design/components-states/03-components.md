# 03 · Components

The ladder from a token to a page, and the rule that keeps it from growing
sideways.

Status: **primitives are built and enforced** — `.claude/rules/ui.md` is
binding and loads whenever you open a component. Patterns and templates are
precedent, not documentation, which is the gap this chapter names.

## The ladder

```
tokens        colour, space, type, motion          Chapter 01
  ↓
primitives    Button, Badge, Dialog, DataTable     apps/web/src/components/ui
  ↓
components    a primitive with a job                status-badge, range-picker
  ↓
composites    several components as one unit        wizard, product-form
  ↓
patterns      a repeatable solution to a problem    list+detail, approve/reject
  ↓
templates     a page shape                          admin list page, detail page
  ↓
pages         the actual route
```

**The rule that matters: never skip a rung.** A page that reaches past the
ladder and styles raw markup is how a second design system starts. Most drift
in this codebase came from exactly that — someone building a thing that
already existed.

## Primitives

The primitives, in `apps/web/src/components/ui`:

| Import | For |
|---|---|
| `PageHeader` | context, title, one line, ONE primary action |
| `Section` | a titled region with no box around it |
| `SectionRail` | parts of one object — all present, jump to any |
| `Tabs` | separate tasks on one object — one at a time |
| `Disclosure` | rare, advanced or destructive — closed by default |
| `MetricStrip` | a row of figures; `detail` makes an item open a panel |
| `ThemeToggle` | the light / dark / system choice — `segmented` where there is room, `icon` where there is not; it is the only place a person picks a theme |
| `DataTable` `EmptyState` `Badge` `Button` `Dialog` `Loading` | as named |

Cross-surface: `components/common/status-badge` is **the** status pill.
`components/common/wizard` is **the** wizard.

**Every primitive, in both themes, as shipped:** `/admin/design-system`. If a component looks wrong in dark, it is wrong there first.

**Before writing markup, grep for the literal.** That is not advice; it is in
the binding rules.

## Choosing between them

The two that get confused:

- **`Tabs`** — separate tasks on one object, one at a time. The user does one,
  then maybe another. Tab state is a mode.
- **`SectionRail`** — parts of one object, all present at once, jump to any.
  The user is reading or filling in everything, and the rail is a map.

If the user must see two parts together, it is not `Tabs`.

## Patterns — *undocumented*

These exist in the code as precedent and nowhere as specification, so each new
instance re-derives them and drifts slightly. The ones worth writing down:

| Pattern | Where it already lives |
|---|---|
| List + detail | `/admin/orders`, `/admin/products` |
| Approve / reject with a reason | payments approval |
| Wizard, multi-step with a summary | `components/common/wizard` |
| Receive-against-expected | purchase-order receive |
| Scan-to-act | stock count, POS till |
| Filter row + table + empty state | every admin list |

**Rule for a new pattern.** If you find yourself solving a problem a second
time, it is a pattern — name it here before the third.

## Templates — *undocumented*

Three page shapes cover most of the admin:

1. **List page** — `PageHeader` + filter row + `DataTable` + `EmptyState`.
2. **Detail page** — `PageHeader` + `SectionRail` or `Tabs` + related actions.
3. **Task page** — a single form, no box around it, one primary action.

**Rule.** A new admin page starts from one of these. Inventing a fourth shape
requires a reason stated in the PR.

## Component contract

Every component in this system:

1. **Consumes tokens, never literals** (Chapter 01).
2. **Implements every applicable state** (Chapter 04) — not just resting.
3. **Is keyboard-operable and announces itself** (Chapter 07).
4. **Consumes motion tokens if it moves at all** (Chapter 05).
5. **Takes its text from `messages/*.json`** if a user reads it (Chapter 06).
6. **Has one job.** A component that renders differently for four unrelated
   callers is four components wearing a coat.

A component that looks right and adds a click has failed. So has one that
works and adds clutter.

## What never gets hand-rolled

An alert, a status pill, a table, a modal. These exist. A hand-rolled modal in
particular is a dead end, because the shared `Dialog` wires Escape, backdrop
click and a labelled close button by construction — and a hand-rolled one
always forgets at least one.
