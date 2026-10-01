---
paths:
  - "apps/web/src/**/*.tsx"
  - "apps/web/src/**/*.css"
  - "apps/pos/src/**/*.tsx"
  - "apps/pos/src/**/*.css"
  - "apps/mobile/**/*.tsx"
---

<!-- Moved verbatim from CLAUDE.md so it loads only when it applies.
     BINDING — identical force to CLAUDE.md itself. Nothing here was reworded.
     Scope: These govern markup and layout. They matter the moment you open a component and not before. -->

## Use what exists

Most drift here came from someone building a thing that already existed. Before
writing markup, check this list. **Grep for the literal before adding one.**

### Primitives — `apps/web/src/components/ui`

| Import | For |
|---|---|
| `PageHeader` | context, title, one line, ONE primary action |
| `Section` | a titled region with no box around it |
| `SectionRail` | parts of one object — all present, jump to any |
| `Tabs` | separate tasks on one object — one at a time |
| `Disclosure` | rare, advanced or destructive — closed by default |
| `MetricStrip` | a row of figures; give an item `detail` to make it open a panel |
| `Bento`, `BentoTile` | a board of tiles of different weight (`hero`, `wide`, `tall`, `sm`) — one job per tile |
| `Skeleton`, `SkeletonText`, `SkeletonRegion` | the first-load placeholder, shaped like its content — never for empty or failed |
| `Switch` | an on/off setting that applies now (`role="switch"`) |
| `Segmented` | a short, mutually visible set of options: `kind="filter"` for a view or range (`aria-pressed`), `kind="choice"` for one value (`radiogroup`, arrow keys). `RangePicker` and the chart view switch are built on it |
| `PageEnter` | wraps a layout's `children` so a page rises into place on navigation (keyed on the pathname, not the segment: a filter in the URL does not replay it) |
| `RevealScope` | a grid or board whose `data-reveal-item` children arrive as they scroll into view; `Bento` already is one |
| `CountUp`, `ProgressRing`, `ScrambleText`, `TypeText` | the **expressive** motion tier: opt in, one purpose each (a figure just computed, a fraction of one thing, a value the system just produced, a line being said), never on a table cell or anything the reader is comparing. Chapter 05 says where each lives |
| `ProgressBar` | a quantity against a known maximum, where a ring is too tall: a ranking line, a workload, an upload. A real `progressbar` (`label`, `valueText`); `tone` is how it ended (`positive`, `negative`), `head` rides a knob, `segmented` cuts it into cells. The fill is a translate, never a width: do not hand-roll `style={{ width }}` bars |
| `SwapText` | a short value that changes in place (a status label): the old one rises out, the new one rises in. `StatusBadge` already uses it |
| `DrawIcon` | wraps the one stroked icon that carries a result (a confirmation tick) so its strokes draw on once; never a toolbar |
| `TruncateReveal` | a label cut by an ellipsis that scrolls to its end under the pointer, at `speed.read`; the full text is always in `title`. Use instead of `.truncate` on a name or title in a narrow column |
| `CountUp mode="reel"` | the odometer: for the one figure a screen is about. Display-only (the strips are not selectable text); keep the default count where a figure is copied |
| `TypeText unit="word"` | a line of prose said word by word; characters stay for a code or a name |
| `useFreshOnChange` (hook) | `true` for one `sweep` after a value changes from one value to another; drive `.sheen` with `data-fresh`. Never on first render or on arrival |
| `Field`, `FormStack` | a form's one labelled field and its rhythm: label above (never in the placeholder), the placeholder an example, 16px between fields and 32px before the one filled button. Pass a `Select`, `DateField` or input as the render-prop control and the label, hint and error are wired for you. Use `field-xl` (56px) on the control. A form on a page with no backdrop gets no box; on a backdrop it takes `card-lit` |
| `HoldToConfirm` | the middle tier of `ACT-6`: irreversible or wide, not financial. A ring fills while held; the label names the act and its object ("Delete project", "Void 3 sales"), never "Yes" or "Confirm" (`check-danger` fails the build on it). Keyboard (hold Space or Enter) and assistive technology (activate twice) are built in |
| `DangerZone` | where an object's destructive acts live: bordered, labelled, last on the page, closed by default. Renders nothing for a person who may do none of them |
| `CooldownBanner` | after a removal of a whole thing: the day it will be gone, the days left, and Restore. The length is `BRAND.safeguards.deletionCooldownDays` |
| `Dropzone`, `UploadTray`, `useUploadQueue` | an upload: the whole card is the target (drop, pick or paste), limits printed first, type and size checked at drop time, then one lane per file with percent, size, speed and Cancel. One failure is retried alone. The tray is docked, never a modal. `useUploads` (admin) is the shared queue |
| `Select`, `MultiSelect`, `DateField`, `Menu` | a choice from a list: `Select` picks the control from the count (under five a `Segmented`, five to ten a menu, past ten a menu with search on top), `MultiSelect` stays open on pick with a live count and an explicit Done, `DateField` is a text field that parses what a person types plus a month and year jump. A choice that cannot be made stays in the list and says why. A native `<select>` with fewer than five literal options, and a native `type="date"`, fail `pnpm lint` (`check-menus`); a native select of five to ten options is still allowed, because the platform's own menu is accessible and collision-aware there |
| `useDoneBeat` (hook) | the beat between "it worked" and "we left": `finish()` marks `Button done` and resolves after one `slow`, so the drawn check is seen before navigation |
| `DataTable`, `EmptyState`, `Badge`, `Button`, `Dialog`, `Loading` | as named; `DataTable` takes `stacked` and `stickyFirst`; `Dialog` takes `align="end"` for a full-height side sheet (the detail of one row); `PageHeader` takes `headingLevel` when it sits inside a page that already has an `h1` |

Cross-surface: `components/common/status-badge` (**the** status pill — do not
write an eighth), `components/common/wizard`.
Storefront: `components/storefront/auth-page`, `legal-page`.
Admin: `components/admin/range-picker`.

### Classes — `apps/web/src/app/globals.css`

`.btn` `.btn-primary` `.btn-secondary` `.btn-ghost` `.btn-danger` `.btn-text`
`.card` `.chip` `.icon-btn` `.field-label` `.field-input` `.field-check`
`.field-inline` `.field-flat` `.notice` `.notice-error` `.notice-success`
`.notice-info` `.eyebrow` `.metric-strip` `.metric` `.table-flat` `.pill`
`.nav-link` `.nav-tab` `.prose-legal` `.lift` `.skeleton` `.stagger`
`.no-scrollbar` `.container-page` `.spinner` `.focus-frame` `.toast-timer`
`.sheet-in` `.sheet-out` `.tab-indicator` `.card-lit` `.media-concentric` `.field-xl` `.stagger-fine` `.btn-hold`

### Everything else

| Concern | Import from |
|---|---|
| Money, dates, numbers | `@newax/shared` — `formatMoney` `formatDate` `formatDateTime` `formatDateShort` `formatMonthShort` `formatWeekdayShort` `formatNumber` |
| Brand, locale, theme | `@newax/shared` — `BRAND` |
| Routes | `@/constants/routes` — `ROUTES` |
| API calls | `@/lib/api-client` `request()`, `@/lib/admin-client` `adminFetch()` |
| CSV download | `@/lib/download-csv` |
| Storage keys | `@/constants/storage` |
| Permissions | `@/constants/permissions` |
| Charts | `@/components/admin/charts` — `TimeSeriesChart` `PeriodComparisonChart` `ShareChart` `FunnelChart` `PointLineChart` `RangeChart` `GaugeChart` `StackedAreaChart` `CalendarHeatmap` `RadarChart` `SmallMultiplesChart`; the data shape picks the form (`/admin/design-system#charts`). Recharts is imported nowhere else |

Motion is a class, not a call site. Press, fill, lift, focus, the invalid
shake, notice arrival, exits and the loading ring are already on `.btn`, `.chip`,
`.icon-btn`, `.field-input`, `.notice`, `.lift`, `Dialog`, `ToastStack`, `Tabs`
and `Button loading`; do not add `transition-*` or `animate-*` to reproduce
them. A new motion takes its duration, easing, distance and scale from the
`--motion-*` tokens (`docs/design/motion/05-motion.md`), and a JavaScript-driven
one asks `usePrefersReducedMotion` first.

The rest of the vocabulary is classes too: `.pop` (a mark too small for `arrive`,
from `scale.pop`), `.sheen` with `data-fresh` (one highlight across a changed
surface), `.ignite` (an error's one-time inset ring; `.notice-error[role=alert]`
has it already), `.step-forward` / `.step-back` (a step arriving from the way the
reader is going), `.arrive-from` (a popup out of its trigger; `Dialog` sets it) and
`.draw-path`. Write a duration as `duration-fast` / `-normal` / `-slow` / `-sweep`
and an easing as `ease-standard` / `-decelerate` / `-settle` / `-exit`: a literal
`duration-200` or `ease-out` is a number nobody chose.

**Never**: a bare `fetch` in a page · `toLocaleString` at a call site · a hex
in a component · a path literal in an `href` · English in customer-facing JSX
(use `apps/web/messages/*.json`) · a second palette · a hand-rolled alert,
status pill, table or modal.

---

## Borders and boxes

A border must mean something. Prefer whitespace and alignment.

**One border, soft, and never two.**

- **Never a box inside a box.** A bordered container directly inside another
  bordered container draws two lines a few pixels apart with nothing between
  them; the reader sees a seam, not a boundary. The inner one goes — a tint
  (`bg-neutral-50`) or plain spacing separates it just as well. This is the
  single most common way these screens get noisy: the wizard was a card, and
  every step inside it drew another.
- **Soft.** Container edges are `border-neutral-100` (#E8E8E8). Controls that
  have to be findable — inputs, checkboxes, the secondary button — get
  `border-neutral-200`, and nothing goes darker. A border is an edge, not a
  drawn line.
- **Never a border and a shadow on the same edge.** That is also two
  boundaries. `.card` has no shadow; `.lift` adds one on hover, when it means
  "this rose".
- A **card** must be a summary, object, status, action, warning or result.
  No decorative cards. A form that is the only thing on its page gets no box.
- A **table** is already a grid — `.table-flat` draws row rules and nothing
  else. No outer frame, no vertical lines, no zebra, and no `divide-*` on top
  of it.
- A **message** gets a tint, not a border — `.notice`.
- A **filter row** is controls, not an object. No box.

The one exception is a **control**, not a container: a segmented toggle whose
outline groups its buttons into one thing, or a dashed placeholder marking an
empty slot. Those may sit inside a card, because they are not claiming to be
a second container.

```bash
# Two bordered containers, one inside the other. Should print 0 beyond the
# two known controls.
python scripts/nested-borders.py
```

---

## No dead ends

A screen a user can actually reach must always offer a next step — a
primary action, a way back, or both. Law 7 ("overview first, detail on
click") is only half the promise if detail can dead-end once you get there.
No screen in this product may be the end of the road.

- Every `EmptyState` carries an action, unless the primary action for that
  state already sits directly above it — a `PageHeader` create button, a
  filter row's own clear control. Never a state with literally nothing to
  click and no action anywhere nearby. `EmptyState` already exists precisely
  to stop hand-rolled ones from drifting into this — use it, don't
  re-invent a bare message.
- Every terminal screen — order confirmation, payment result, a completed
  wizard step, a printed receipt, a finished POS sale — offers at least one
  next action: continue, view, print, back to till. Good news that just
  stops is still a dead end.
- Every Next.js app in this repo ships its own root `global-error.tsx` and
  `not-found.tsx`, each with a working link home, plus an `error.tsx`
  somewhere in the tree that actually covers its routes — one per
  top-level route group is fine (`apps/web` does exactly this:
  `global-error.tsx` and `not-found.tsx` at the root, `error.tsx` inside
  each of `(admin)` and `(storefront)`), a bare root one is fine too, but
  none anywhere is not. Falling through to the framework default is not
  "fine" — the default carries no branding, no nav, and no way back into
  the product. `apps/pos` has none of the three today and must gain them,
  not assume the till never crashes.
- A disabled control states why — a tooltip, `aria-describedby`, or visible
  adjacent text — never just greyed out with the reason left for the user
  to guess.
- A modal or drawer closes three ways: Escape, backdrop click, and a
  labeled close button. The shared `Dialog` already wires all three by
  construction — a hand-rolled modal that skips one of them is the dead
  end, not a stylistic choice.

```bash
# Every Next app ships root global-error.tsx + not-found.tsx, and at least
# one error.tsx somewhere in its tree. Should print nothing.
for app in apps/web apps/pos; do
  for f in global-error.tsx not-found.tsx; do
    [ -f "$app/src/app/$f" ] || echo "MISSING: $app/src/app/$f"
  done
  find "$app/src/app" -name error.tsx | grep -q . || echo "MISSING: $app has no error.tsx anywhere"
done
```

---
