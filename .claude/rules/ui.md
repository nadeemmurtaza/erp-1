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
| `DataTable`, `EmptyState`, `Badge`, `Button`, `Dialog`, `Loading` | as named; `DataTable` takes `stacked` and `stickyFirst` |

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
`.no-scrollbar` `.container-page`

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
