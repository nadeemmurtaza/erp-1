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

## Controls with a contract

Five families of laws, each from a rule card the owner supplied on 2026-10-01
and each stated so a review can cite it: **UPL** (uploads), **MNU** (menus and
pickers), **DNG** (danger), **FRM** (the form recipe) and **CRD** (the card
recipe). They are rulings about specific controls, so they sit with the
components, and they are built: the primitive each one names is in
`apps/web/src/components/ui`, and `/admin/design-system#controls` renders it.

The twelve borrowed laws on the same cards (Fitts, Hick, chunking, Doherty,
proximity, Von Restorff, the goal gradient, Postel, Tesler, similarity, serial
position, peak-end) are not repeated: they are already `ACT-1`, `COG-1`,
`COG-3`, `ACT-3`, `PER-1`, `COG-12`, `COG-10`, `ACT-5`, `COG-8`, `PER-3`,
`COG-11` and `COG-13` in chapter 10, and the table at the end of that chapter
says what enforces each.

### UPL · Uploads

### UPL-1 · One target, three ways in
**Here** — the whole card is the drop target, not a button inside it, and the
same card also opens the file picker on click, Enter or Space, and takes a
paste while it has focus. A control that only works by dragging is closed to a
keyboard; one that only has a button wastes the gesture people already use.

**The test** — drop a file anywhere on the card, press Enter on it, paste an
image into it. All three start the same checks.

### UPL-2 · Honest progress
**Here** — every file in flight shows its percentage, the bytes done and the
total, the speed, and a **Cancel**. The time left appears only once there is
at least a second of samples to stand behind it. A transfer that reports no
progress says "Uploading" beside a spinner and an empty bar, with no percent; it
never draws a number it does not have (`COG-10`: never artificial progress).

**The test** — throttle the network. The bar, the size and the speed move
together and stop together.

### UPL-3 · Check before sending
**Here** — type, size, count and emptiness are checked **at drop time**, with
the same limits the server enforces, so a file the server would refuse never
starts. Each refusal names the file and what to do ("hero.tiff is a TIFF. Use
JPG, PNG, WebP or AVIF."), per `FLO-7`. The server still checks again: this is
a convenience, never authorization.

**The test** — drop a 40 MB file against a 5 MB limit. Nothing is sent, and
the reason is on screen within one frame (`ACT-3`).

### UPL-4 · Limits upfront
**Here** — the accepted types, the largest size and the most files are printed
inside the zone in its resting state, before anyone has done anything wrong. An
error that tells people a limit they could have been told is a design defect.

### UPL-5 · Failure is per file
**Here** — each file is its own lane. One lane fails, retries and cancels
alone; the others carry on and finish. The summary says what happened in
numbers ("2 of 5 · 1 failed"), never "an error occurred".

**The test** — fail the third of five. The other four reach 100%, the third
shows its reason and a **Retry**, and retrying changes nothing else.

### UPL-6 · Never block the app
**Here** — transfers continue in a docked tray, not in a modal that owns the
screen. The tray is a region, not a dialog: the page behind it stays usable,
and it survives moving to another page inside the admin shell. It announces
the outcome (all done, or what failed), not every percentage.

**Fails when** — a 48 MB upload puts a spinner over the product page for two
minutes and the operator cannot read the order they came to check.

### MNU · Menus and pickers

### MNU-1 · Type to filter
**Here** — a list of more than **10** options has a search field on top, and
the field has focus when the list opens. Typing narrows the list by words,
ignoring case and accents; nothing matching says so and offers to clear the
search. Ten options and under open as a plain list.

**Fails when** — a location picker lists 140 branches alphabetically and the
operator scrolls for Lahore.

### MNU-2 · Typed dates
**Here** — a date field is a text field first. It parses what a person types
(`ACT-5`): `2026-10-03`, `3/10/2026`, `3 Oct`, `today`, `tomorrow`, `+7d`; it
shows the date it understood, in the locale's own format, before committing;
and it offers a calendar with a **month and year jump** for people who point.
A date that cannot be understood says so next to the field and keeps the text.

**Fails when** — picking a birth year takes forty clicks on a month arrow.

### MNU-3 · Stay open on pick
**Here** — a multiple choice is checkboxes in a menu that stays open on each
pick, shows a live count ("3 selected"), and closes on an explicit **Done**.
Choosing is not a series of re-openings.

### MNU-4 · Collision-aware
**Here** — a menu is lifted out of whatever contains it, so no card, table or
dialog edge clips it, and it opens below its trigger unless there is less room
below than it needs and more above, in which case it flips up. Its height is
capped to the room it has. It follows the trigger on scroll and on resize.

**The test** — open a menu from the last row of a table at the bottom of a 640
px-tall window: it opens upward, whole, and scrolls inside itself.

### MNU-5 · Reasons, not grey
**Here** — an option that cannot be chosen stays in the list, says why in
words beside it, and carries the one action that clears the reason ("Needs the
Finance module · Enable"). A bare greyed row is an unexplained refusal
(`PRM-2`, `FLO-7`).

### MNU-6 · No menu under 5
**Here** — fewer than five options is a segmented control or a radio group:
one tap, everything visible, nothing hidden behind a click. Five or more is a
menu. `Select` makes this decision from the option count, so a call site does
not. `scripts/check-menus.mjs` fails `pnpm lint` on a native `<select>` with
fewer than five literal options, and on a native `type="date"` (`MNU-2`) beyond
a baseline: short selects were taken to zero, and one date input stays native on
purpose, in `MetadataDrivenForm`, which may compose only plain elements
(architecture-patterns/141 §2).

**Fails when** — "Active / Archived" is a dropdown.

### DNG · Danger

### DNG-1 · Hold to confirm
**Here** — for a destructive act in `ACT-6`'s middle tier (irreversible or
wide, but not financial or cross-branch), the confirmation is a **hold**: the
button fills a ring over 1 000 ms and the act happens when the ring closes.
Letting go early drains the ring and does nothing. Space and Enter hold it too.
The ring replaces the dialog; it does not follow one. The top tier keeps its
typed name.

**The test** — press and release at 600 ms: nothing happened and nothing was
announced as done. Hold to 1 000 ms: it happened once.

### DNG-2 · Verb labels
**Here** — the confirming control names the act and its object: "Delete
project", "Void 3 sales". Never "Yes", "OK", "Confirm" or "Continue". The label
is required where a confirmation is built, so omitting it is a type error.

### DNG-3 · Off the happy path
**Here** — a destructive control is never where the primary action usually is.
In a confirmation the safe choice takes the primary position (the inline end)
and the initial focus, and the destructive one sits apart at the inline start
(`ACT-2`). Pressing Enter on open does the safe thing.

### DNG-4 · Red budget
**Here** — red is the colour of destruction and of failure, and nothing else:
never decoration, never a promotion, never emphasis (`COL-1`). A destructive
button is outlined red and fills only on hover or focus, so a page of them does
not shout; the only red-filled thing a person sees at rest is a state that has
already gone wrong.

### DNG-5 · Danger zone
**Here** — the destructive acts on an object collect in one bordered, labelled
region at the end of its page, closed by default, with a closed state that
says what is inside ("Danger zone · 2 actions", `COG-5`). Last position keeps
them off the happy path (`COG-11`, `ACT-2`).

### DNG-6 · Cooldown
**Here** — removing something that took time to build (an account, a brand, a
workspace) is scheduled, not instant: it stays recoverable for **14 days**,
every page about it says when it will be gone and offers **Restore** in one
click, and only then is it purged. The cooling-off period is the confirmation.

**Fails when** — an owner deletes a brand on a Friday and there is no Monday.

### FRM · The form recipe

### FRM-1 · Hierarchy
**Here** — one big title, one primary button, and everything else as links:
"Forgot password?", "Create account". A second filled button on a sign-in form
is a second decision (`COG-1`, `COG-12`).

### FRM-2 · Spacing
**Here** — fields are 56 px tall, 16 px apart, and 32 px separates the last
field from the primary button. The larger gap says "the fields are done"
(`PER-1`, `SPA-2`).

### FRM-3 · Labels
**Here** — a label sits above every field and stays when the field is filled.
The placeholder shows an example of the answer ("you@company.com"), never the
question. A label that disappears on focus is a memory test (`COG-6`).

### FRM-4 · Colour
**Here** — three text tiers (primary, secondary, quiet), one accent, and a 2 px
focus ring that is never removed (`ACC-2`, `COL-4`).

### FRM-5 · Depth
**Here** — a 1 px border, a surface lit from the top, and a soft shadow (one
elevation step, `raised`). The card takes the house corner (`--radius-lg`) and
its fields the field corner (`--radius`); the reel this came from used 24 and
12, which are soft-brand values and one decision away (see ADR-083's seventh
addendum), not a literal to copy. A form that is the only thing on a page still
takes this surface when the page behind it carries a backdrop, because the
surface is what separates form from backdrop and, in the dark theme, is also
the elevation cue. Where nothing sits behind it, `ui.md`'s "no box" still
holds.

### FRM-6 · Motion
**Here** — the focus ring eases in over 140 ms, a press sinks over 80 ms and
returns over 140 ms, and a submit button's spinner becomes a drawn check over
320 ms when the request succeeds, so the end of the action is seen
(`COG-13`, `ACT-3`). All from motion tokens; none moves layout.

### CRD · The card recipe

### CRD-1 · Hierarchy
**Here** — a big, bold title; quieter details beneath it; the price weighted
above both. The eye reads title, price, button, in that order (`TYP-4`).

### CRD-2 · Spacing
**Here** — the 8-point grid: 24 between cards, 16 of body padding, 8 between
lines inside it and 8 of inset around the image (`SPA-1`).

### CRD-3 · Colour
**Here** — three neutral tiers for text, and one accent, spent on the price
and the button and nothing else on the card (`COL-4`, `COG-12`).

### CRD-4 · Depth
**Here** — a 1 px border and a surface lit from the top (`.card-lit`), with no
shadow at rest: a border and a shadow on the same edge draw two boundaries
(`ui.md`). The shadow arrives with the lift, when the card rises under a pointer
and it means "this rose". The reel this came from drew both at rest; that is a
soft-brand habit one decision away, not a literal to copy.

### CRD-5 · Corners curve together
**Here** — an inner corner is the outer corner minus the gap between them. A
24 px card with an 8 px inset holds a 16 px image: `concentricRadius(24, 8) =
16`. Three unrelated radii look like three objects glued together. Where the
gap is larger than the outer radius the inner corner is square, never negative,
which is what the house shape produces today (a 3 px card, an 8 px inset, a
square image). The rule is the formula, so it holds at any brand's radius;
the numbers are the brand's.

### CRD-6 · Motion
**Here** — on hover the card lifts 4 px (`motion.distance.lift`) and takes the
next shadow step; on press the lift reverses, because a card is too big to scale
(2% of 400 px is 8 px) and the button inside it carries the 98% press instead.
Siblings entering a grid arrive 40 ms apart for at most four steps (160 ms in
all) on the `settle` curve (`MOT-6`), each row cascading from its start edge.
Nothing bounces (`MOT-3`).

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
