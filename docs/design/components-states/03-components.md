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
| `Bento` `BentoTile` | a board of tiles of different weight on one grid: `hero` (2×2), `wide`, `tall`, `sm`, each in a `surface`, `quiet`, `accent` or `inverse` tone. One main job per tile; one column below `md`, so a phone reads them in source order |
| `Skeleton` `SkeletonText` `SkeletonRegion` | the first-load placeholder, drawn from the content it stands in for. `SkeletonRegion` is the `role="status"` wrapper with a screen-reader label; the pieces inside are `aria-hidden`. Never stands in for an empty or failed state |
| `Switch` | an on/off setting that takes effect now: `role="switch"`, a label that names the setting (not the action), an optional description, 44 px on touch. A choice that is submitted later is a checkbox, not a switch |
| `DataTable` `EmptyState` `Badge` `Button` `Dialog` `Loading` | as named. `DataTable` takes `stacked` to read as cards below `md` (`02-layout.md`, reflow rule 3), and `stickyFirst` to pin the first column while the rest scroll sideways |

A notice has four tones: `notice-error`, `notice-success`, `notice-warning` (waiting on someone, or about to end — the same amber as the Badge `warning` tone) and `notice-info`.

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
| Review before commit — count header, filter chips, problems under their cells, a commit button that names its count | `/admin/design-system#patterns` (planned: bulk user import) |
| Selection bar — appears with the first selection, states the count, sticks while the list is on screen | `/admin/design-system#patterns` (planned: users, rosters) |
| Difference preview — what is gained, what is lost, the rest as one line | `/admin/design-system#patterns` (planned: access panel) |
| Access that ends — a persistent notice that turns to warning under an hour | `/admin/design-system#patterns` (planned: temporary access) |
| Live count — recounting, ready with a link to the rows, unavailable but still savable | `/admin/design-system#patterns` (planned: audience builder) |
| Profile cards — one job, several cards, one editable at a time | `/admin/design-system#patterns` (planned: company profile) |
| Frosted overlay — text over a picture on an 85% overlay surface with a blur, solid under reduced transparency | `/admin/design-system#patterns` (nearest live use: the storefront product card's floating button, which has the opacity but no blur) |
| Choice cards — a real radio group drawn as cards with a ring, a tint and a tick | `/admin/design-system#patterns` (planned: publish visibility, audience segments) |
| Live indicator — a pinging dot plus the word "Live", still under reduced motion | `/admin/design-system#patterns` (admin live feed would be the first use) |
| Column manager — `Switch` rows, move-up and move-down buttons (no drag handle: it has no keyboard path), a fixed first column that says why it cannot be hidden, "n of N shown", Save view disabled while the view matches the saved one | `/admin/design-system#data` (planned: any wide list) |
| Period comparison — this period against the last as grouped bars (previous is a gray), a legend that is also the filter, and the change table with sign, arrow and tone | `/admin/design-system#data`; the chart is `PeriodComparisonChart` |
| Share of a whole — a flat donut, at most five named slices and an Other, the total as the centre, a legend that picks a slice by keyboard | `/admin/design-system#data`; the chart is `ShareChart` |
| Chart forms — nine forms, each for one shape of data: funnel (ordered stages), point line (a volatile series), range (lowest, average, highest), gauge (one value against a limit or a goal, as concentric arcs for several), stacked area (a total and its parts), calendar heatmap (a count per day), radar (five to seven measures, with a Compare view as bars), small multiples (one measure for several things, one shared scale, side by side or overlaid), and projected against actual as the existing time series. Every one has a table twin, an empty state and a keyboard path | `/admin/design-system#charts`; the charts are `FunnelChart`, `PointLineChart`, `RangeChart`, `GaugeChart`, `StackedAreaChart`, `CalendarHeatmap`, `RadarChart` and `SmallMultiplesChart` |
| Board with scoped tiles — every tile states who reads it and who writes it; a tile the viewer cannot read is left out and the row closes over it, one they can read but not change keeps a disabled Edit with the permission written beside it, and an "Your access" tile explains the absences. The identity tile leads with the logo (a monogram when there is none) and an Active badge; the address tile has an honest "No map preview" slot rather than a drawn map; a closed "Grid map" disclosure shows which of the four blocks the viewer reads and writes | `/admin/design-system#layout` (planned: company profile) |
| People and access sheet — a master list (search, role, branch, count, page size) that opens one person in a full-height side sheet; the sheet says what changes before Save, locks the viewer's own row, lists scope as removable chips, and offers temporary access with a hard maximum, an end date and a countersigner | `/admin/design-system#screens` (planned: users) |
| Publish and audience — a visibility gate (Internal, Unlisted, Public), audience cards that appear only for Public, a live count that debounces and can fail without blocking Save, a confirmation that names the audience before anything goes Public, and a button that reads Publish changes once live | `/admin/design-system#screens` (planned: company profile publishing) |
| Department page — core details with a code suggested from the name, a parent that cannot be a closed unit, leadership and reach shown as links to where they are stored, and a closed "Close this department" disclosure that lists every blocker with its fix | `/admin/design-system#screens` (planned: org units) |
| Stacking and pass-through — a stage at `z-base`, an annotation layer at `z-raised` that is `pointer-events-none`, and each control on it opting back in with `pointer-events-auto`; focus follows source order | `/admin/design-system#depth` (planned: any map, canvas or floor plan with labels) |
| One-click send — Send acknowledges in the same frame, then holds a 5 000 ms undo window, then hands over; a failure says what, why and the next step, and a retry carries the same idempotency key | `/admin/design-system#flows` (planned: invoice dispatch) |
| Segmented control — one primitive for a filter group (`aria-pressed`) and a single choice (`radiogroup`, arrow keys); `RangePicker` and the chart view switch are built on it | `components/ui/segmented.tsx`; `/admin/design-system` |
| Approval routing — nodes, a fork labelled True and False, a test that names the approver an amount reaches and logs it | `/admin/design-system#flows` (planned: approval thresholds) |
| Journey tiers — Global, Area, Destination, View, Object as a funnel you can operate, with the chrome each tier leaves on screen | `/admin/design-system#flows` (`14-navigation.md`, "The shape") |

The patterns in this table are written out from primitives on the reference page, in both themes and at all seven widths, and are **not** components yet (the chart forms are the exception: they live in `components/admin/charts/`). One screen per pattern is a coincidence; the third is when it moves into `ui/`. `Segmented` and `Dialog align="end"` (a full-height side sheet) are the exceptions that were promoted: `Segmented` replaced two copies of the same markup (`RangePicker` and the chart view switch), and the side sheet is a mode of the existing `Dialog`, so it adds no component. The side sheet's panel is `w-full max-w-md` (28 rem), so it fills a phone and sits against the inline-end edge on anything wider; a different phone treatment waits for a second consumer.

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
