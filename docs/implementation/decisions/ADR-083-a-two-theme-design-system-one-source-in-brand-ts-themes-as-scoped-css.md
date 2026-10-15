# ADR-083 — A two-theme design system: one source in `brand.ts`, themes as scoped CSS custom properties, fill and ink split, a closed Tailwind palette, and contrast enforced in both themes

[← Decision log](../DECISIONS.md)


### Context

The design system (`docs/design/`) specified eight token groups and built
three (colour, radius, type), all light-only. There was no dark theme, no
spacing/size/elevation/layer/motion token a surface could import, stock Tailwind
colours and numeric z-indexes were in use beside the brand palette, and
`scripts/check-contrast.mjs` measured only one theme. The request was a complete
premium design system with light and dark modes. This repository is one
deployment per brand (`CLAUDE.md`, "Scale: the three axes"), so the system had
to stay a build-time value per brand, not a runtime multi-tenant theme.

### Options Considered

1. **Tailwind `dark:` variants in every component.** The obvious route. Rejected:
   about 1,700 existing `neutral-*` call sites would each need a second class,
   every future component would have to remember it, and "forgot the `dark:`" is
   invisible in review. It also makes a component know which theme it is in.
2. **A codemod to rewrite call sites to semantic names, then theme the names.**
   Rejected as a first step: a 1,700-site diff is not reviewable, and it buys
   nothing the next option does not.
3. **Scoped CSS custom properties behind the existing class names (chosen).**
   `text-neutral-900` keeps its name and resolves through
   `rgb(var(--color-neutral-900) / <alpha-value>)`; the theme redefines the
   variable. No call site needs to change for the flip, `bg-neutral-900/60` still
   works, and a region can be pinned to one theme.
4. **A runtime theming library or CSS-in-JS.** Rejected: a dependency
   (`dependencies.md`) for something the platform does, and it would not reach
   `apps/mobile`, which consumes `packages/shared` but not Tailwind.

### Decision

- **One source.** `packages/shared/src/brand.ts` holds `colors` (light) and
  `colorsDark`, plus new `space`, `size`, `elevation` (per theme), `layers` and
  `motion`. The `theme-*.ts` files are thin views; `theme-tailwind.ts` turns the
  source into CSS variables and a Tailwind theme; `theme-runtime.ts` is the
  framework-free preference logic and the no-flash script.
- **Theme = `data-theme` on `<html>`**, scopes `:root`, `[data-theme='light']`,
  `[data-theme='dark']`, plus an `@media (prefers-color-scheme: dark)` fallback
  on `:root:not([data-theme])` for the case the script never ran.
- **Fill and ink are separate.** `bg-accent` is the brand fill in both themes;
  `text-/border-/ring-accent` are the ink (lighter in dark). Status-hue washes and
  ink follow the theme; solid fills keep their stock value.
- **Closed palette.** `theme.colors` and `theme.zIndex` are replaced, not
  extended. An unlisted colour or a numeric z-index generates nothing.
- **`cn()` knows the new names.** `tailwind-merge` only knows stock Tailwind:
  it kept both of `z-raised z-modal`, and read `text-metric` as a text colour,
  so `cn('text-metric', 'text-neutral-900')` silently dropped the metric size.
  `cn.ts` now extends it from the same token lists Tailwind is built from
  (`cn.spec.ts` holds the cases).
- **Two new semantic pairs** so a fill can survive the flip: `inverse` /
  `on-inverse`, and `scrim` for veils; `surface` and `overlay` so elevation can
  be said with lightness in dark.
- **Contrast enforced in both themes**: `theme-contrast.spec.ts` (every role
  pair; editing a dark value to break a floor was confirmed by hand to fail it) and
  `check-contrast.mjs` (every class use, each theme with its own baseline).
- **Reference page** `/admin/design-system`: public, `noindex`, reads no data,
  rendering the tokens and the real components and measuring contrast live.

### Parameters

| Parameter | Exact value | Why this number |
|---|---|---|
| Contrast floors | text 4.5:1; a control's boundary, a chart mark 3:1 | WCAG 2.2 AA (1.4.3, 1.4.11). The repo's existing `FLOOR` in `check-contrast.mjs`, unchanged. |
| Dark page / surface / overlay | `#0c0b0b` / `#171516` / `#242122` | Each step is lighter than the last: a shadow cannot say "higher" on near-black. Neutral-tinted, same hue family as the light ramp (`#121111` ink). |
| Dark neutral ramp | 50 `#0c0b0b` · 100 `#2b292a` · 200 `#6d6b6c` · 300 `#7b797a` · 400 `#8c8a8b` · 500 `#a3a1a2` · 600 `#bbb9ba` · 700 `#d1cfd0` · 800 `#e6e4e5` · 900 `#f9f7f8` | Monotonic (tested). 200 is 3.44:1 on the surface (control outline floor); 300 is 4.55:1 on the page (it was `#7a7879`, 4.48:1, and the two-theme check found it); 400 and up clear 4.5:1 on page, surface and overlay. |
| Dark brand ink | `#3db8cb` / hover `#8fdae6` | 7.72:1 on the surface. The fill stays `#0e8294` so a white label keeps 4.53:1. |
| Dark status tint mix | 10 / 16 / 26 / 40 % of the hue's 500 into the surface (steps 50/100/200/300) | Above about 16 % a red notice reads as an alarm lamp on a dark card; 26 vs 10 keeps `border-red-200` a visible hairline against its own 50 wash. |
| Elevation (light) | raised `0 1px 2px 0 / 0 1px 3px 0` at 6 %; overlay `0 4px 8px -2px` 8 % + `0 12px 24px -6px` 12 %; modal `0 8px 16px -4px` 12 % + `0 24px 56px -12px` 30 %, all `rgb(18 17 17)` | Two-layer shadows (contact + ambient), neutral-tinted rather than pure black. |
| Elevation (dark) | raised 50 % / 40 %; overlay 50 % / 55 %; modal 55 % / 70 %, `rgb(0 0 0)` | Higher opacity because a shadow on near-black is otherwise invisible; it is the secondary cue after surface lightness. |
| Layers | base 0 · raised 1 · raised-2 2 · raised-3 3 · sticky 10 · dropdown 20 · overlay 30 · modal 40 · toast 50 · debug 90 | The chapter-01 list, plus three in-card steps the storefront product card needed (link, badges and scrim, heart). |
| Durations | instant 80 · fast 140 · normal 220 · slow 320 · sweep 420 ms | Chapter 01's values, plus `sweep` for the button fill that was a literal in `globals.css`. |
| Space / size | 0, 2, 4, 8, 12, 16, 24, 32, 48, 64 px; control 32 / 40 / 48; icon 16 / 20 / 24; touch 44, POS 48 | Chapter 01 and 07, unchanged. |
| Theme storage | `localStorage` key `newax.theme`; values `light` \| `dark` \| `system`; default `system` | Per device, not per user (see lenses). Anything else stored is treated as `system`. |

### Reasoning

The fill/ink split is the decision the rest depends on. The teal dark enough
for a white button label (`#0e8294`, 4.53:1) reads only 4.02:1 as text on the
dark surface `#171516`, under the 4.5:1 floor; the teal light enough for that
(`#3db8cb`, 7.72:1) gives a white label just 2.36:1. No single value satisfies
both, so the same token name resolves differently for a background and for ink. Everything else follows from wanting no call site to
know which theme it is in.

The closed palette is a trade: it makes a stray `text-orange-600` produce no
style rather than a correct-in-light, wrong-in-dark colour, at the cost of one
more edit when a hue is genuinely needed. The hues in use (red, green, amber,
blue) are listed; adding one is a change to `createThemeTailwind`, which is the
point.

The two-theme contrast check paid for itself in the same change: it found a real
failure in dark (`bg-neutral-200 text-neutral-900/80` on the trading-partners
page, 3.84:1, now the shared neutral badge colours) and a marginal one
(dark `neutral-300`, 4.48:1), and it cannot be satisfied by an inverse fill
written as `bg-neutral-900 text-white` (its self-test proves it fails in dark).

### Consequences

- Existing call sites flip without edits; the call sites that cannot survive a
  flip (roughly seventy files) were migrated by hand: inverse fills, scrims, floating surfaces,
  off-palette stock hues, `z-50`-style literals, and the chart colours.
- Regions that must not flip are pinned with `data-theme="light"`: product-card
  badges, the announcement bar, the footer, the bottom-nav pill, the filter
  count badge, the email-template preview iframe and the BPMN canvas.
- **Known gaps, named rather than hidden:**
  1. **Light control outline is 1.72:1** against a 3:1 floor. It was before this
     work. The fix (darken light `neutral-200`, or add a dedicated control-edge
     token) changes the look of every input and is a brand decision.
  2. **POS and mobile have no dark mode.** The tokens are in `packages/shared`;
     adopting them is per-app work (POS has its own Tailwind config and root
     layout; mobile reads the tokens as numbers).
  3. `global-error.tsx` and `not-found.tsx` render before any stylesheet and stay
     light.
  3a. The reference page is reachable in production. It was written to 404
     there, but `check-frontend-secrets.mjs` (House Rule 12) rejects any
     non-`NEXT_PUBLIC_` `process.env` read in `apps/web/src`, `NODE_ENV`
     included, and loosening a security check to gate a reference page is the
     wrong trade. Options if it should not be public: move it behind sign-in
     (inside `(app)`), or add `NODE_ENV` to that check's public-by-definition
     list. Left as an owner decision.
  4. Urdu strings added for the toggle (`theme` namespace in `ur.json`) need a
     native reviewer.
  5. No page-level Content-Security-Policy exists today (`next.config.mjs`'s
     policy is the image optimizer's). The day one is adopted, the inline
     no-flash script needs a hash or nonce; its text is constant, so a hash is
     straightforward.
- No visual-regression tooling exists; the reference page was checked in
  Chromium at 280, 380, 640, 768, 1024 and 1536 px in both themes (no horizontal
  overflow at any width), and the dialogs, toasts, charts and pinned regions by
  hand. Focus order, reduced motion and RTL remain unchecked by any command, as
  `.claude/rules/design.md` already says.

### Pillars and scope lenses

**Pillars touched.** *Proper architecture*: tokens stay in `packages/shared`,
no module imports another (`check-module-boundaries` unaffected). *Scalable*: one
stylesheet, repaint by attribute change, no per-component JS. *Secure*: no server
change, one new unauthenticated page (the reference: no data, no API call, only values
already public in the stylesheet), and the inline script is a constant with a
JSON-escaped key. *Stable*: every failure mode of the
no-flash script (storage throws, `matchMedia` missing, script fails) degrades to
the OS preference. *Observable*: n/a, nothing server-side.

**Scope lenses.**
- The actor: n/a, no new actor; the preference belongs to a browser, not a `User`.
  A per-user server-side preference is a separable follow-up (a `User` column and
  an endpoint), sequenced after this.
- The principal with no permission key: the reference page reads no rows and
  calls no API, so it carries no `@RequirePermission`; the
  theme toggle is a presentation preference, not a capability, and adds no
  `PERMISSION_CATALOG` key.
- The grant that ends itself: n/a, grants nothing.
- Whose rows, and which columns: n/a, reads and writes no rows.
- The threshold nobody approves alone / toxic pair: n/a, commits no money or stock.
- Authority and blast radius: a palette change is a PR to `brand.ts`; the worst
  value one can set reaches every screen, and the build stops it at the floors
  (`theme-contrast.spec.ts`, `check-contrast.mjs`).
- Audience is a capability: n/a, sends no message.
- Request or record: the one write (`localStorage`) is a REQUEST the browser may
  refuse; the refusal path is the `system` fallback.
- The movement with no address / four hours down: n/a, no stock or cash write;
  the theme works offline.
- The money lenses (posting rule, dimensions, closed period, second legal entity,
  dry run, click the number): n/a, posts no journal line and shows no figure.
- Three silhouettes: a Solo, Chain or Organization deployment reads the same
  tokens; a second brand supplies its own `colors`/`colorsDark` at build time.
- The absent collaborator: depends on no module; a deployment without any pack
  renders the same theme.
- The second copy of the write: the init script and `setPreference` are
  idempotent.
- The hundred-thousandth row / the adoption test: n/a, no table, no generated code.
- The reversal document / undo fan-out: a theme is reversed by choosing another.
- The version stamp: the palette is versioned by git; no record stores a colour.
- The erasure the ledger cannot obey: the only stored datum is the `newax.theme`
  key, which holds no personal data.
- The failure path: a storage failure is silent and recoverable (follows the OS).
- Reachable: the toggle is in the admin header (`admin-shell.tsx`) and the
  storefront header (`theme-switch.tsx`); the reference page is opened by URL from
  `docs/design/` and is allow-listed in `check-links.mjs` with that reason.

### Status
**Accepted.**

Addenda are numbered by their headings, which are not a count: the two that carry no ordinal (2026-09-30
and the first of 2026-10-01) are the first and second, so the one headed "(second)" is the third and the
one headed "(eleventh)" is the twelfth.

Superseded in part by the eleventh addendum, where an earlier figure no longer holds: the contrast baselines
of 43 light and 39 dark quoted in the "(third)" and "(fourth)" addenda (now 52 and 42, because the check
learned `@apply`); the toast default written as `use-toast.ts`'s own `4 000 ms` in the "(fifth)", "(seventh)"
and "(eighth)" addenda (the number is unchanged and now lives in `BRAND.feedback.toastMs`); "no consumer" for
`components/common/toast-container.tsx` in the "(fifth)" (still true, now marked in the file and listed in the
generated index); and the 113 self-test cases of the "(tenth)" (now 124).

### Addendum — 2026-09-30: the admin UI spec (220) folded in

**Requirement.** The owner asked for `220-admin-ui-gemini-ideas-design-spec.md`
to be used as input to this design system. It lives on
`claude/ecstatic-archimedes-vlkgzk` (commit `ab1ad818`), not on this branch, so
it is referenced by path and not copied — a second copy would be a duplicate
document of record. It plans twelve admin screens, each its own work order, and
lists "new design tokens" as out of scope. So it adds no tokens; it is a consumer
of this system and the test of whether the system holds what those screens need.

**What was taken, and why each is here.**
- `DataTable` gains an opt-in `stacked` prop (default `false`). Spec §Shared layout
  contract: table screens become stacked cards below `md`; five planned lists
  need it (bulk import review, products feed, users, audit log, roster). Every
  existing table renders the same markup as before — checked in the built page:
  seven unstacked tables, none carrying a role attribute or a `max-md` class.
  Stacked tables restate their ARIA roles, because `display: block` removes table
  semantics in some browsers.
- `.notice-warning`, the fourth notice tone, in the same amber pair as the Badge
  `warning` tone. The access-ending banner (§3), the import "needs attention" line
  (§1) and "count unavailable" (§5) all need it, and notices had no warning tone
  while badges did. One existing hand-rolled amber banner
  (`trading-partners/[id]`) is not migrated here.
- An "Admin patterns" section on `/admin/design-system`, written out from
  primitives only: review before commit (§1), selection bar (§7, §10), difference
  preview (§2), access that ends (§3), live count (§5), profile cards (§4). They
  are specimens, not components.

**What was deliberately not built.**
- Any screen, route, endpoint, permission or table from the spec — each is its own
  work order with its own lenses (spec §Implementation plan).
- A side drawer that becomes a full-screen sheet below `md` (§6): one consumer.
  `03-components.md` states the rule of three, and this is the first.
- A stepper, a drop zone, a split button: already covered by `components/common/wizard`,
  `CsvImportCard` and plain buttons, or unneeded until the screen exists.
- Pixel motion (§12): the spec itself calls it decorative and last. It fails Law 6.

**A conflict, and the ruling.** `02-layout.md` says a scrolling table is usually
better for an ERP than cards, because users compare rows. The spec says cards
below `md`. Both hold: `stacked` is opt-in, for lists read one row at a time, and
`02-layout.md` now says so next to the rule it qualifies. The chapter's default
for compared rows is unchanged.

**Parameters.**

| Parameter | Exact value | Why | Enforced |
|---|---|---|---|
| Stacking breakpoint | below `md` = 768 px | the boundary the spec and the seven-screens ladder already use; between `fold` (672) and `md` a four-column table does not fit | `max-md:` variants in `data-table.tsx` |
| `stacked` default | `false` | changing how seven existing tables look is a behaviour change nobody asked for | prop default |
| Selection bar offset | `bottom-4` (1 rem), `z-sticky` | clears the page edge and sits in the same layer as the sticky header | `patterns.tsx` only |

The spec's own numbers (a 300 ms count debounce, an "In 48 h" option, a one-hour
warning threshold) belong to the screens that will use them and are not
implemented here.

**Verification.** `pnpm lint` exit 0 (contrast within both baselines), web
typecheck and 23 web tests pass, production build passes. The new section was
captured at 280, 380, 640, 768, 1024, 1280 and 1536 px in both themes: no
horizontal overflow at any width, no console errors, cards below 768 and a table
from 768.

**Noticed, not changed.** `tailwind.config.ts` names its screens `xs` 380, `sm` 640,
`fold` 672, `md` 768, while `CLAUDE.md` names them `xs` 280, `sm` 380, `fold` 640,
`md` 768. `md` agrees, which is the only one this change uses; the lower names
disagree and should be settled in their own ADR before a component leans on them.

**Pillars.** *Architecture*: no module boundary touched. *Scalable*: CSS-only
reflow, no client JS, no extra DOM. *Secure*: no route or data. *Stable*: opt-in,
so no regression path for existing tables. *Observable*: n/a.

**Scope lenses.** One opt-in prop on a shared primitive, one CSS class, specimens
and documentation — not a named feature: the five screens the spec plans run their own
lenses. n/a for every money, stock, actor and erasure lens: writes no row, reads
no row, posts nothing. Reachable: the specimens are at `/admin/design-system#patterns`,
in the page's section nav.

### Addendum — 2026-10-01: what the "Modern ERP UX Design Blueprint" adds to premium

**Requirement.** The owner asked for the shared document to be mined for
anything that makes the design more premium. The Google Doc link itself could not
be opened from this environment (`docs.google.com` is denied by the network
policy), so this addendum rests on the copy attached to the thread, which is the
same Gemini transcript spec 220 was written from: 2,677 lines, mostly Vue and
Quasar for functional screens. Its visual ideas are few. Each was weighed against
the house rules before it was taken.

**Taken, re-expressed in this system's tokens.**

| Idea in the transcript | What was built | Why it fits |
|---|---|---|
| Frosted glass over imagery (`bg-white/85 backdrop-blur-xl`) | `bg-overlay/85 shadow-overlay backdrop-blur-md`, solid under `prefers-reduced-transparency` | text keeps a surface; held to 4.5:1 by `theme-contrast.spec.ts` |
| Selectable cards with a tinted selected state | choice cards: real radio group, ring + tint + tick | the selected state is never colour alone; no border, per `ui.md` |
| Pulsing "live" dot | dot plus the word "Live", `motion-safe:animate-ping` | motion that communicates (a live feed), honours reduced motion |
| Slide-in floating selection bar | `motion-safe:animate-slideUp` on the bar | transform and opacity only, from the existing keyframe and duration tokens |

**Parameters.**

| Parameter | Exact value | Why this and not another | Enforced |
|---|---|---|---|
| Frosted surface opacity | 85% | the lowest step tried (85, 70, 60, 50) that keeps primary and secondary text at 4.5:1 over a flat black and a flat white backdrop in both themes; worst case at 85 is 5.52:1 (dark, white backdrop, secondary text), and 70 falls to 3.65:1 there | `theme-contrast.spec.ts`, "frosted surface over a black/white backdrop" |
| Backdrop blur | `backdrop-blur-md` (12 px) | enough to average away detail behind small text; a blur is also what makes flat black or white the true worst case | specimen |
| Transparency fallback | solid `bg-overlay`, no blur, under `prefers-reduced-transparency: reduce` | transparency is the thing that setting turns off | arbitrary variant in `patterns.tsx` |

**Failure modes.** No `backdrop-filter` support: the 85% surface is still opaque
enough for the contrast figures above, the blur simply does not apply. No `:has()`
support (Firefox before 121): a choice card loses its keyboard focus ring, but
the ring, tint and tick are driven by state and still show.

**Not adopted, and why.**
- `rounded-2xl` and `rounded-3xl` cards: the house shape is sharp, with `lg` a hair
  softer for large panels (`brand.ts` radii). Rounder corners would read as a
  second design system.
- A border and a shadow on the same card edge (`border-gray-100 shadow-sm`):
  forbidden by `ui.md`. Elevation is the shadow alone.
- `bg-gray-900 text-white` for the floating bar: the pair that cannot survive a
  theme (17.9:1 in light, 1.07:1 in dark). `bg-overlay` carries it.
- A coloured glow under the primary button (`shadow-blue-500/30`): decoration that
  moves with the brand and names a literal colour.
- `bg-blue-600`, `text-gray-500` and similar literals: Law 1.
- The WebGL pixel shader, pixel-hover cards and `<PixelHeroBanner/>`: a second GPU
  context and a per-frame loop on pages whose job is something else, adding no
  information. Fails Laws 3 and 6, as spec 220 §12 already says.
- Mock arrays, `req.ip` and a controller-written `audit_logs` table: the functional
  ideas are already mapped, with their house-rule replacements, in spec 220.

**Noticed, not changed.** `cn()` drops a bare `outline` when `outline-2` follows it:
`cn('outline outline-2')` returns `outline-2`, which in Tailwind 3 draws nothing
(`outline-2` sets a width, `outline` sets the style). The merge library is
tailwind-merge 3, whose class groups follow Tailwind 4, where a width utility also
sets the style; this repo is on Tailwind 3.4. Nothing in the app combines the two
today, which is why it has not bitten; the choice cards use a ring, the house focus
style, and so avoid it. Worth its own look before anyone writes `outline outline-2`.

**Verification.** Web typecheck and lint pass, contrast passes in both themes, and
the new shared spec covers both themes at both worst-case backdrops.

**Scope lenses.** Specimens and one spec: reads and writes no row, no money, no
stock; no actor, permission or erasure lens applies. Reachable at
`/admin/design-system#patterns`.

### Addendum — 2026-10-01 (second): the eleven concept images, built as primitives, charts and specimens

**Requirement.** The owner shared eleven images (a bento board, skeleton screens, a
column manager over a dark data grid, an approval-routing canvas, a five-tier
"Modular ERP Journey Hierarchy" funnel, a "Regional Performance" comparison and a
3D "Department Budget Allocation" donut) and asked for each to be improved to the
most premium level and added to the design system. Each was taken apart into what
it is for, then rebuilt from this system's tokens. None of the images' colours,
radii or fonts were copied (Law 1).

**What was built.**

| Concept | Where it lives | What kind of thing it is |
|---|---|---|
| Bento board | `ui/bento.tsx`: `Bento`, `BentoTile` | primitive: a dashboard, a branch overview and a record home all want the same grid |
| Skeleton screens | `ui/skeleton.tsx`: `Skeleton`, `SkeletonText`, `SkeletonRegion`; `.skeleton` repainted in `globals.css` | primitive: every list and card has a first-load state |
| Toggle in the column manager | `ui/switch.tsx`: `Switch` | primitive: `role="switch"`, used by the manager and by any setting that applies now |
| Pinned first column | `DataTable stickyFirst` | opt-in prop on the existing table |
| Regional comparison | `admin/charts/period-comparison-chart.tsx`: `PeriodComparisonChart` | chart wrapper, inside the one folder `check-chart-imports.mjs` allows Recharts in |
| Department budget donut | `admin/charts/share-chart.tsx` upgraded in place | same component, same one consumer, same props |
| Column manager | `design-system/data-concepts.tsx` | specimen: one consumer so far, so written from primitives (rule of three) |
| Routing canvas, journey tiers | `design-system/flow-concepts.tsx` | specimens: each has one consumer |
| Bento and skeleton demos | `design-system/layout-loading.tsx` | specimens |

Shared by the charts: `chart-tooltip.tsx` (the one readout), `chart-math.ts` (the
change and share arithmetic, with `chart-math.spec.ts`: 19 cases), and
`use-reduced-motion.ts` (Recharts animates in JavaScript, which the stylesheet's
reduced-motion rule cannot reach). Two tokens were added to `chart-theme.ts`:
`CONTEXT` (`neutral-400`, the de-emphasis colour) and `HOVER_WASH`.

**Improved, not copied.**
- **The 3D donut became a flat one.** A tilted, extruded donut makes the near
  slices look larger than the far ones, so the picture misreports the number it is
  for. The premium treatment is spent where it helps reading: rounded slice ends, a
  gap between slices, the total as the hero figure in the centre (which becomes the
  chosen slice's value and share), and a legend that is also the keyboard path to a
  slice. Never more than five named slices and one "Other".
- **The previous period is a gray.** The comparison is "this one, against context",
  which is the emphasis form (one hue and a gray), not two categorical slots.
- **The skeleton was invisible on a white card.** The old `.skeleton` swept
  white, `neutral-50`, white, which is nothing on a `bg-surface` card. It is now a
  `neutral-100` base with a surface highlight, and it is only the first of four
  states in the specimen: empty and failed are designed beside it and never replaced
  by it.
- **Reordering is two buttons, not a drag handle.** A drag handle has no keyboard
  path without a library, and `dependencies.md` asks what a package does that the
  platform cannot. Move up and move down are keyboard-complete, 44 px on touch and
  announced in a `role="status"` line. A drag layer can come later as an
  enhancement over the same state.
- **The journey funnel uses the product's own five tiers**, not the image's
  invented ones: Global, Area, Destination, View, Object (`14-navigation.md`, "The
  shape"). What each tier leaves on screen follows `NAV-4`, `NAV-7`, `NAV-8` and
  Law 7, and that chapter now says so in one paragraph ("The chrome narrows with the
  job").

**Parameters.**

| Parameter | Exact value | Why this and not another | Enforced |
|---|---|---|---|
| Skeleton sweep | 1.6 s per pass, `ease-standard`, highlight `surface` at 70%, band 50% of the element's width, base `neutral-100` | one pass per 1.6 s is 0.6 Hz, far under the 3 flashes per second of WCAG 2.3.1; 70% is enough to read on `neutral-100` in both themes without a bright flash in dark | `.skeleton` in `globals.css`; the global reduced-motion rule freezes it after one frame |
| Switch | track 44 × 24 px, thumb 20 px, thumb travel 22 px (1.375 rem), row `min-h-touch` (44 px); off = `neutral-400` (3.34:1 light, 5.30:1 dark on surface), on = `bg-accent` (4.53:1 light, 4.02:1 dark on surface) | a control's state is held to the 3:1 floor for a mark; the 44 px row is the touch target | `ui/switch.tsx`; contrast by `check-contrast.mjs` |
| Period comparison bars | `maxBarSize` 24 px, 4 px rounded data-end, square base, `barGap` 2 px, hairline `neutral-100` grid, default height 240 px | dataviz marks spec: thin bars, a gap between a pair, quiet grid | `period-comparison-chart.tsx` |
| Donut geometry | 192 px square, outer radius 84, inner radius 66 (an 18 px ring, and a 132 px hole that fits "Rs 1,075,000" at 16 px), `paddingAngle` 2° (about 2.9 px at the outer edge), `cornerRadius` 4, others dimmed to 0.3 opacity when one is chosen, legend rows 44 px | a ring thin enough to read as a ring, a gap wide enough to read as a gap, rows that are a touch target | `share-chart.tsx`; at most 5 named slices + Other by `MAX_NAMED_SLICES`, tested |
| Bento grid | 16 px gap, rows `minmax(8rem, auto)`, 2 columns from `md` (768 px), 4 from `xl` (1280 px), tile padding 20 px | the shortest tile (eyebrow, one figure, one note line, two paddings) measures about 128 px; two columns is the narrowest a hero can span | `ui/bento.tsx` |
| Pinned column edge | 12 px (`w-3`) gradient from `scrim` at 5% | shows where the pin ends without a border and a shadow on the same edge (`ui.md`) | `data-table.tsx` |

**Palette audit: an owner decision, not changed here.** The dataviz validator was
run on the brand chart palette (`brand.ts`, `chart`) in both themes. It fails, on
reference surfaces `#fcfcfb` and `#1a1a19` (close to, not the same as, this repo's
`#ffffff` and `#171516`, so read the figures as indicative):

| Check | Light | Dark |
|---|---|---|
| Lightness band | pass | fail: five of six slots outside L 0.43 to 0.77 |
| Chroma floor | fail: four slots read as gray (`#0e8294`, `#4a6fa5`, `#8a5a44`, `#5f7a4f`) | fail: three slots (`#7c9bd0`, `#c08f77`, `#8fb07a`) |
| Colour-blind separation of neighbours | fail: `#5f7a4f` against `#8a5a44`, ΔE 2.9 (deutan) | fail: `#8fb07a` against `#c08f77`, ΔE 2.4 (deutan) |
| Normal-vision floor (hard gate, 15) | fail: same pair, ΔE 10.5 | fail: same pair, ΔE 10.9 |
| Contrast against the surface | pass | pass |

Swapping the last two slots (`[0, 1, 2, 3, 5, 4]`: teal, gold, blue, brown, purple,
green) clears colour-blind separation and the normal-vision floor in light (worst
neighbours ΔE 14.5 and 15.3) and the colour-blind check in dark, but dark still
sits at ΔE 14.6 against a floor of 15, and the chroma and dark lightness-band
failures remain. So the reorder is an improvement and not a fix.

The brand palette is a brand decision, so it was not touched. What it means for
what was built: `PeriodComparisonChart` uses only slot 0 and a gray, so it is not
affected. `ShareChart` can use up to six slots and relies on the secondary
encoding the validator accepts for the colour-blind check (a gap between slices,
a legend with the value and share beside every swatch, the centre readout), but
the normal-vision floor is "hard to tell apart even with full colour vision" and
secondary encoding does not excuse it. Three options for the owner: (a) reorder as
above, cheap and partial; (b) re-derive the six hues against the validator, which
changes the brand's look; (c) leave it, with the legend carrying identity as it
does today.

**Failure modes.** `ShareChart` given rows that are all zero shows the empty state
rather than a ring with no arc. `PeriodComparisonChart` cannot hide its last visible
series, because an empty chart is not a filter result. A previous value of zero is
worded "New", never an infinite percentage. Recharts' own animation honours
`prefers-reduced-motion` through `usePrefersReducedMotion`.

**Not adopted, and why.**
- The 3D, tilted donut, for the reason above, and a donut past six segments.
- A drag-and-drop column reorder library: see above.
- The images' blues, purples, gradients and glows, and their rounder corners: Law 1
  and the house shape.
- A "dark data grid" as a separate component: the grid is the same `DataTable`, and
  the theme makes it dark.
- Percentage numbers for "focus" on the journey funnel: the image's figures had no
  source, so the specimen shows tier position (1 of 5 to 5 of 5) and the layers
  present instead of an invented measure.

**Noticed, not changed.** The older charts (`comparison-chart.tsx`,
`category-bar-chart.tsx`, `time-series-chart.tsx`, `sparkline-chart.tsx`) wrap
their table twin inside a `role="img"` figure, which makes the table presentational
for assistive technology (an image's children are presentational). The new chart and
the upgraded donut put `role="img"` on the graphic only and the table beside it.
The older ones are left for a pass of their own.

**Verification.** `pnpm lint` passes (contrast, links, rules, boundaries, chart
imports), web typecheck passes, web unit tests pass (42, 19 of them new), and the
gallery was rendered at 280, 380, 640, 768, 1024, 1280 and 1536 px in both themes.

**Scope lenses.**
The actor with three tables, the principal with no permission key, the grant that
ends itself: n/a, no actor is introduced; the specimens hold fixed demonstration
rows and the components render rows their caller already scoped.
Whose rows, and which columns: `data-concepts.tsx` and `layout-loading.tsx` hold
fixed demo rows; a real list passes the rows its endpoint already scoped.
Request or record: writes no row. The column manager's "Save view" moves local
state only. Saved column views per user need a table and an endpoint, which is its
own work order and is not stubbed here.
The movement with no address, the unwritten posting rule, every column or none,
the period that already moved, the second legal entity: n/a, no stock, cash or
journal fact is read or written.
The absent collaborator: every new piece degrades by props, not by module; a chart
with no rows renders `EmptyState`.
The second copy of the write: n/a, nothing is written.
The hundred-thousandth row: n/a, no query; `DataTable` stays a renderer, and its
pagination is the caller's.
The reversal document, the undo fan-out, the version stamp, the erasure the ledger
cannot obey, the failure path: n/a, nothing is written; the routing specimen's undo
row says a cancelled order reverses with its own document, as the real thing must.
Reachable: `/admin/design-system#layout`, `#data` and `#flows`, each with a link in
the page's section nav.

### Addendum — 2026-10-01 (third): eight chart forms, small multiples and a scoped profile board

**Requirement.** The owner shared a ten-widget dashboard reference, two mobile
"Sales Performance Comparison" screens (one chart per office on a shared scale, and
the same data overlaid) and a "Corporate Profile" board whose tiles each carry a
Read and a Write scope. With them came a mapping of eight chart forms to the shape
of data each is for, and the instruction "add all these too". The mapping is the
requirement: a chart is chosen by what the data is, not by what looks richest. The
reference's colours, gradients and glows were not copied (Law 1).

**What was built.** Every chart is in `components/admin/charts/`, the one folder
`check-chart-imports.mjs` lets Recharts into, and exported from its `index.ts`.

| Form | Component | Data shape it is for | Built on |
|---|---|---|---|
| Flow / funnel | `FunnelChart` | ordered stages, each a subset of the one before | plain SVG polygons in a 100-unit viewBox |
| Point-marked line | `PointLineChart` | one volatile series where each reading matters | Recharts line |
| Range / candlestick | `RangeChart` | lowest, average and highest per period | Recharts bar of `[min, max]` plus a ringed dot |
| Smooth multi-line, projected against actual | the existing `TimeSeriesChart` with two series | two to four series on one scale | unchanged; it needed nothing new |
| Radial gauge, concentric arcs | `GaugeChart` | one value against a fixed goal or limit | plain SVG arcs |
| Stacked area | `StackedAreaChart` | a total over time and its parts | Recharts stacked area |
| Calendar heatmap | `CalendarHeatmap` | one count per day | plain SVG grid |
| Radar | `RadarChart` | five to seven measures on one scale | Recharts radar, and grouped bars as its second view |
| Small multiples and overlay (the mobile screens) | `SmallMultiplesChart` | the same measure for two to five things | Recharts area and line |
| Scoped corporate profile board | `design-system/scoped-bento.tsx` | tiles with their own read and write scope | `Bento`, `BentoTile`, `Badge`, `Button` |

Shared by them: `chart-math.ts` (funnel steps, gauge state, heat calendar and
quartile cuts, month totals, `niceCeil`; the spec is 55 cases and the web package
now runs 78 tests, 36 of them added here), `chart-series.tsx` (`useSeriesVisibility`,
`SeriesToggles` and `ViewSwitch`, so the legend-is-the-filter rule is written once),
`chart-legend.tsx` (`ChartLegendRow`, also now used by the donut), and a `WARNING`
token in `chart-theme.ts`. `packages/shared` gained `formatMonthShort` and
`formatWeekdayShort` (3 tests) so no chart calls `toLocaleString` or `Intl` itself.
The gallery has a new section, `/admin/design-system#charts`, which opens with the
rule as a table (form, data shape, use it for, not for), then every form in both
themes. The scoped board is in `#layout`.

**Why no Chart.js, ApexCharts or Vue.** The reference text assumed Vue 3. This is
Next 15 and React 19 with Recharts already installed, and `dependencies.md` asks
what a package does that the platform cannot. Recharts has no funnel, gauge or
calendar form that meets the marks spec, so those three are plain SVG with no
dependency, and the rest use the library already here. No package was added.

**Improved, not copied.**
- **The radar has a second view.** Area and angle are the two encodings people
  judge worst, so "Shape" shows which axis is weak and "Compare" shows the same data
  as grouped bars on the same 0-to-max scale. Outside five to seven axes the radar is
  the wrong form and only the bars are offered.
- **The funnel's text sits beside its shapes, not inside them.** Text on a mark has
  to clear that mark's contrast in both themes, and a small last stage has no room.
  The stage that lost the most is named in words with an icon in the table, never by
  colour.
- **The gauge says which way is good.** `progress` means full is the goal ("Goal
  met"); `capacity` means full is a limit ("Filling up", then "Almost full"). A
  limit's state is a badge with an icon and words, in the legend and the table,
  and only then also the ring's amber or red. A value past its maximum keeps its true
  percentage (107% reads 107%).
- **The heatmap's steps are quartiles of the days that had activity**, not equal
  slices of the maximum, so one outlier day cannot flatten every other day into the
  palest step. A day with none is the neutral track.
- **Small multiples share one scale, and say so.** Side by side prints the same
  ceiling on every panel's axis and states it above them. Overlaid is the view for
  "where did they cross".
- **The profile board explains absence.** A tile the viewer cannot read is left out
  and the row closes over it (a neighbour widens to take its width); a tile they can
  read but not change keeps a disabled Edit with the permission written beside it
  (`PRM-2`, `PRM-5`); an "Your access" tile lists every tile and why.

**Parameters.**

| Parameter | Exact value | Why this and not another | Enforced |
|---|---|---|---|
| Gauge geometry | 200-unit viewBox, outer radius 88, sweep 270° opening at the bottom, start 135°; strokes 10 px on a 16 px pitch for one or two rings, 8 px on 13 for three or four; at most 4 rings | a ring that is 270° reads "full" and "empty" at a glance; at 8 px on 13 the innermost ring leaves a centre about 90 px across, room for a figure and a label, and a fifth ring would not | `gauge-chart.tsx`, `MAX_GAUGE_RINGS` |
| Capacity thresholds | warning from 80% of the limit, critical from 95% | 80% is the usual "plan ahead" line and 95% is where one burst can use what is left. They are arguments of `gaugeState` and tested at the edges; the chart does not expose them as props yet, and a measure billed differently adds the prop when it needs it | `chart-math.ts`, `gaugeState` |
| Gauge arc motion | `stroke-dasharray` over 320 ms (`duration-slow`), `ease-standard`; none under reduced motion | it eases a change of value, so the ring never jumps; checked: the computed `transition-property` is `none` with `prefers-reduced-motion: reduce` | `motion-reduce:transition-none` |
| Heatmap cells | 14 px, 3 px gap, 52 weeks by default, Monday first, newest week at the end; steps at the 25th, 50th and 75th percentile of days with activity; level opacities 0.3, 0.55, 0.8, 1 over one hue | 52 weeks is about 910 px (881 px of cells and a 30 px weekday gutter), which fills a wide card and scrolls inside its own box on a phone, starting at the newest week; four tints plus the neutral track, because neighbouring steps already differ by only 1.2:1 to 1.7:1 in contrast (measured in both themes), so a sixth would run into its neighbour | `calendar-heatmap.tsx`, `quantileCuts` |
| Funnel rows | a 44 px shape per stage, 2 px between stages, from `sm` a name column of 4.5 to 7 rem and a figures column of at least 3.5 rem; below `sm` the name and figures sit above the shape | at 280 px the shape would get about 20 px between the two columns, so the columns become a line above it | `funnel-chart.tsx` |
| Point line | 2 px straight segments, 8 px circle markers, 13 px diamond for a reading above the level, 12 px peak label, dashed rule for the level | smoothing would invent values nobody measured; the diamond is the second channel, so "above" is never colour alone | `point-line-chart.tsx` |
| Range capsule | width capped at 14 px, 4 px rounded ends, average dot 8 px with a 2 px ring | thin marks; the ring keeps the dot visible where it sits on the capsule | `range-chart.tsx` |
| Radar | 5 to 7 axes, at most 3 series, outer radius 80% inside 56 px side margins, fill 12%, axis names cut at 8 characters; Compare bars capped at 24 px with a 4 px rounded top and a 2 px gap | on a 280 px card the polygon leaves about 58 px beside it and eight characters at 11 px is about 48 px; the full names are in the table | `radar-chart.tsx`, `MAX_AXIS_NAME` |
| Stacked area | at most 6 layers, a 2 px surface line between layers, layers solid, order fixed with the steadiest part at the bottom | a wash would let layers blend where they overlap the grid; only the bottom layer reads precisely against the baseline | `stacked-area-chart.tsx`, `MAX_STACKED_SERIES` |
| Small multiples | at most 5 things, panel charts 120 px high, overlay 260 px, panels `auto-fit` at a 16 rem minimum with a 16 px gap, one ceiling from `niceCeil` (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 or 10 times a power of ten) printed at 0 and at the ceiling | a shared ceiling is what lets small charts be compared by eye, and it has to be round enough to read as an axis and tight enough not to leave half the plot empty | `small-multiples-chart.tsx`, `niceCeil` (tested) |
| Warning ink | `amber-600`: 3.19:1 on the light surface, 10.89:1 on the dark one | `brand.ts` has no warning feedback colour, so this is the step the Badge `warning` tone already uses; it clears the 3:1 floor for a mark, and it is never a series colour | `chart-theme.ts`, `WARNING` |

**Contrast, stated plainly.** The heatmap's two palest steps fall under the 3:1
floor for a mark: 1.49 and 2.18 on the light surface, 1.64 and 2.74 on the dark one
(its two darkest clear it: 3.25 and 4.53, then 4.43 and 6.28). That is the nature of
a sequential ramp, whose low end is pale, and a contrast warning obliges a visible
label or a table view rather than being dismissed, so: the line under the grid names
the figure for whichever day is pointed at or focused, every cell has an
`aria-label` with its date and count, and the table twin lists each month. Raising
the first step's opacity would help the palest day and shrink its difference from
"nothing". Left for the owner.

**Palette audit: still an owner decision, still not changed.** These charts draw on
the same brand chart palette that failed the validator in the second addendum.
`StackedAreaChart` can use six slots, `SmallMultiplesChart` five and `RadarChart`
three, so the normal-vision and colour-blind findings reach them. What carries
identity besides colour: the legend that is also the filter, the table twin, the
2 px surface line between stacked layers, and in the side-by-side view a name and
total above every panel, which is why it is the default. The overlaid view relies on
its legend and tooltip, and says so. The three options in the second addendum stand.

**Deviations from the usual rules, and why.**
- *Direct labels.* The overlaid view has no end-of-line labels: lines that end close
  together are the reason to overlay, and their labels would sit on top of each
  other. The side-by-side view is the directly labelled one.
- *Rule of three.* Each chart has one consumer, the gallery. They are components
  and not specimens because `charts/` is the only place Recharts may be imported
  and because a chart suite was asked for, not examples; a screen imports one from
  `@/components/admin/charts`. The scoped board is a specimen (one consumer).
- *`TimeSeriesChart`* keeps its older bordered tooltip and inline-styled legend
  for projected against actual; changing a shared chart needs every consumer
  checked, so it is left for its own pass.

**Failure modes.** Every chart renders `EmptyState` for no rows. A funnel needs two
stages (one is "the number is the chart"). A gauge with a limit of zero or less is an
empty ring in the `ok` state, not a division by zero. A heatmap treats a day missing
inside its window as no activity, which is true of a count and false of a gap in the
feed, so the caller passes the real window. Calendar days carry no zone and are
parsed and printed as UTC, so they cannot slide a day. A radar given fewer than five
or more than seven axes offers only bars. The last visible series cannot be
hidden, because an empty chart is not a filter result. A tooltip formatter is never
handed an empty label: Recharts renders the tooltip with one while nothing is pointed
at, and a date formatter throws on it (this crashed the page once, in the first
build of the small-multiples tooltip, and is guarded in `labelOf`).

**Not adopted.** Chart.js, ApexCharts and Vue (above); a 3D or glowing treatment of
any form; the reference's purple and peach palette; a donut past six segments; a
radar as the only view of a profile.

**Noticed, not changed.** The older charts still wrap their table twin inside a
`role="img"` figure (second addendum). Web typechecks `@newax/shared` from its built
`dist/`, so a change to a shared formatter needs `pnpm --filter @newax/shared build`
before the web app sees it.

**Verification.** `pnpm lint` passes (contrast baseline unchanged at 43 light and
39 dark known-below-floor uses, chart imports, rules, links), `pnpm typecheck`
passes, `pnpm test` passes for every package except the API (which needs a
database): web 78 tests, also run under `TZ=Pacific/Auckland` and
`TZ=America/Los_Angeles`, and shared 395. The gallery was built and rendered at
280, 380, 640, 768, 1024, 1280 and 1536 px in both themes with no horizontal
overflow at any of them, and 65 interaction checks were driven against the
production build with Playwright (funnel and table, point line, range, gauge hover,
focus and pin, stacked area restacking and the last-layer rule, heatmap arrow keys
and readout, radar Shape and Compare, small multiples, the board's three viewers
with the rows still filling the width, reduced motion). Those scripts are not in the
repository. `pnpm check:overflow` needs a seeded stack and was not run here.

**Scope lenses.**
The actor with three tables, the principal with no permission key, the grant that
ends itself: n/a, no actor is introduced; the charts render rows their caller already
scoped. The board's "view as" switch is the specimen's own device, and a real screen
has one viewer.
Whose rows, and which columns: the charts hold fixed demonstration figures; a real
screen passes what its endpoint returned for the viewer. The board's scopes use
two real catalogue keys, `organization.view` (STAFF, ADMIN) to read the legal
identifiers and `settings.manage` (ADMIN) to write any tile, typed as
`PermissionKey` so a typo fails the build. No key was added.
The threshold nobody approves alone, the toxic pair, authority and blast radius: n/a
here, nothing is committed or changed. A real company-profile editor is separate
work and is named, not stubbed: a table for the profile, an endpoint, an audit row
carrying the old and new value, and a second signature on the tax and registration
numbers.
Audience is a capability, not an address: n/a, no message is sent.
Request or record, the movement with no address, four hours down: n/a, nothing is
written; the board's Save changes local state only.
The unwritten posting rule, every column or none, the period that already moved,
the second legal entity, dry run before live: n/a, no money fact is read or written.
Click the number: the funnel, gauge, range and heatmap each carry their own table,
and a screen that uses one links each figure to the rows that produced it, which is
the screen's job; no figure here has rows behind it.
Three silhouettes, the absent collaborator, the second copy of the write, the
hundred-thousandth row, the adoption test: n/a, no query, table, number series or
module is touched; a chart with no rows renders `EmptyState`.
The reversal document, the undo fan-out, the version stamp, the erasure the ledger
cannot obey, the failure path: n/a, nothing is written.
Reachable: `/admin/design-system#charts` and `#layout`, each with a link in the
page's section nav, and the rule and the chart list are in `03-components.md` and
`.claude/rules/ui.md`.

### Addendum — 2026-10-01 (fourth): six admin screens, read for what each one teaches

**Requirement.** The owner shared six screens and asked for their design concepts to
be added to the system, or the part already built improved, in this theme and in both
modes: a corporate profile board with a Read and a Write scope per tile, publishing a
profile to a chosen audience, a user list with an access drawer, a department page, a
page where DOM controls sit over a WebGL surface, and one-click invoice dispatch. A
screen is the unit here, not a widget: each one is built as a specimen from the
components that exist, in `/admin/design-system#screens` (and `#depth`, `#flows`,
`#layout`), with the states and refusals a picture of a screen leaves out. The
mockups' colours, fonts and Vue/Quasar-style code were not copied (Law 1, and this is
Next 15 and React 19).

**What was built.**

| Concept (screen) | Where | Built on |
|---|---|---|
| Segmented control (all six) | `ui/segmented.tsx`: `kind="filter"` (`aria-pressed`) or `kind="choice"` (`radiogroup`, arrow keys that skip disabled options) | promoted because it replaced two copies of one markup: `RangePicker` and the chart `ViewSwitch` now delegate to it; the gate, the mode switches and the grant length use it |
| Side sheet (user management drawer) | `Dialog align="end"`: full height against the inline-end edge, `w-full max-w-md` | the existing `Dialog`, so Escape, backdrop, labelled Close, focus trap and scroll lock come with it |
| People and access | `design-system/people-access.tsx`; rules in `access-draft.ts` | `PageHeader`, stacked `DataTable`, `Pagination`, `Dialog`, `ConfirmDialog`, `Segmented`, `ScopeChipEditor` |
| Publish and audience targeting | `publish-audience.tsx`; rules in `audience.ts`; `choice-cards.tsx` extracted from `patterns.tsx` | `Segmented`, `ChoiceCards`, `Switch`, `Button loading`, `ConfirmDialog`, `Skeleton` classes |
| Department page | `department-page.tsx`; rules in `department.ts` | `PageHeader`, `Disclosure`, `DataTable`, `ConfirmDialog`, `Segmented`, `Switch` |
| DOM over a surface (layering) | `layering.tsx`: stage at `z-base`, annotation layer at `z-raised` | `FROSTED`, `Switch`, `DataTable`, the named `layers` tokens |
| One-click dispatch | `dispatch-flow.tsx`; the moves between states in `dispatch-machine.ts` | `Badge`, `Button`, `Segmented`, `Disclosure` |
| Corporate profile board, improved | `scoped-bento.tsx`: an identity lead (logo, or a monogram when there is none, with an Active badge), an address tile with an honest "No map preview" slot, and a closed "Grid map" disclosure | `Bento`, `BentoTile`, `Disclosure`, `next/image` on `BRAND.assets.logoRaster` |
| A nested page's heading | `PageHeader headingLevel` (`h1` to `h4`, `h1` by default) | so a screen shown inside the gallery does not add a second `h1` |

Four pure modules carry every rule a screen enforces, so the rule can be tested
without a browser and a real screen imports it unchanged: `access-draft.ts` (24
tests), `audience.ts` (15), `department.ts` (24), `dispatch-machine.ts` (19). That is
82 new tests; the web package runs 160. `ScopeChipEditor` has one consumer (the
access sheet) and `ChoiceCards` two (the older patterns page and publishing), so
neither is in `ui/`: the third consumer promotes it (`design.md`, the rule of three).
No dependency was added.

**Improved, not copied.**
- **Access cannot be made to last forever.** "Temporary access" cannot be switched
  on without an end, which is what the schema already says (`OrgUnitGrant.expiresAt`
  is `DateTime`, not nullable). It needs a reason that goes to the audit log, and an
  acting grant needs a countersigner who outranks the recipient. Refusals use the
  server's own sentences (`org-unit-grant.service.ts`: "A grant cannot run longer than
  N days from now." and "An ACTING grant needs a countersignature from someone who
  outranks the recipient.") so the screen and the API cannot disagree. The 30-day
  preset is shown disabled with the limit written beside it, not hidden (`PRM-2`).
- **You cannot edit your own access.** Your row opens with every control disabled and
  the reason written (a person who can grant and use the same access is the toxic
  pair). A person with no branch has no branch, never every branch.
- **A dirty sheet asks before it closes**, by Escape, backdrop or Cancel, with
  "Keep editing" as the first choice. A change is shown as what it adds and what it
  removes ("+ Karachi", "− Lahore") before Save, not as a list of field names.
- **Audience only exists for Public.** An unlisted link with an audience is a
  contradiction, so choosing Unlisted or Internal closes the audience steps (`PRM-5`).
  Going Public asks first and names how many partner accounts can find it, and says
  what unpublishing cannot do: a search engine's copy can take days to clear.
- **The count is advice, not a gate.** It recounts after a pause and shows
  "Counting" immediately. When it fails the screen says so and Publish stays
  available; when the filters match nobody Publish is refused with the reason and the
  fix. Zero is reachable on purpose (`Site audited` is a 1% share).
- **A department's head is a post, not a column.** `OrgUnit` has no head-user and no
  cost-centre column, so the page shows the head as the holder of a post with a link
  to People, and "works in" as the nearest office up the tree, so it cannot disagree
  with the org chart. A closed unit cannot be a parent, and closing lists every
  blocker (open units, positions) with the screen that fixes each, in the server's
  words. "Active" is a badge that follows from the state, not a toggle.
- **The overlay is glass.** The wrapper is `pointer-events-none` and each control on
  it opts back in with `pointer-events-auto`, so empty overlay passes a click to the
  stage and a button on it is still a button. Focus follows source order, not z-order,
  and the stage works by keyboard on its own.
- **The send says only what it knows.** The badge goes Draft, Sending, Sent or
  Failed, never "Dispatched" or "Delivered", because nothing here can know a
  partner's inbox has it. Send answers in the same frame and becomes Undo for a
  window in which nothing has left. A bounce offers Correct the email and no Retry
  (it would bounce again); an outage offers Retry, which carries the same
  idempotency key so a half-worked first attempt cannot become two emails.
- **The profile board stays honest about what it has.** A drawn map thumbnail would be
  a picture of data the profile does not hold, so the address tile carries a slot that
  says "No map preview". The mockup's grid mapping is a closed disclosure showing, for
  the viewer, how many of the four blocks they read and write, and what was left out.

**Parameters.**

| Parameter | Exact value | Why this and not another | Enforced |
|---|---|---|---|
| Undo window | 5 000 ms | long enough to read the partner's name on the confirmation line and catch a wrong one, short enough that a waiting customer is not made to wait. The design for the real send is the outbox row's own delay: write it with `OutboxEvent.availableAt` that far ahead (`outbox.dispatcher.ts` already selects only rows with `"availableAt" <= NOW()`), so Undo cancels a row nothing has picked up and closing the tab inside the window does not cancel the send. Nothing here writes that row | `dispatch-machine.ts`, `UNDO_WINDOW_MS`, pinned by its spec |
| Undo clock | ticks every 250 ms, 5 pips (one per second), the counter rounds up | a quarter second keeps the pips from visibly lagging a click, and rounding up means the label never reads 0 s while Undo still works | `dispatch-flow.tsx`, `TICK_MS`, `PIPS` |
| Mail-service answer, specimen only | 1 400 ms | stands in for real latency so the Sending state is visible; the real wait is whatever the mail service takes | `dispatch-flow.tsx`, `HANDOFF_MS` |
| Audience count pause | 400 ms after the last change | one slider drag crosses many 10 km steps and should cost one count, and under half a second still feels live | `publish-audience.tsx`, `COUNT_DELAY_MS` |
| Publish, specimen only | 700 ms | makes the busy button visible; the real wait is the request | `publish-audience.tsx`, `PUBLISH_DELAY_MS` |
| Audience pool and radius | 4 800 partner accounts, 10 to 500 km in steps of 10, 150 km to start | illustrative figures; 500 km spans the whole network of a country-sized deployment and 10 km is the smallest meaningful catchment | `audience.ts` |
| Longest temporary grant | 14 days in the specimen; the real limit is a setting (`getOrgAccessMaxGrantDays`) | the screen's text says "set in Settings" because it is; 14 is only the specimen's stand-in | `access-draft.ts`, `MAX_GRANT_DAYS`, pinned by its spec |
| Grant length presets | 1 day, 1 week, 30 days, 1 week to start | the three lengths people actually mean; the third is disabled past the maximum so the limit is visible | `access-draft.ts`, `GRANT_PRESETS` |
| Access that ends soon | warning tone under 1 hour | the existing "Access that ends" pattern turns to warning at the same line | `access-draft.ts`, `endsSoon` |
| List page size, specimen | 4 rows over 12 people | small enough that pagination shows; a real list sizes this to its own endpoint | `people-access.tsx`, `PAGE_SIZE` |
| Sheet width | 448 px (`max-w-md`), full width below that | three short sections fit without sideways scroll at 280 px, and above that the list stays visible beside it | `dialog.tsx`, `align="end"` |
| Sheet motion | `slideInRight`, 320 ms (`duration-slow`), an 8 px travel, none under reduced motion | it says where the sheet came from; measured under `prefers-reduced-motion: reduce` the computed animation duration is 0.00001 s | the shared reduced-motion rule |
| Stacking | stage `z-base` (0), overlay `z-raised` (1), nothing above `z-raised-3`; the stage is wrapped in `isolate` | a stack that needs a fourth step has a structure problem, and `isolate` stops it leaking above the sticky header or below a modal | `brand.ts` `layers`; `layering.tsx` |
| Touch targets | Close, chip remove and the radio presets are 44 px below `fold` | a finger is the pointer there (`design.md`) | `min-h-11` and `h-11 w-11` with `fold:` overrides |

**Failure modes.**
- *A second copy of an event.* A double click on Send, a late timer, and a late
  delivery in the wrong state are no-ops: `dispatchReducer` returns the same state
  object for any move the state does not accept (19 tests, including that `sent` is
  final).
- *The count fails.* A warning in place of the figure, Publish still available.
- *Publishing while counting.* The button is disabled with the reason beside it, never
  hidden.
- *Focus lost to a button that is gone.* Found by driving the sheet with a keyboard:
  after Revoke the confirmation handed focus back to a button that no longer existed,
  so Escape stopped working because focus was on the page behind the sheet. The sheet
  now moves focus to the grant checkbox when a live grant ends. The chip editor does
  the same for its select after a removal, including when the select did not exist
  until that removal made room for it.
- *The same sentence twice.* The footer already announces why Save is off, so the
  inline refusal beside the field is not a second live region.
- *Nothing to send to.* An empty or malformed email disables Send and says the form
  to use. Failure copy always says what happened, why and the one next step, and the
  next step is never "try again later".

**Not adopted.** Vue, Pinia, Quasar and a ticker or timer library (this is React with
a reducer); Three.js or any WebGL (the transferable idea is the pass-through rule); the
mockups' colours, fonts and shadows; a drawn map thumbnail; a cost-centre lookup and
a head-user column (neither exists on `OrgUnit`); an Active toggle on a department; any
"Dispatched" or "Delivered" claim; literal z-index numbers.

**Noticed, not changed.**
- `brand.ts` has no distance unit, so the specimen holds `DISTANCE_UNIT = 'km'` itself.
  A deployment that uses miles needs a place for it, which is a token decision.
- `slideInRight` is a physical `translateX(8px)`. In a right-to-left locale the sheet
  sits against the left edge and still travels from the right by 8 px. It is harmless
  and physical, so it belongs in a logical-direction pass with the other keyframes.
- `Dialog` handles Escape on its own panel, so when focus is lost to the page behind a
  modal Escape does nothing. The sheet was fixed locally; a document-level listener in
  `Dialog` would change every consumer and is left for its own pass.
- `Pagination` was written for server pages and at 280 px wraps its centre text to two
  lines; no text is lost, so it was left alone.
- The profile board's "Your access" tile has spare room under its rows when it sits
  beside the taller address tile.
- There is no send-invoice endpoint. `admin/invoices` creates and reads under
  `orders.manage`. A real one is its own work order (a route the server checks, a
  decision whether `orders.manage` is enough or a key of its own, and an outbox
  handler that sends the mail), named here and not stubbed.

**Verification.** `pnpm lint` passes (contrast baseline unchanged at 43 light and 39
dark known-below-floor uses, module boundaries, chart imports, rebrand, links, rules),
`pnpm typecheck` passes, and `pnpm test` passes for every package except the API (which
needs a database): web 160 tests (78 before, 82 added). The four counts in `CLAUDE.md`
hold: inline `style={{` 26, `toLocaleString` 6, bare fetch 6, gray palette 0. The
gallery was built for production and driven with Playwright: 95 interaction checks
passed with no console error (sheet open and close three ways, focus return, discard
guard, branch chips and focus, the disabled preset and arrow keys skipping it, acting
refusals and countersigners, revoke through a second dialog, the count pause and its
failure, the Public confirmation, live versus draft, the staff view, department
validation, the code suggestion, the closed-parent option, close blockers and the empty
path, `elementFromPoint` pass-through, the layer outline, undo, success, bounce,
outage with the same key, the board's viewers, and reduced motion). A sweep of 7
widths (280, 380, 640, 768, 1024, 1280, 1536) in both themes found no horizontal
overflow and no clipped text in the four sections, with the sheet and its confirmation
open at each width (14 of 14 combinations). Those scripts are not in the repository.
`pnpm check:overflow` needs a seeded stack and was not run here. Two things the
screenshots caught that no command would have: the layers table clipped its last
column inside a narrow column (it now spans the width), and the outline tag covered the
"12 zones" label.

**Scope lenses.**
The actor with three tables: no new actor. The person is a `User` and a countersigner
is a `User`; a partner in the audience is a `TradingPartner`. The specimens hold
illustrative people and counts, not rows of either.
The principal with no permission key: every control is checked server-side against a
real key, shown disabled with its name in the reason (`PRM-2`): `users.manage` to open
the list, `org.access.grant` for temporary access, `org.structure.view` and
`org.structure.manage` for the department page, `settings.manage` to publish. All five
are in the catalogue (`docs/index/cross/permissions.md`) and ADMIN holds each; none was
added, so there is no `Permission` row without a grant.
The grant that ends itself: `OrgUnitGrant.expiresAt` is not nullable and the sheet
cannot issue a grant without it, with `endsSoon` warning under an hour. What deactivating
a user does to a live grant is not touched here.
Whose rows, and which columns: the list shows the branches a person can reach and the
board shows a viewer only the tiles they can read (`Grid map`); a real list passes what
its endpoint returned for the viewer.
The threshold nobody approves alone, the toxic pair: an acting grant needs a
countersigner who outranks the recipient (`countersignCandidates`), and your own access
cannot be changed by you (`saveBlocker`). The server enforces both, and the screen
shows its words.
Authority and blast radius: the longest grant is a setting, and the audit row carrying
the old and new value is the real screen's job, named in the sheet's reason field.
Audience is a capability, not an address: the invoice is sent to the partner's billing
email, a field of the invoice screen, not a literal; no announcement is sent from here.
Request or record: every write here is a REQUEST the system may refuse (grant, publish,
create, close, send), and each shows its refusal. None is a RECORD of something that
already happened; a delivery receipt would be one, and nothing here writes it.
The movement with no address, four hours down, the money lenses (posting rule,
columns, period, second legal entity, dry run): n/a, no stock, cash or journal line is
read or written; the invoice screen sends mail and posts nothing, because issuing is
the separate `invoice.issued` event.
Click the number: the audience count links to the list that produced it in a real
screen; the specimen's link goes to the section because no list exists.
The three silhouettes, the absent collaborator: a Solo deployment sees the same
screens with one branch; a pack that adds departments or trading partners is absent
without breaking the list, because each link is a `ROUTES` entry and not an import.
The second copy of the write: the idempotency key `invoice-id:send:intent`, with the
column and unique constraint belonging to the real endpoint.
The hundred-thousandth row: n/a, no query is made; a real people list pages on the
server through `Pagination` and its endpoint's own limit.
The adoption test: no number or code is generated here except the department code,
which is suggested from the name and checked against taken codes before Save.
The reversal document, the undo fan-out: Undo cancels an outbox row that has not been
picked up; after the window the send is irreversible and the screen says "Sending",
never "Delivered". Revoking a grant ends it now and says what it cannot undo.
The version stamp, the erasure the ledger cannot obey: n/a, no record is created.
The failure path: a bounce lands in Failed with its reason and a Correct action; an
outage lands in Failed with Retry; the real screen adds the outbox row's failed state
and the permission that opens it.
Reachable: `/admin/design-system#screens`, `#depth`, `#flows` and `#layout`, each with
a link in the page's section nav, and the new rows are in `03-components.md` and
`.claude/rules/ui.md`.

### Addendum — 2026-10-01 (fifth): the motion of a reference reel, as one language across every surface

**Requirement.** The owner supplied a short reel and asked for its motion graphics,
for buttons, cards, text fields and everything else, to be extracted and
implemented in all cards, buttons, boxes, popups, notifications, errors and
containers, on every page and sub-page of the design system. The reel was read frame
by frame (fourteen motions) for what each one tells the reader, not for how it looks;
its palette, type, hexagon and particles were not copied, and its entrances (about
600 ms) are a film, not a component. The result is two tiers: a **functional**
vocabulary on by default through the shared classes and primitives, and an
**expressive** tier that is opt-in and bounded. The long form, with the reel-to-meaning
table, is `docs/design/motion/05-motion.md`.

**What was built.**

| Concept | Where | Built on |
|---|---|---|
| Press and release | `.btn`, `.chip`, `.icon-btn`, `Segmented`, `.lift` (which returns to rest) in `globals.css` | tokens only; one rule per class because `@apply btn` rewrites `.btn` selectors one rule at a time |
| Arrive and leave | `animate-arrive` / `animate-leave` on cards, dialogs, popovers, notices (`role="alert"` or `"status"`) and toasts | the keyframes in `globals.css`, the animations in `tailwind.config.ts` |
| Error nudge | `.field-input`, `.field-flat`, `.field-inline` with `aria-invalid="true"`; `.notice-error[role="alert"]` after it has arrived | the attribute is the contract, so a screen reader hears it too |
| Focus ease | the focus ring on fields now eases with the border, on one curve | `box-shadow` added to the field's transition list |
| Loading ring | `.spinner`, `Button loading`, `Loading` | one revolution is two `sweep` steps |
| Page enter | `ui/page-enter.tsx` in the admin and storefront layouts | keyed on the pathname, not the segment, so a filter in the URL does not replay it |
| Stagger and reveal on scroll | `.stagger`, `ui/reveal-scope.tsx`, `lib/reveal.ts`; `Bento` is a scope | one `IntersectionObserver` per scope, never per tile |
| Tab glide | `Tabs`: one `.tab-indicator` that glides to the selected tab (`Segmented` gets the press and the eased fill, not the glide) | transform only (`translate` and `scaleX` of a one-pixel bar) |
| Side sheet | `Dialog align="end"`, the storefront mobile nav and filter panel | `.sheet-in` / `.sheet-out`, direction flips in a right-to-left document |
| Toast with a draining line | `toast-stack.tsx`, `hooks/use-toast.ts` | a `.toast-timer` line of `scaleX`, and an exit before removal |
| Count-up, progress ring | `ui/count-up.tsx`, `ui/progress-ring.tsx`; `CountUp` on the four P&L figures, `ProgressRing` on the dispatch specimen's undo window | pure maths in `lib/motion.ts` (`countUpValue`, `ringStroke`) |
| Lock-on brackets | `.focus-frame` in `globals.css`; used on the choice cards in the flow specimens | one pseudo-element carrying eight gradient bars |
| Scramble decode, typewriter | `ui/text-motion.tsx`: `ScrambleText` on the order number of a just-placed order; `TypeText` is built and specimen-only, with no product consumer yet | `scrambleFrame`, `typedFrame` in `lib/motion.ts` |
| Chart draw-on | the three chart files in `components/admin/charts` | now read `usePrefersReducedMotion`, which the old chart-local hook became a shim for |

A new gallery section, `/admin/design-system#motion` (`design-system/motion-specimens.tsx`),
shows every row above live, with the reel's name for it beside ours. The maths
lives in `lib/motion.ts` as pure functions, so it can be tested without a browser:
`lib/motion.spec.ts` has 21 tests. No dependency was added.

**Improved, not copied.**
- **No blur.** The reel's zoom-blur was measured and left out: a blur filter forces a
  paint of the whole element every frame, and a blurred label is below the contrast
  floor for the frames it is blurred (`MOT-5`, `COL-3`). The `blur` token group that
  was added to carry it was removed once it had no consumer.
- **Nothing overshoots.** The reel's curve is a strong ease-out, which became
  `settle`; `emphasized` (y2 = 1.2) overshoots and no business control uses it.
- **Siblings are not dimmed.** The reel dims everything but the focused element;
  dimming a neighbour's text drops it under the contrast floor in both themes.
- **Reduced motion is three layers, not one.** The stylesheet rule now also reaches
  pseudo-elements and zeroes delays (a staggered entrance keeps `both` fill, so a
  surviving 320 ms delay would hold the element at opacity 0: it would be missing, not
  jumping); JavaScript-driven motion (charts, `CountUp`, scramble, type, reveal,
  toast and dialog exit waits, and the storefront's Lenis scroller) asks
  `usePrefersReducedMotion` first; and information is carried twice (an `sr-only`
  copy, `role="progressbar"`, `aria-invalid`, the words "Working…" and "Loading…").
- **Every exit is the entrance's twin.** A dialog, toast and sheet used to vanish; each
  now plays `leave` for exactly `fast` and is removed after, through
  `useExitTransition`. Under reduced motion the hook returns `leaving: false` and the
  node unmounts at once, which also fixed a race found while testing.
- **Settled state first.** Server markup is always the visible one. `[data-reveal]`
  hides an element only after the script has run, and `@media print` shows every
  element, so a printed page has no holes.

**Parameters.**

| Parameter | Exact value | Why this and not another | Enforced |
|---|---|---|---|
| `settle` easing | `cubic-bezier(0.16, 1, 0.3, 1)` | measured off the reel: 60% of the distance by 100 ms and within 1 px of rest by 600 ms; never overshoots (a test samples 100 points) | `brand.ts` `motion.easing.settle`; `lib/motion.spec.ts` |
| Press | `translateY(2px)` and `scale(0.98)`; down in 80 ms (`instant`), back in 140 ms (`fast`) | the click is acknowledged inside one frame (`ACT-3`); 98% of a 44 px button is under 1 px, enough to feel and too small to move the text | `globals.css` `.btn:active`, `.chip`, `.icon-btn` |
| Card press | back to rest, no scale | 2% of a 400 px card is 8 px, so a card's press is its lift reversing | `.lift:active` |
| Arrive | 220 ms (`normal`), 8 px (`distance.small`), `scale` 0.97 to 1, `backwards` fill | long enough to see, short enough that a toast is readable at once; `backwards` so the final frame has no transform (a transform on a wrapper breaks `position: fixed` descendants while it runs) | `@keyframes arrive`; `scale.arrive` |
| Leave | 140 ms (`fast`), `exit` easing, to `scale` 0.97, `forwards` fill | an exit is quicker than its entrance; it is how long the node stays mounted | `@keyframes leave`; `MOTION_MS.exit` |
| Nudge | 4 px (`distance.nudge`), 320 ms (`slow`), once, 0, -4, +4, -2, +1, 0 | big enough to read as "no", ends where it began so it cannot leave the field offset | `@keyframes nudge` |
| Stagger | 80 ms per step, capped at 4 steps (320 ms, never more than `slow`) | a list of 200 rows must not animate; a test pins the total at or under `slow` | `brand.ts` `motion.stagger`; `staggerDelayMs` |
| Side sheet | 64 px (`distance.large`) and a fade, 320 ms in, 140 ms out | reads as coming from the edge without crossing the viewport; replaces the 8 px `slideInRight` | `.sheet-in`, `.sheet-out` |
| Loading ring | 840 ms per turn (2 x `sweep`) | slower than 600 ms reads as a ring, faster as a flicker | `.spinner` |
| Toast | 4 000 ms default (unchanged), exit 140 ms, timer line 2 px, `duration: 0` has no line | the default is the old one; the line counts down data, so its duration is the one inline `style` this work adds | `use-toast.ts`; `.toast-timer`; `toast-stack.tsx` |
| Tab glide | 220 ms (`normal`), `settle` | one element moving reads as "the selection moved" | `.tab-indicator` |
| Count-up | 420 ms (`sweep`) | a page-level figure resolving takes the longest step; capped at `sweep` so a dashboard is never the thing the user waits for | `MOTION_MS.count`; `countUpValue` |
| Scramble decode | 320 ms, noise every 40 ms, 80 characters at most | a label is short; 25 changes a second is a shimmer, not a strobe; longer text just appears | `text-motion.tsx` (`NOISE_TICK_MS`, `MAX_ANIMATED_CHARS`) |
| Typewriter | 320 ms in total, 80 characters at most | the total is fixed, not per character, so a long line is not slow | `text-motion.tsx` |
| Progress ring draw-on | 320 ms | a ring is small; `sweep` would outlast the figure inside it | `progress-ring.tsx` |
| Reveal on scroll | `rootMargin: 0px 0px -8% 0px`, `threshold: 0.01` | a tile arrives just before the reader reaches it, and one pixel counts as seen | `lib/reveal.ts` |
| Lock-on brackets | arms 14 px, bars 2 px, 4 px outside the box, `scale` 1.06 to 1 | an arm of 14 px is visible on a 44 px control and never longer than the box's own edge | `.focus-frame` |

**Failure modes.**
- *Scripting off or slow.* Server markup is the settled state; nothing is hidden until
  the script has run, so the page is complete without it.
- *Reduced motion.* Every duration collapses to a frame and every delay to zero, JS
  motion is skipped, and each piece of information the motion carried is also stated
  in words or an attribute.
- *A transform on a wrapper.* It re-parents `position: fixed` children while it runs,
  which is why arrivals use `backwards` fill and the page-enter wrapper has no
  `forwards` fill.
- *An exit that never finishes.* Removal is a timer for `fast`, not an
  `animationend` listener, so a node cannot be left mounted by an event that did not
  fire.
- *A tab strip that has not measured.* The indicator stays hidden and the selected
  tab keeps its own underline, so the strip is right before and without scripting.
- *Right-to-left.* The sheet direction, the toast line and the lock-on use logical
  properties or a sign variable; the tab indicator is physical because it is measured
  from `offsetLeft`, and says so in its comment.

**Not adopted.** Zoom-blur, floating particles and ambient arcs (`Law 6`), the hexagon
with a leader line, dimmed siblings, the reel's 600 ms durations, a scroll-hijacking
library for page changes, WebGL, springs on a business control, and any bounce.

**Noticed, not changed.**
- Dead CSS in `globals.css` and `tailwind.config.ts` (`chart-line` / `drawLine`,
  `shimmer`, an unused `250` duration); deleting it needs the owner's confirmation.
- `emphasized` still overshoots and has no consumer; `distance.medium`, the `spring`
  group and the `framer-motion` dependency have none either.
- `components/admin/charts/use-reduced-motion.ts` is now a one-line shim over
  `hooks/use-prefers-reduced-motion.ts`; removing it is a deletion.
- `components/common/toast-container.tsx` has no consumer.
- The storefront's `SmoothScroller` hijacks the wheel with Lenis. It now stays off
  under reduced motion, but whether it should exist is the owner's decision.
- The admin drawer uses a physical `left-0` and the comment at the top of
  `tailwind.config.ts` still says the POS has its own copy; neither was touched.
- Mobile (`apps/mobile`, reanimated) and the POS do not use these tokens yet.
- ADR-083's fourth addendum rows "Sheet motion" (an 8 px `slideInRight`) and "Undo
  clock" (5 pips) are superseded: the sheet now travels 64 px (`.sheet-in`), and the
  dispatch specimen's pips became a `ProgressRing` while the 250 ms tick and the 5 000 ms
  window are unchanged.

**Verification.** Rebuilt for production and driven with Playwright against
`/admin/design-system`: 69 motion checks passed (press and release by computed
transform, arrive and leave timing, the nudge replaying on a false-to-true change, the
focus ease, the toast line draining over its own duration, the tab indicator gliding,
count-up landing exactly on its target, scramble ending on the real text, the type
total, the ring, reveal on scroll, page enter, `useExitTransition` under both
preferences, no property other than transform and opacity animated, and reduced
motion at zero duration with no element left hidden), and the earlier 95 screen
checks still passed, with no console error. A sweep of 7 widths (280, 380, 640, 768,
1024, 1280, 1536) in both themes found no horizontal overflow and no clipped text
(14 of 14 combinations). Those scripts are not in the repository. The storefront
drawers, the P&L page and the order page need a running API, so they were checked by
typecheck, lint and the production build only, not in a browser. `pnpm check:overflow`
needs a seeded stack and was not run. The four counts in `CLAUDE.md`: inline
`style={{` 27 (26 before, plus the toast timer's data-driven duration), `toLocaleString`
6, bare fetch 6, gray palette 0. The command results for this change are in the
reply that delivered it.

**Scope lenses.**
The actor with three tables, the principal with no permission key, the grant that
ends itself: n/a, no actor, principal or grant is created; motion changes no
authority.
Whose rows, and which columns, the threshold nobody approves alone, the toxic pair,
authority and blast radius, audience: n/a, nothing is read, committed or sent; no
`PERMISSION_CATALOG` key was added, so there is no `Permission` row without a grant.
Request or record: the toast's `leaving` and every reveal are presentation state, not
writes; nothing here is a REQUEST or a RECORD of a business fact.
The movement with no address, four hours down, and the money lenses (posting rule,
columns, period, second legal entity, dry run, click the number): n/a, no stock, cash
or journal line is read or written.
The three silhouettes and the absent collaborator: a Solo deployment gets the same
motion; a deployment with no admin module simply never renders `PageEnter` there, and
the tokens live in `brand.ts`, which every surface imports.
The second copy of the write, the hundred-thousandth row: a list of any length
animates at most four stagger steps (`staggerDelayMs`), and one observer serves a whole
scope, so a 100 000-row table is not 100 000 animations.
The adoption test, the reversal document, the undo fan-out, the version stamp, the
erasure the ledger cannot obey: n/a, no number, code, document or personal datum is
created.
The failure path: a toast that cannot animate is removed by a timer, a reveal that
cannot observe shows its element, and reduced motion keeps the information.
Reachable: `/admin/design-system#motion`, linked from the page's section nav, and the
vocabulary is on every page that uses `.btn`, `.field-input`, `.notice`, `Dialog`,
`Tabs`, `Segmented`, `MetricStrip`, `Bento` and `ToastStack` without an opt-in. The
new primitives are in `.claude/rules/ui.md`, and the tokens and laws in
`05-motion.md`, `01-foundations.md` and `10-laws.md`.

### Addendum — 2026-10-01 (sixth): seven further reels, every motion that fits the language

**Requirement.** The owner supplied seven more reels and asked that none of their
motion be missed. Each was read motion by motion for what it tells the reader, and the
seven catalogues were merged against what the fifth addendum already ships. Most rows
were already covered (arrive, stagger, the text decode and type, the loading ring,
press, count-up, ring draw-on, reveal on scroll). Twelve motions were new and fit the
caps, and are built; the rest are not adopted, with reasons. The long form, with the
motion-to-meaning table and how each is built, is the "seven further reels" section of
`docs/design/motion/05-motion.md`; the specimens are in
`/admin/design-system#motion` ("Quantities and changes", "Hand-offs and reveals").

**What was built.**

| Concept | Where | Built on |
|---|---|---|
| Sheen on a changed value | `.sheen` + `data-fresh`; `hooks/use-fresh-on-change.ts`; the dashboard `MetricCard` (a range switch refetches in place) and a new row in `LiveFeedWidget` | one gradient on a pseudo-element, transform only; `data-fresh` cleared after `sweep`; never on first render or on arrival |
| Label swap | `ui/swap-text.tsx`; `StatusBadge` | `nextSwap` (pure, tested); the leaving copy is `aria-hidden` and unmounts after `fast` |
| Progress bar | `ui/progress-bar.tsx` (`tone`, `head`, `segmented`); the Reports ranking and the Stitching tailor load replace two hand-rolled `width: X%` bars | a translate fill reading `--p`; `progressFraction` (pure, tested) |
| Truncate reveal | `ui/truncate-reveal.tsx`; Reports labels, Stitching tailor names | `revealRun` (pure, tested); `speed.read` token |
| Wizard direction | `components/common/wizard.tsx` | `.step-forward` / `.step-back` on a step keyed by its id |
| Popup from its trigger | `ui/dialog.tsx` | `originOffset` (pure, tested), read in a layout effect; `.arrive-from` |
| Error ignite | `.ignite`, `.notice-error[role=alert]`, the error toast | a 2px inset ring on a pseudo-element, opacity only |
| Badge pop | `.pop`; the cart count (keyed by the count) | `scale.pop` token |
| Chart motion | `components/admin/charts/chart-motion.ts` and every chart | tokenised draw-on, series stagger, tooltip glide, cursor, active dot, marker pop, donut halo; 23 tests |
| Icon draw-on | `ui/draw-icon.tsx`; the tick on verify-email and unsubscribe | `.draw-path` with `pathLength="1"`, marked on the client |
| Odometer | `CountUp mode="reel"`; net profit on the P&L page | `.reel-digit` / `.reel-strip`; `reelParts` (pure, tested) |
| Word reveal | `TypeText unit="word"` | `typedWordsFrame` (pure, tested) |
| Literal timings | 44 `duration-200/300/700` and `ease-out` classes in 18 files | `duration-normal/slow/sweep`, `ease-decelerate`; no behaviour change except where noted below |

**Parameters.**

| Parameter | Exact value | Why this and not another | Enforced |
|---|---|---|---|
| `scale.pop` | 0.6 | a chart point or a count badge is about 8 to 20 px, so 97% of it (`arrive`) moves under half a pixel and reads as nothing; 60% is visible and still lands inside `fast` | `brand.ts`; `theme-space.spec.ts` (above 0, below `arrive`) |
| `speed.read` | 48 px/s | the two reels that scrolled text ran at 23 and 80; 48 is between, and a 240 px overflow is one pass of five seconds | `brand.ts`; `theme-space.spec.ts` (20 to 100); `revealRun` |
| Truncate reveal duration | overflow / 48 s, floor 140 ms (`fast`), ceiling 5 000 ms, after a 220 ms beat (`normal`), `linear` | a line being read must move at a steady rate; under 140 ms a few pixels would jerk; past five seconds the reader has read it or left (a long line goes faster, not longer) | `REVEAL_MAX_MS`, `revealRun`; `.reveal-run` |
| Truncate reveal threshold | 1 px of overflow | under a pixel is rounding, not truncation | `revealRun` |
| Sheen | 420 ms (`sweep`), `decelerate`, 105 degrees, 40/50/60% stops, accent ink at 14%, once | one pass long enough to follow and short enough to be over before the reader looks away; 14% of the accent ink clears nothing it should not and reads in both themes | `.sheen[data-fresh]::after`; `MOTION_MS.sheen` |
| Ignite | 2 px inset ring, negative colour, opacity 1 to 0 over 320 ms (`slow`), `settle` | the ring is the information, so it is as thick as a focus ring's step and inset so a clipping toast cannot cut it off | `.ignite::after` |
| Swap | out 140 ms (`fast`) `exit` over 4 px; in 220 ms (`normal`) `settle` from 4 px | leaving is quicker than arriving; `distance.nudge` is the smallest travel that reads | `.swap-in`, `.swap-out`; `MOTION_MS.exit` |
| Pop | 140 ms (`fast`), `settle`, `backwards` | a mark this small is done in a beat | `.pop`, `.chart-point` |
| Progress bar | fill eases 220 ms (`normal`) on `standard`; track 6 px; segmented track 12 px, cells 6 px, gap 3 px; head knob 12 px with a 2 px surface ring; a fraction held to 0 to 1, an unusable `max` draws empty | the bar follows real progress between samples, not a clock; `neutral-100` is the track because it is visible on both card surfaces (`neutral-50` vanished in dark) | the `.progress-*` rules in `globals.css`; `progressFraction` |
| Wizard / popup arrive | 220 ms (`normal`), `settle`, 8 px, 97% to 100%; popup offset held to 64 px (`distance.large`) per axis | the same as `arrive`; 64 px is the largest travel the language allows for a small idea, so a trigger at a far corner cannot make the panel cross the screen | `.step-forward`, `.step-back`, `.arrive-from`; `originOffset` |
| Reel | 420 ms (`sweep`), `settle`, digits 80 ms apart for at most four steps (320 ms), window 1.15 em | the one headline figure takes the longest step; the stagger ramp is the language's own, inside `slow` | `.reel-strip`; `staggerDelayMs` |
| Word reveal | 320 ms in total, at most 80 characters | the total is fixed, so a long line is not slow | `TypeText`; `MAX_ANIMATED_CHARS` |
| Icon draw-on | 320 ms (`slow`), `settle`, strokes 80 ms apart | a tick is small; a ring around it follows | `.draw-path` |
| Chart entrance | 420 ms (`sweep`), `settle`, series start 0, 80, 160, 240, 320 ms apart | a chart is a page-level figure; one duration and one curve so it reads as one event | `chartDrawProps` |
| Chart tooltip | glide 220 ms (`normal`) on `settle` | Recharts' own default is 400 ms on `ease` | `chartTooltipMotion` |
| Marker pop delay | when the eased line has covered 98% of the way to the point, at most 280 ms (draw less pop) | the line is front-loaded, so a linear share of the draw would pop the dots long after it had passed | `pointPopDelayMs` (inverts `settle`) |
| Donut halo | 3 px outside the ring, 4 px thick, 35% opacity, fades over 140 ms (`fast`) | stays inside the 96 px half-width of the box (84 + 3 + 4 = 91) | `share-chart.tsx` |
| Literal timings | `200` to `normal` (220), `300` to `slow` (320), `700` to `sweep` (420), `ease-out` to `decelerate` | nearest token, so one edit now retunes them; the product-card image zoom was 700 ms and is now 420 ms, which is the only change a reader would notice | the 18 files, `.claude/rules/ui.md` |

**Failure modes.**
- *Scripting off or slow.* Server markup is always the settled state: the reel strips
  rest on the figure, the icon is drawn, no sheen, no swap.
- *Reduced motion.* Every one of these asks for itself or is collapsed by the
  stylesheet; the sheen flag, the leaving label, the reel's starting digits, the icon's
  stroke marks and the truncate scroll never start, and the information stays (the new
  value, the figure, the icon, the full text in `title`, the tone in `valueText`).
- *A popup with no focused trigger* (opened by script, or a browser that does not focus
  a button on click) arrives from `small` below, which is `arrive` itself; a trigger
  with no size does the same.
- *A figure that changes its number of decimals* rolls its strips (keyed from the
  right) to their new digits from wherever they were, and ends on the right figure.
- *Copying a reel figure.* The strips are not selectable text, so the reel is for the
  one display figure of a screen; the default count stays where a figure is copied.
- *A second change inside 420 ms* does not restart the sheen; a fresh one starts after.
- *The tooltip's first show* may glide from its previous place (a Recharts trait, also
  true of its 400 ms default); `chartTooltipMotion` can return `isAnimationActive: false`.
- *Stagger on replays.* Recharts replays `animationBegin` when data or a legend toggle
  redraws a series, so a re-enabled third series waits 160 ms; series are indexed by
  visible position so the first visible one is always immediate.

**Exceptions to the 320 ms cap, and why.** A chart entrance is 420 ms (`sweep`); with
the stagger the fourth series ends at 660 ms. That is the entrance of a page-level
figure, not of a control, and each series is still one event on one curve. A truncated
label scrolls for as long as its text needs (to five seconds), but only under the
pointer, so nothing waits on it. The progress bar follows data.

**Not adopted.** The playhead scrubbing a timeline (no timeline view exists), an icon
that wipes open to its label (a `clip-path` animation is paint, not transform or
opacity, `MOT-5`), bounce, overshoot, tilt and camera zoom, glow and blur, particles,
brand-gradient watermarks, hard-cut scene edits, dimmed siblings, and a card hover tint
(`.lift` already carries it). `MetricStrip` takes no `changeKey`: the P&L page unmounts
its strip while a month loads, so a figure there arrives rather than changes and the
reel and count-up already mark it.

**Noticed, not changed.**
- `transition-all` remains on `header.tsx` (nav underlines), `product-card.tsx` and
  `stitching-panel.tsx`; it can animate layout properties and each needs reviewing one
  by one.
- Dead CSS: `.chart-line` / `drawLine` in `globals.css` (again unused, now that the charts
  are tokenised); deleting it needs the owner's confirmation.
- `TypeText` (both units) still has no product consumer; `DrawIcon` is on two storefront
  pages that could not be run here.
- The design-system pages and `tailwind.config.ts` (`250`) still carry a few literal
  timings, and mobile and the POS do not use these tokens.
- A gauge and a funnel chart do not use Recharts' animation: the gauge has its own
  tokenised transitions and the funnel none.

**Verification.** Rebuilt for production and driven with Playwright against
`/admin/design-system`. Forty-nine new checks pass: the bar's fill is a translate and
rests at `--p`, the tone colours equal the feedback tokens, the head and the cells,
the fill growing from the right in a right-to-left document; the sheen starting on a
change and clearing after one sweep; the label leaving as `aria-hidden` and unmounting
after `fast`; the reel resting on its digits, stopping one stagger step apart and
rolling monotonically without passing its target; the badge pop from 60% landing on 1
without overshoot; the wizard's first step not animating, then forward and back
arriving from either side and leaving no transform behind; the popup's offsets (opposite
signs on a 380 px screen, held to 64 px); the icon's strokes marked and drawing; the
truncated label running at the reading speed and holding at its end, then restoring
the plain text; the word reveal showing whole words only; the error notice and error
toast igniting and fading; the chart tooltip's `transform 220ms cubic-bezier(0.16, 1, 0.3, 1)`
and its cursor; and, under reduced motion, no sheen, no leaving label, the reel at its
figure at once, no marked strokes, no scroll, an unseen ring. The earlier 69 motion
checks, the 95 screen checks and the 14 width-and-theme combinations (280 to 1536,
light and dark: no horizontal overflow, no offender) still pass, with no console
error. `pnpm lint`, `pnpm typecheck` and `pnpm test --filter='!@newax/api'` pass
(web 221 tests, of which 17 are new in `motion.spec.ts` and 23 are `chart-motion.spec.ts`;
shared 397), `pnpm index:check` is current and the four counts in `CLAUDE.md` are inline
`style={{` 27, `toLocaleString` 6, bare fetch 6, gray palette 0 (the two hand-rolled
bars' two inline styles are gone and `ProgressBar` and `TruncateReveal` add two; the
reel, the marker pop and the chart cursors set custom properties through a variable,
which that pattern does not count). The two storefront pages that use `DrawIcon`, the
P&L page, Reports, Stitching, the dashboard and the activity feed need a running API
and a session, so they were checked by typecheck, lint and the production build only,
not in a browser. `pnpm check:overflow` needs a seeded stack and was not run. The
Playwright scripts are not in the repository.

**Scope lenses.**
The actor with three tables, the principal with no permission key, the grant that
ends itself: n/a, no actor, principal or grant is created; motion changes no
authority.
Whose rows, and which columns, the threshold nobody approves alone, the toxic pair,
authority and blast radius, audience: n/a, nothing is read, committed or sent; no
`PERMISSION_CATALOG` key was added, so there is no `Permission` row without a grant.
Request or record: the sheen flag, the leaving label, the reel and the truncate scroll
are presentation state, not writes; nothing here is a REQUEST or a RECORD of a business
fact. The bars read the same numbers the hand-rolled ones did.
The movement with no address, four hours down, and the money lenses (posting rule,
columns, period, second legal entity, dry run, click the number): n/a, no stock, cash
or journal line is read or written. The P&L reel shows the figure the page already
shows and the figure is also in an `sr-only` copy.
The three silhouettes and the absent collaborator: a Solo deployment gets the same
motion; the tokens live in `brand.ts`, which every surface imports, and the activity
feed and the dashboard render nothing when their module is absent, so the sheen never
mounts there.
The second copy of the write, the hundred-thousandth row: a list of any length animates
at most four stagger steps, `StatusBadge` mounts a small text swap per row (no timer
until a status changes), and the activity feed keeps at most ten ids.
The adoption test, the reversal document, the undo fan-out, the version stamp, the
erasure the ledger cannot obey: n/a, no number, code, document or personal datum is
created.
The failure path: a swap that cannot finish is removed by a timer, a popup with no
trigger falls back to `arrive`, a chart with motion off draws whole, and reduced motion
keeps the information.
Reachable: `/admin/design-system#motion`, in the page's section nav, and the new
primitives are exported from `components/ui` and listed in `.claude/rules/ui.md`; the
tokens are in `01-foundations.md` and the language in `05-motion.md`.


### Addendum — 2026-10-01 (seventh): nine rule cards, built as thirty laws and the controls they name

**Requirement.** The owner supplied nine rule cards (uploads, dropdowns, danger, the
login form, the product card, and four sets of UX laws) and asked for them "in design
system globally". Each rule was turned into a law with a stable ID and a test, and the
control it names was built, so a review can cite `UPL-3` or `DNG-2` and a lint can fail
on it. The twelve borrowed UX laws on the cards (Fitts, Hick, chunking, Doherty,
proximity, Von Restorff, goal gradient, Postel, Tesler, similarity, serial position,
peak-end) were already `ACT-1`, `COG-1`, `COG-3`, `ACT-3`, `PER-1`, `COG-12`, `COG-10`,
`ACT-5`, `COG-8`, `PER-3`, `COG-11` and `COG-13`; they are not restated, and the end of
`10-laws.md` says which artifact makes each true. The long form is "Controls with a
contract" in `docs/design/components-states/03-components.md` (UPL, MNU, DNG, FRM, CRD:
thirty laws, 180 in all); the specimens are in `/admin/design-system#controls`.

**What was built.**

| Card | Where | Built on |
|---|---|---|
| Uploads: drop zone, honest progress, check before sending, limits upfront, per-file failure, never block the app | `ui/dropzone.tsx`, `ui/upload-tray.tsx`, `hooks/use-upload-queue.ts`, `components/admin/upload-provider.tsx` (wraps the admin shell), `lib/upload.ts`, `lib/upload-queue.ts`, `lib/upload-client.ts`, `lib/upload-rules.ts`; adopted by product images, the three CSV imports, expense receipts, RAG documents and the stitching photo | a pure reducer with an injected clock; an XHR transport because `fetch` cannot report upload progress, authenticated through the one `adminAuth` object `adminFetch` also uses; server limits copied with file and line |
| Dropdowns: type to filter, typed dates, stay open on pick, collision-aware, reasons not grey, no menu under five | `ui/select.tsx`, `ui/multi-select.tsx`, `ui/menu.tsx`, `ui/date-field.tsx`, `ui/segmented.tsx` (reasoned-disabled), `hooks/use-popover.ts`, `lib/popover-position.ts`, `lib/menu-filter.ts`, `lib/calendar.ts`, `lib/date-parse.ts`; 18 short selects, 32 date inputs and 17 long selects adopted | the Popover API (top layer, so a menu inside a modal is not clipped by z-index), with a portal fallback; placement is a pure function |
| Danger: hold to confirm, verb labels, off the happy path, red budget, danger zone, cooldown | `ui/hold-to-confirm.tsx`, `ui/danger-zone.tsx`, `ui/cooldown-banner.tsx`, `ui/confirm-dialog.tsx` (verb label required, Cancel focused), `lib/guard.ts`; 16 dialog labels reworded; `bom/[id]` archive moved into a zone | a state machine that takes the time as an argument; `BRAND.safeguards` |
| Login form recipe | `ui/field.tsx` (`Field`, `FormStack`), `.field-xl`, `Button done`, `useDoneBeat`; the admin login and the four storefront auth forms | `size.control.xl`; labels above, examples as placeholders; one filled button |
| Product card recipe | `.card-lit`, `.media-concentric`, `Price tone="accent"`, `ProductCard`, `ProductsGrid`, `concentricRadius` in `@newax/shared` | the concentric-corner formula; `fineStaggerDelayMs` |
| Lint | `scripts/check-danger.mjs` (vague destructive labels, DNG-2), `scripts/check-menus.mjs` (short native selects and native date inputs, MNU-6 and MNU-2); both in `pnpm lint` | the vague-word list is read from `guard.ts`, so there is one list |

**Parameters.**

| Parameter | Exact value | Why this and not another | Enforced | How it degrades |
|---|---|---|---|---|
| `safeguards.holdToConfirmMs` | 1000 ms | longer than a phone's long-press (about 500), so a resting thumb cannot fire it; a second is the least a ring can fill in and still be seen filling | `brand.ts`; `HOLD_MS`; `guard.spec.ts` pins it | a `holdMs` of 0 would fire on the first frame, so the spec pins the brand value and only a caller can pass another; NaN never fires (the control is inert, which is the safe side) |
| Hold, keyboard | Space or Enter held for the same length; a key repeat does not count | the hold has an equivalent for people who cannot point | `HoldToConfirm`; `nextHold` | releasing or leaving the button cancels |
| Hold, assistive technology | first bare click arms, second confirms; no timeout; ends on blur or Escape | a click with no preceding press cannot hold; a timeout would be its own barrier (WCAG 2.2.1) | `HoldToConfirm` | an armed control that loses focus quietly disarms |
| `safeguards.deletionCooldownDays` | 14 days (24 h each) | spans two weekends and a month-end close, which is when somebody notices what is missing | `brand.ts`; `COOLDOWN_DAYS`; `cooldownState` | an unreadable date or a bad length reads as expired, so a corrupt row cannot keep something alive; UI-only until a purge job exists |
| `size.control.xl` | 56 px | seven 8 px steps, above the 44 px touch floor; the form recipe's field height, kept off dense table rows (`md`, 40) | `brand.ts`; `theme-size.ts`; `.field-xl` | none needed |
| `motion.distance.lift` | 4 px | twice `micro`; enough to read as rising, small enough not to cover the next row; its own token so the card lift and the invalid-field shake (`nudge`) retune apart | `brand.ts`; `.lift` | under reduced motion the card does not lift |
| `motion.stagger.fine` | 40 ms, at most four steps (160 ms) | a grid of many small peers should not take 320 ms to arrive; the cap is what stops a 200-card grid from animating for seconds | `brand.ts`; `fineStaggerDelayMs`; `motion.spec.ts` | beyond the fourth step peers share one delay; the product grid cascades each row (`index % columns`, so at most 120 ms) |
| Submit beat | 320 ms (`slow`) | long enough for the check to draw before the page leaves | `MOTION_MS.done`; `useDoneBeat` | no wait and no drawing under reduced motion; the button still says "Signed in" |
| Focus ring | 2 px, eased in over 140 ms (`fast`) | the existing focus step; never removed | `.field-input` | none |
| Concurrent uploads | 3 | a browser holds 6 connections per origin; 3 leaves the rest for the app's own requests (UPL-6) | `startable()` in `upload-queue.ts` | the rest wait in order; nothing is dropped |
| Upload speed window | 3 000 ms | smooths a bursty link and still follows a change | `measure()` | under 2 samples reads 0 B/s |
| Upload time-left gate | 1 000 ms of samples and speed above 0 | under a second the figure is a guess (UPL-2) | `measure()` | the lane shows no time left |
| Progress report interval | 250 ms (the last report always passes) | browsers fire about every 50 ms and each report re-renders every reader of the queue; the bar eases over 220 ms, so four a second still glides | `use-upload-queue.ts` | cosmetic only |
| Tray auto-hide | 4 000 ms after everything succeeded, paused under the pointer or focus | the toast default | `upload-provider.tsx` | a failure never hides on a timer |
| Refusals listed | 5 names, then "N more" | dropping 200 wrong files must not be a wall of red | `dropzone.tsx` | the rest are counted in one line |
| Upload size and types | 8 MiB for images and PDFs; JPEG, PNG, WebP, AVIF; PDF alone for RAG; CSV has no byte limit and 5 000 rows (a hint only, checked after parsing) | the server's own numbers, with file and line in `upload-rules.ts` | `checkFile` at drop time | the server checks again; this is a convenience, never authorization |
| Client upload timeout | none | a slow link legitimately takes minutes, and every lane has Cancel | n/a | a hung connection stays "Uploading" until Cancel or the server gives up |
| Tray size | 384 px wide (`max-w-sm`) and the viewport minus 2 rem; lanes scroll at 288 px | fits a 280 px screen | `upload-tray.tsx` | lanes scroll, never reorder |
| Tray layer | `z-dropdown` (20) | above page content and sticky bars, below the drawer and every dialog | `upload-tray.tsx` | n/a |
| Menu search threshold | search above 10 options | MNU-1; ten rows fit a 20 rem panel without scrolling | `menu-filter.ts` `needsSearch` | `searchable` can force search on, never off for a long list |
| Segmented limit | below 5 options is a segmented control | MNU-6 | `menuKind` | an empty list is a menu, so it still has a trigger and an empty state |
| Popover gap and margin | 4 px from the trigger, 8 px from any edge | attached but not touching; never flush to the glass | `popover-position.ts` | the panel is clamped inward and its height and width are capped to the room left |
| Flip rule | flip up when room below is less than the panel and room above is greater than room below | equal room never flips, so there is no flip-flop at the boundary | `placePopover` | with both sides too small the larger is used and the panel scrolls |
| Menu panel | at most 20 rem high, 28 rem wide, each capped by the room left | about nine 2.5 rem rows and the search box | `menu.tsx` | falls back to the fixed size without the hook's variable |
| Placement recompute | one animation frame, coalesced, on scroll, resize and visual-viewport change | at most one layout read a frame | `use-popover.ts` | no debounce, so no stale placement |
| Type-ahead reset | 700 ms | longer than a typing burst, shorter than a pause to think | `menu-filter.ts` | the buffer clears |
| Calendar | always 6 rows by 7; years in pages of 12; years 1000 to 9999 | the panel never changes height between months; four-digit ISO strings keep string comparison and UTC maths safe | `calendar.ts` | out-of-range input gives a reason, never a clamp |
| Two-digit years | 80 years back, 20 forward from today | the usual window; 85 reads as 1985, 46 as 2046 | `date-parse.ts` | three-digit years are refused with a reason |
| `check-menus` baseline | short native selects 0, native date inputs 1 | short selects reached zero; the one date input is `MetadataDrivenForm`'s, which may compose only plain elements (architecture-patterns/141 §2, `check-metadata-renderer.mjs`) | `scripts/check-menus.mjs` | fails only on growth |

**Failure modes.**
- *Popover API missing* (an older browser): the panel is portalled into the nearest
  dialog or `body` with `fixed z-dropdown` and placed by the same function; a menu
  inside a modal is then in the modal's stacking context, which is why the hook portals
  into the dialog.
- *The server refuses what the client let through*: the lane fails with the server's
  message and a Retry; nothing is retried automatically, so a refusal cannot loop.
- *The network drops mid-upload*: the lane fails ("Network error"), the others carry
  on, Retry sends that one file again. A late success for a lane cancelled just as it
  finished is recorded as done, because the file landed.
- *A session expiring mid-upload*: the transport refreshes once through the same
  single-flight refresh `adminFetch` uses and retries the file; if that fails the
  operator is sent to sign in.
- *Closing the tab during a transfer*: a `beforeunload` confirm while anything is going.
- *Concurrent uploads to one product* take the same `order` on the server (the API
  numbers a new image from a count it reads before it saves), so the product's lanes
  are sent one at a time (`serialKey`); a failure or cancel never blocks the next. The
  race across two tabs needs a server transaction and is not fixed here.
- *Enter on the file input*: `Space` opens a file input natively; `Enter` did not reliably
  (headless Chromium opened the picker on 1 of 3 fresh pages), so `Dropzone` handles
  `Enter` itself (`preventDefault`, then `click()` on the input). After the page hydrates it
  opened the picker on 3 of 3 pages; before hydration the browser's own handling applies,
  which is not a state a keyboard user reaches.
- *A hold interrupted* (pointer leaves, focus moves, Escape, pointer cancel): the ring
  drains and nothing happens; a screen reader is told "Not confirmed".
- *Reduced motion*: the ring still follows the clock (it is the information), the check
  is shown without being drawn, the card does not lift, a grid arrives at once.
- *A typed date that cannot be read*: the text is kept, the reason is shown next to
  the field and announced, and nothing is committed.

**Deviations from the cards, and why.**
- *Corners.* The cards use 24 px cards, 12 px fields and a 16 px photograph. The house
  shape is 2 to 3 px, so the law is the formula (`concentricRadius`), which gives 24, 16
  and 8 for a soft brand and a square photograph here. The owner chose to keep the house
  corners (decision card, 2026-10-02), so the shape is not changed; a brand that wants
  soft corners changes its radii in `brand.ts` and the formula follows.
- *Shadow at rest.* The cards draw a border and a soft shadow together. `ui.md` forbids
  both on one edge, so `.card-lit` has the border and the lit surface, and the shadow
  arrives with the lift.
- *Press on a card.* A card is too big to scale (2% of 400 px is 8 px), so a press
  reverses the lift and the button inside carries the 98% press.
- *Hold to confirm replaces a dialog only for the middle `ACT-6` tier.* The sixteen
  existing confirmation dialogs carry a consequence paragraph, a typed name, or both, so
  they stay and only their labels changed.
- *The form card* appears only where the page has a backdrop (the admin sign-in); a form
  that is alone on its page stays boxless (`ui.md`), which is the storefront's case.
- *Cooldown* is a UI contract and the number a purge job will read; there is no purge job.
- *Date field.* English month names only; a bare "Oct 2026" is refused with "add the
  day"; Enter commits the text and does not submit the form; the calendar's cells are
  44 px tall and about 35 px wide at 280 px.
- *Uploads.* `Dropzone.disabled` is the reason string, so a zone cannot be disabled
  without saying why; `maxBytes` may be `Infinity` where the server sets no cap.

**Not adopted.** The storefront visual-search button (an icon-sized control on the public
API with no admin session or provider, and it needs strings in both catalogues); the
RAG "Replace file" row action and the party picker (no surface for a zone; an async
combobox with its own listbox); the 73 native selects of five to ten options or of
unknown size (the platform's menu is accessible and collision-aware there; the total is
printed on every `check-menus` run); the product form's selects (a field that wraps its
own label and a brand select with deactivated-option logic).

**Noticed, not changed.**
- Every API `FileInterceptor` is created with no `limits.fileSize`, including the public
  `/search/by-image`. Multer buffers the whole body in memory before the 8 MiB check in
  `putImage`, so the real cap is after the read. Setting `limits` is the fix and an API
  change.
- `lib/upload-rules.ts` copies the API's limits with file and line; they belong in
  `packages/shared` next to `IMPORT_ROW_CAP` so the API and web read one number.
- `Dialog`'s focus trap selects `input:not([disabled])`, which also matches the hidden
  input of a required `Select` if it is the last element in a dialog.
- A product form left while a photograph is still uploading loses track of that lane;
  the image lands and appears after a refresh. Fixing it needs a scope tag on lanes.
- `scripts/build-index.mjs` matched design chapters only at `docs/design/NN-*.md`, so
  after the chapters moved into group folders `pnpm idx law` indexed no laws; the pattern
  now allows one folder level.
- `AnimatedSection` (framer-motion) still carries a 0.8 s duration and a 50 px rise as
  literals; it predates the tokens and is used across the storefront.
- `transition-all` remains on `header.tsx` and `stitching-panel.tsx`.

**Verification.** Run on the final tree, after the last edit.

- `pnpm index` regenerated (217 pages, 18 changed); `pnpm index:check` exits 0.
- `pnpm lint` exits 0. It includes `check-danger` (53 literal labels checked, 9 written as
  expressions and not checked), `check-menus` (73 native selects in total, 0 short, 1
  native date input), `check-contrast`, `check-metadata-renderer`, `check-rules` and
  `check-rebrand`. Two lint failures turned up on the way and were fixed rather than
  baselined: a `DateField` import into `MetadataDrivenForm` (it may compose only plain
  elements, so the native date input stays and the `check-menus` baseline says 1), and
  three uses of `neutral-200` against a baseline of 1 (the `DateField` calendar button is
  now borderless and the dropzone's dashed edge is `neutral-500`, which clears the 3:1 a
  control edge needs).
- `pnpm typecheck` exits 0.
- `pnpm test`: web 501 passed (17 files), shared 404 passed, pos-core 28 passed. The root
  command exits 1 because 70 of the 295 `@newax/api` suites fail (684 of 3,068 tests);
  their log shows Redis refused at `localhost:6379`, and they are the e2e suites that need
  Postgres and Redis, neither of which this container runs. No file under `apps/api`
  changed in this work. This was not run against a database, so CI is where those suites
  are decided.
- `next build` of `apps/web` passes on the final tree.
- The four greps in `CLAUDE.md`: inline `style={{` 27, `toLocaleString` 6, bare `fetch` 6,
  `text-gray` and `bg-gray` 0. The first three are the same numbers `HEAD` has (27, 6, 6),
  so none was added.
- Browser, Chromium against the production build of `/admin/design-system`: danger, form
  and card specimens 63 of 63 checks (seven widths, light and dark, reduced motion);
  uploads and menus 48 of 48 (limits printed, Enter and drop and paste, refusals by name
  with a remedy, five files with one failure and exactly one Retry, search focus and
  filter, Escape and focus return, blocked options with reasons, multi-select staying open,
  typed dates, calendar jump, a panel opening upward near the bottom edge, a right-to-left
  380 px panel inside the viewport, and no horizontal overflow at the seven widths in both
  themes).

*Not verified in a browser:* the XHR transport against the real API (the specimen uses a
simulated transport, so progress, cancel and retry are verified and the wire is not);
the storefront sign-in, register and password pages and the storefront product card (they
need the API); and the roughly sixty admin pages that adopted `Select` and `DateField`,
and the pages that adopted `Dropzone`: they typecheck and build, and the controls they use
are the ones verified above, but each page was not opened.

**Scope lenses.**
The actor with three tables, the principal with no permission key, the grant that ends
itself: n/a, no actor, principal or grant is created. The upload tray and the danger
controls are presentation and never replace a server check.
Whose rows, and which columns, the threshold nobody approves alone, the toxic pair,
authority and blast radius, audience: n/a, no row is read or committed by the controls
themselves; each page that adopts one calls the same endpoint with the same permission
as before, and no `PERMISSION_CATALOG` key was added, so there is no `Permission` row
without a grant. `DangerZone` renders nothing for a person who may do none of its acts
(`PRM-5`).
Request or record: an upload is a REQUEST the server may refuse (the lane shows why);
a hold is a gate in front of a REQUEST that already existed; nothing here is a RECORD.
The movement with no address, four hours down, and the money lenses (posting rule,
columns, period, second legal entity, dry run, click the number): n/a, no stock, cash or
journal line is read or written.
The three silhouettes and the absent collaborator: the tokens live in `brand.ts`, so a
Solo deployment and a group deployment get the same controls; the upload provider
wraps the admin shell only, and a page that renders a `Dropzone` outside it throws a
clear error rather than failing silently.
The second copy of the write: a retried upload is a new request by design (the lane's
Retry); the server's image routes are not idempotent, which is why a product's lanes
run serially. A hold fires once per press (`nextHold` ignores a second down).
The hundred-thousandth row: no list is rendered at size by these controls; a menu of 140
branches filters in memory, and a product grid animates at most four stagger steps.
The adoption test, the reversal document, the undo fan-out, the version stamp, the
erasure the ledger cannot obey: n/a, no number, document or personal datum is created.
The failure path: see Failure modes above; every refusal states its remedy (`FLO-7`).
Reachable: `/admin/design-system#controls`, in the page's section nav; the primitives
are exported from `components/ui` and listed in `.claude/rules/ui.md`; the tokens are in
`01-foundations.md` and the motion in `05-motion.md`.

**Pillars.** Proper architecture: the controls are primitives behind `components/ui`,
the rules are pure functions with specs, and the two lints keep them used. Stable and
reliable: per-file failure, a single-flight refresh, no timeout that could trap a
person, a fail-safe on a bad hold length. Secure by design: every check at drop time is
a convenience and the server checks again. Observable: not touched (no APM is wired).
Scalable: the queue caps concurrency at 3 and the progress renders at 4 a second.

### Addendum — 2026-10-02 (eighth): two reels, built as a UX engine for the agents, seven laws, a lint and one primitive

**Requirement.** Two reels of 2026-10-02 ("Hierarchy", "Success is a system") and the
owner's instruction: "make Claude Code think like a senior UX designer. UX engine
designs the screen before coding, audits what is broken, reviews the diff and kills the
AI look." **Reason.** The design system had 180 laws and no procedure that makes an
agent apply them before it writes a screen, so a new page could still ship a second
loud button, a check mark with no button, or a gradient. **Outcome.** A procedure per
job, laws for what the reels add, a command that holds the machine-made look in place,
and one primitive for the success screen. **Verification.** Commands below, and a
cold dry run of each procedure by an agent that had not seen this thread.

**What was built.**

| Piece | Where | What it does |
|---|---|---|
| `HIE-1`, `HIE-2` | `docs/design/layout-composition/02-layout.md`, "Hierarchy: where the eye goes" | one headline per page; the eye makes three stops (headline, content, the one loud button) |
| `SUC-1` to `SUC-5` | `docs/design/components-states/04-states.md`, "The success state" | specific, a next step, the surface follows the stakes, at most one open loop, joy only for a rare milestone |
| `/ux-design`, `/ux-audit`, `/ux-review`, `/restyle` | `.claude/skills/*/SKILL.md` | design brief before JSX; read-only audit with evidence; read-only diff review ending Ship or Fix first; remove the tells (`/restyle` edits files, so it is `disable-model-invocation: true` and runs only when asked) |
| `ux` subagent | a row in `scripts/lib/model-routing.mjs`; `.claude/agents/ux.md` is generated by `pnpm index` | sonnet at high effort, read-only tools, follows the three skills |
| `check-tells` | `scripts/check-tells.mjs`, in `pnpm lint` | a ratchet per tell and per file; `node scripts/check-tells.mjs <file>` lists one file's tells with `file:line` |
| skill and law drift check | `scripts/check-rules.mjs` | a skill whose `name` differs from its folder, with no description, or with an odd number of fences fails; a cited law ID (`XXX-N`) with no heading in `docs/design/` fails (112 citations, all resolve, against 187 laws) |
| `SuccessState` | `apps/web/src/components/ui/success-state.tsx`, `lib/success-state.ts`, specimen at `/admin/design-system#controls` | a drawn tick, a specific title, proof, a required primary, one quiet repeat, one open loop, a way back; renders nothing without a primary action |

Six screens use `SuccessState`: storefront verify-email, unsubscribe, reset-password
and order placed or paid; the returns request; the admin CSV import (two callers).
Laws total 187 (180 and seven). The README's "87 borrowed" counts `SPA-5a`.

**Parameters.**

| Parameter | Exact value | Applies to | Why this number | Where enforced | How it degrades |
|---|---|---|---|---|---|
| Toast lifetime | 4 000 ms | `SUC-3` row 1, a safe reversible setting | the reel's "leaves in four seconds"; it is `useToast`'s existing default, so nothing changed | `hooks/use-toast.ts` | a toast is not the only record: the control shows its new state |
| Burst sparks | 8 | `SuccessState celebrate` | eight reads as a ring at a 56 px badge, fewer reads as a spinner | `BURST_SPARKS` in `lib/success-state.ts` | no sparks under reduced motion or without `Element.animate`; the badge and text still arrive |
| Burst delay and duration | 320 ms (`duration.slow`), 420 ms (`duration.sweep`) | the burst | it starts as the tick finishes drawing (`DrawIcon` takes 320 ms) | `BURST_TIMING` | as above |
| Burst easing, travel, end | `easing.settle`, 24 px (`distance.medium`) from the badge edge, `scale.pop` 0.6, opacity 0 | the burst | never overshoots; ends invisible | `burstTravel`, `sparkKeyframes` | as above |
| Animated properties | transform and opacity only | the burst | `MOT-5` | `success-state.tsx` | as above |
| Entrance | `.stagger-fine`: 40 ms steps, capped at 4, 320 ms `arrive` | `SuccessState` | the house stagger | `globals.css` | reduced motion shows it at once |
| Column cap | `max-w-md`, 448 px | `SuccessState` | a result is one short column and must not stretch on a wide screen (`SPA-4`) | the component | none |
| Check-tells baseline | gradient 8, glass 8, loud motion 1, heavy shadow 1, emoji 4, `transition-all` 0, buzzword 0, vague success 0 | `apps/*/src`, `apps/web/messages` | the counts found on 2026-10-02 that are legitimate or wait on a designer; each entry names its file in `BASELINE` | `scripts/check-tells.mjs`, in `pnpm lint` | a count may fall and may not rise; a fall prints "lower BASELINE" and passes |
| Skill description | at most 1 024 characters | each `SKILL.md` | the limit a skill can carry | `check-rules.mjs` | the build fails |

**Decisions made without the owner, all reversible.**
- `soft-radius` is not a tell. `tailwind.config.ts` maps `lg`, `xl`, `2xl` and `3xl` onto
  one `--radius-lg` token, so `rounded-xl` is a spelling of the house shape, not a softer one.
- `check-tells` tells fixed in place rather than baselined: `transition-all` to a named
  property (five places in `header.tsx`, one in `stitching-panel.tsx`); `shadow-xl` and
  `shadow-lg` to `shadow-modal` and `shadow-overlay`, which they already resolved to; the
  loading avatar's `animate-pulse` to `.skeleton`; "seamless" removed from one sentence in
  `en.json`; two toasts and notices that said only "Saved." now say what was saved.
- `⚠` was removed from five strings (the word remains). It stood in for an icon, and the
  colour and the word already carry the state.
- The reset-password 2-second auto-redirect is gone: `SUC-3` says the result stays until
  the person leaves it, and a confirmation that disappears is the dead end the reel names.
  Returns submit no longer jumps to the list, for the same reason.
- `SuccessState`'s reading order is its focus order (title, proof, receipt, primary,
  secondary, loop, back), not the order the first draft had, which put the loop's control
  ahead of the loud button for a keyboard (`COG-11`).
- `celebrate` is off and no screen passes it. `SUC-5` allows it only for a milestone the
  system remembers, and that record does not exist.

**Not adopted, and why.** Forgot-password stays a plain notice: it is deliberately
non-confirming ("if an account exists") so it does not reveal whether one does, and a
check mark would assert success. Register, support-ticket creation and the sign-in
completion screen are transitions onto the thing made, not result pages. `CommonWizard`
and `SecretOnce` have no end state to wrap. Admin notify ("Sent.") and inventory reorder
("created N draft POs") are row 2 or 3 but have no destination page to lead to (there is
no sent-announcements list and no link target for the draft POs), so a primary action
would be dishonest; they need those pages first.

**Failure modes.** A skill that cites a law that was renamed fails `pnpm lint`. A
`SuccessState` built with no primary renders nothing, which is visible in review and in
the specimen, not silent in production. A tell that grows fails with `file:line` and the
replacement.

**Verification.** Run on the final tree, after the last edit.

- `pnpm lint` exits 0 and includes `check-tells` (counts as in the table; 21 success
  messages are written as expressions and are counted, not checked) and `check-rules`
  (10 rule files, 4 skills, 112 law citations, 187 laws). `node scripts/check-tells.mjs
  --self-test`: 95 cases. `node scripts/check-rules.mjs` was also proven to fail, in a
  scratch repository outside this one, on a skill whose name differs from its folder and
  on a citation of a law that does not exist.
- `pnpm --filter @newax/web exec tsc --noEmit` exits 0; `apps/mobile` `tsc --noEmit`
  exits 0 (two strings lost a glyph); `pnpm --filter @newax/web test` 510 passed (18
  files; the new spec adds 9 tests, for the burst maths); `@newax/shared` 404; `@newax/pos-core` 28.
  The root `pnpm test` still exits 1 for the API suites that need Postgres and Redis; no
  file under `apps/api` or `apps/pos` changed.
- `pnpm index` and `pnpm index:check` exit 0 (218 pages).
- `next build` of `apps/web` passes on the final tree (rebuilt after the last code edit).
- The four greps in `CLAUDE.md` against `HEAD`: inline `style={{` 27 and 27, `toLocaleString`
  6 and 6, bare `fetch` 6 and 6, `text-gray` and `bg-gray` 0 and 0.
- Browser, Chromium against the production build: the controls specimen sections from
  the previous addendum still pass (63 of 63, 48 of 48). `SuccessState`'s specimen 42 of
  42: no overflow at the seven widths in both themes, one list of three steps, Tab order
  (View invoice, Send another, Notify me, Back), every action 44 px tall at 380, eight
  sparks once and eight again on Replay, no sparks and no `animate()` call under reduced
  motion, a right-to-left pass at 280 and 380. The adopters against the production
  build with the API answered at the network layer: 31 of 31 (the first run had one
  failing assertion in the script itself, which expected the link `/en/` where the page
  correctly links `/en`; the script was corrected, not the page), and the returns submit
  6 of 6. These scripts are one-off and are not in CI.
- The four procedures were each followed cold by an agent that had not seen this thread:
  `/ux-design` on the admin Notify screen, `/ux-audit` on the storefront register page,
  `/ux-review` on this change's own uncommitted diff, and `/restyle` read-only on
  `product-purchase.tsx`. Between them they reported 24 places the procedures were
  ambiguous, cited something that does not exist or lacked a command, among them a
  premise the request got wrong (Notify messages staff, not customers) and a "read-only"
  audit whose first command installs git hooks and writes a build cache. All 24 are fixed
  in the skill files, and `check-tells` gained `node scripts/check-tells.mjs <file>` because
  `/restyle` could not otherwise see one file's tells. The dry runs also did real work:
  `/ux-review` found two defects in the code this change had just added, both fixed (the
  CSV import showed two loud buttons once a run was committed, so its Import button now
  steps back to secondary and stays disabled until another file is chosen; and the order
  page said "not paid yet" from the existence of bank details alone, so it now also
  requires the transfer's payment not to be `PAID`), plus a grammar slip ("Imported 1
  customers", now "1 row imported as customers"). `/ux-audit` found the open redirect
  recorded below. The dry runs were plain procedures; the harness later listed
  `/ux-design`, `/ux-audit` and `/ux-review` as skills in this same session, so they
  appear without a restart (`/restyle` is owner-invoked and is not listed to the model).

*Not verified:* any adopter against the real API (the pages were answered by network
mocks); the admin `CsvImportCard` in a browser (it needs an admin session; typecheck and
build only); real screen readers (checked in headless Chromium, which exposes the
accessibility tree, not a reader's speech); the Urdu strings written for the three new
namespaces (they need a native reviewer); mobile and POS (no motion or `SuccessState`
there); the `/restyle` skill's edit step (it was dry-run read-only and its edits were not
made).

**Scope lenses.**
The actor, the principal with no permission key, the grant that ends itself, whose rows
and columns, the threshold, the toxic pair, authority and blast radius, audience: n/a, no
actor, grant, row or message audience is created; `SuccessState` renders what a page
already holds and every adopter calls the endpoint and permission it called before.
Request or record: the adopters' writes are unchanged REQUESTS; the success screen is
shown after the server accepted one and never before.
The movement with no address, four hours down, the money lenses (posting rule, columns,
period, second legal entity, dry run, click the number): n/a, no stock, cash or journal
line is read or written. The order page shows the total from the order it already loaded.
The three silhouettes and the absent collaborator: the laws and `check-tells` read no
deployment setting; the order page's loop is built from the order's own status, so a
deployment with no shipping module shows the steps the order has.
The second copy of the write: n/a, no write is added; reset-password and the order page
are idempotent views of an outcome and a reload shows the same page.
The hundred-thousandth row: n/a, no list; `check-tells` scans 461 files in 0.35 s.
The adoption test, the reversal document, the undo fan-out, the version stamp, the
erasure the ledger cannot obey: n/a, no number, document or personal datum is created.
The failure path: a lint failure names `file:line` and the replacement.
Reachable: `/admin/design-system#controls`, in the page's section nav; `SuccessState` is
in `components/ui/index.ts` and the "Use what exists" table in `.claude/rules/ui.md`;
the commands are listed in `.claude/rules/design.md` and `CLAUDE.md`. The skills appear
as `/ux-design`, `/ux-audit` and `/ux-review` to the model and `/restyle` to the owner.

**Correction to the seventh addendum.** It says Enter did not reliably open a file input
in headless Chromium (1 of 3 fresh pages) and that `Dropzone`'s Enter handler fixed it.
That was a race in the test, which registered its file-chooser listener a moment before
the key was pressed. With the listener registered first, a bare `<input type="file">`
opens on Enter 12 of 12 times and `Space` 12 of 12, and the `Dropzone` opens once on 12 of
12 pages (never twice). The handler is kept, because UPL-1 promises Enter and Firefox and
WebKit were not measured, and `preventDefault` means an engine that opens natively does
not open twice; its code comment now says so instead of claiming a measured gap. The
uploads suite registers its listener early, and passes 48 of 48 on three consecutive runs.

**Separable work orders, named and not built.**
- *The milestone ledger.* `SUC-5` needs a record that a milestone happened (first
  invoice paid, first order shipped) with a unique key per person and milestone, so a
  celebration plays once and never again. Until it exists nothing passes `celebrate`.
- *Sent announcements and the approver's decision screen* (no web screen calls
  `/admin/notify/:id/decide`), which the Notify and reorder success states need first.
- *A component test harness* for `apps/web` (no `@testing-library` today), so
  `SuccessState`'s guard is a test and not a specimen and a browser run.

**Noticed, not changed.**
- **Open redirect.** `register/page.tsx:44-45` (and the login page) pass the `next` query
  parameter straight to `router.push`, so `/register?next=https://example.com` sends a
  new account to another site. It is a security fix with its own review, not part of a
  design change.
- `.claude/rules/design.md` says every user-visible string lives in `messages/*.json`;
  `06-content` says customer-facing strings do. Admin pages write literals and `en.json`
  has no admin namespace, so the rule is true of one and not the other. The skills
  follow `06-content` and say so; the owner may want the two made to agree.
- Register, forgot-password and reset-password carry English literals in JSX, and the
  register page's aside headline is `text-4xl` against a `text-2xl` page title (`HIE-1`).
- `order.thanks` and `order.paymentSuccess` in the message catalogue are now unused.
  They were left in place, not deleted.
- `check-tells` reads 21 success messages that are expressions and does not judge them.
- From the `/ux-review` dry run, not fixed because each is a judgement or older than this
  change: the CSV import shows a green tick when 3 of 1,000 rows landed (the detail line
  states the skips, and `SUC-1` can be read either way); "Import another file" unmounts
  the button that has focus, so focus falls to the page; `admin-shell.tsx:115` carries a
  physical `left-0` on the mobile drawer (`GLO-2`; making it `start-0` also needs the
  slide direction reversed for right to left); `Notice`'s non-danger branch on the order
  page has no caller now; `celebrate`, `receipt` and the burst have no production caller
  by design (`SUC-5`), which is the line a reviewer may ask the owner to accept.

### Addendum — 2026-10-02 (ninth): a reel on copying, built as five laws, one primitive and a lint

**Requirement.** A reel of 2026-10-02 ("Copy needs proof") and the owner's words: the
copy icon flips to a check the instant the copy fires, no spinner, no delay; the check
holds about two seconds and fades back, never stuck, so the next copy gives a signal;
the raw value is copied, not the formatted span with its line breaks and zero-width
characters; a screen reader hears "copied" through a live region; on an insecure origin
the clipboard call fails without a word, so fall back to a copy command. "A silent button
lies." **Reason.** The only copy action in the product (`SecretOnce`, on both API-key
pages) did not meet them: its "Copied" stayed for ever, it had no icon, it announced a
failure but not a success, and it had no fallback, so on a plain-HTTP origin
`navigator.clipboard` was `undefined`, the click threw a `TypeError`, and the button said
the browser blocked copying although the copy command would have worked. The bank
account number and IBAN on the order page, which a customer has to type into a banking
app, and the tracking number had no copy action at all. **Outcome.** One primitive that
proves its result, one function that is the only code to touch the clipboard, and a lint
that keeps it so. **Verification.** Commands and browser runs below.

**What was built.**

| Piece | Where | What it does |
|---|---|---|
| `CPY-1` to `CPY-5` | `docs/design/components-states/03-components.md`, "CPY · Copy" | the flip is the receipt, two seconds then back, copy the raw value, say it aloud, fall back then fail out loud |
| `BRAND.feedback` | `packages/shared/src/brand.ts` | `copiedHoldMs` 2 000 and `copyFailedHoldMs` 4 000, so a deployment retunes them in one place |
| `copyText`, `normalizeCopyValue`, `nextCopy` | `apps/web/src/lib/copy.ts`, 32 specs in `copy.spec.ts` | the async API, then the copy command from a scratch field inside the open `dialog`; the invisible characters removed; the button's state machine |
| `CopyButton` | `apps/web/src/components/ui/copy-button.tsx` | `icon` and `labelled` variants; stacked faces; an always-mounted `role="status"` region; renders nothing for an empty value |
| `check-clipboard` | `scripts/check-clipboard.mjs`, in `pnpm lint`, 20 self-test cases | fails `navigator.clipboard` or `execCommand('copy'|'cut')` anywhere in `apps/web/src` and `apps/pos/src` except `lib/copy.ts`; no baseline, because nothing was left to grandfather |
| Specimen | `/admin/design-system#controls`, "Copy" | both variants, a paste field, and a selector that makes the page's clipboard behave like an insecure origin or a blocked one |

Adopted on: `SecretOnce` (so both API-key pages), the bank account number and IBAN, and
the tracking number on the storefront order page. Laws total 192 (187 and five).

**Parameters.**

| Parameter | Exact value | Applies to | Why this number | Where enforced | How it degrades |
|---|---|---|---|---|---|
| Success hold | 2 000 ms | the check | the owner's "about two seconds": long enough for the eye to come back from the place the value is pasted and still find the answer, short enough to be a copy button again before a second copy is wanted | `BRAND.feedback.copiedHoldMs`, read as `COPIED_HOLD_MS`, timer in `CopyButton` | returns to idle; a repeat copy restarts it; measured 2 001 ms |
| Failure hold | 4 000 ms | the failure icon and sentence | twice the success hold, because it carries a sentence to read and act on; it equals the toast default | `BRAND.feedback.copyFailedHoldMs` | returns to idle; the person can press again; measured 4 001 ms |
| Flip to a result | `duration.instant`, 80 ms | the faces, transform and opacity | the press already takes 80 ms down; the flip must not feel later than the press | `Face` in `copy-button.tsx` | reduced motion collapses it to 0.01 ms and the state still shows |
| Fade back | `duration.normal`, 220 ms | the faces | slow enough to read as a fade, fast enough to be ready | as above | as above |
| Repeat pulse | `.pop`, `duration.fast` 140 ms, once, only from the second copy in a hold | the check or failure face | a first copy already has the flip; only a repeat needs something new | `Face` (`pulse > 1`) | reduced motion shows no new frame; the repeat is still announced and still restarts the hold |
| Target size | 44 px below `fold` (672 px), 40 px from it | the icon variant | the house touch floor and `control-md`, as `.btn` | `min-w-touch`, `fold:min-w-control-md` | measured 44.0 and 40.0 at the seven widths sampled |
| Scratch field | fixed, 1 px by 1 px, opacity 0, `1rem` type | the fallback | it must be in the viewport (iOS will not select what is not) and 16 px type stops iOS zooming to it | `copyByCommand` | removed in a `finally`, focus and selection restored |
| Invisible characters removed | U+00AD, U+061C, U+200B to U+200F, U+202A to U+202E, U+2060 to U+206F, U+FEFF (written as escapes in `copy.ts`) | the value | what a formatter or an hyphenator adds and a terminal does not ignore; U+061C is the Arabic letter mark that ICU puts around numbers in right-to-left text, which Urdu ships | `normalizeCopyValue` | an all-invisible value is empty and copies nothing |
| Clipboard calls outside `lib/copy.ts` | 0 | `apps/web/src`, `apps/pos/src` | a second call site is a second implementation of five laws | `check-clipboard` | the build fails with `file:line` |

**Decisions made without the owner, all reversible.**
- The flip follows the write's result, not the click. A check shown on the click would be
  wrong whenever the copy then failed, which is the lie the reel is about. The write
  resolves in milliseconds (the flip was measured 11.4 ms after the click), so there is no
  pending state to show.
- The labelled variant shows "Copied" as its visible word for the hold, while its accessible
  name stays "Copy" (`aria-label`). For that two seconds the visible word is not in the
  name (WCAG 2.5.3 Label in Name); the idle word is.
- `CopyButton` renders nothing for a value that is empty once the invisible characters are
  gone. A copy button that cannot copy is worse than none.
- The failure icon is the same colour as the label: the sentence beside it is red, and the
  shape differs, so the failure never rests on colour alone, and a red icon on the
  outlined button's accent hover fill would have been unreadable.
- On the order page the label sits above a copied value instead of beside it. Side by side,
  a 24-character IBAN plus a 44 px button wrapped to a stray "02" at 1280 and pushed the
  card 74 px past the viewport at 280. The first run of the browser check found it.
- `normalizeCopyValue` strips the zero-width joiner and non-joiner. They are spelling in
  prose, so the function says in its comment and in `CPY-3` that it is for identifiers and
  codes. A caller with prose would need a different function.
- The specimen's selector replaces `navigator.clipboard` and `document.execCommand` with
  own properties while "Insecure origin" or "Blocked" is chosen, and deletes them on any
  change and on unmount. It is on the design-system page only, which needs an admin session.

**Not adopted, and why.** Other identifiers a person may need to copy (an admin order
number, a payment reference, an invoice number) were not changed: each is a one-line
adoption of `CopyButton` and none was asked for, and the lint already stops anything
else from copying a different way. `apps/mobile` has no DOM clipboard and would use
`expo-clipboard`, which is its own decision.

**Failure modes.** *Insecure origin:* `navigator.clipboard` is `undefined`; the copy
command runs inside the same click with nothing awaited before it, so the browser still
counts it as the gesture. *Refused:* the async call rejects and the command is tried after
it. *Open modal:* everything outside a modal dialog is inert, so the scratch field goes
inside the dialog that holds the clicked button. *Nothing works:* the failed state, a
sentence naming the remedy, `onFail` (the secret's field is selected), 4 000 ms. *Double
click:* the hold restarts and the region announces again, with no server write to repeat.
*A secret on the clipboard:* a clipboard manager may keep it; that is inherent in copying a
secret the person asked to copy, and the notice above it already says it is shown once.

**Verification.** Run on the final tree, after the last edit.

- `pnpm lint` exits 0 and now includes `check-clipboard` (511 files scanned, 0 clipboard
  calls outside `lib/copy.ts`; `--self-test` 20 cases) and `check-rules` (10 rule files, 4
  skills, 116 law citations, all resolve against 192 laws). The matcher was also run
  against the old `SecretOnce` from `HEAD` and flagged its `navigator.clipboard` call at
  line 48. The first `pnpm lint` on this change failed, correctly: `check-frontend-secrets`
  read the specimen's example secret `sk_live_51Hx9Example0000` as a Stripe-style key, so the
  example is now `key_example_7Hx9Qa2Lm04Zt`.
- `pnpm typecheck` exits 0 (10 tasks); `apps/mobile` `tsc --noEmit` is clean.
- Tests: web 542 passed (19 files; the new `lib/copy.spec.ts` adds 32: the invisible
  characters, the API, the refusal fallback, the missing API, the synchronous fallback, the
  dialog host, cleanup after a throw, every failure, the state machine, the reset on a
  value change, `selectContents` and the hold lengths); shared 407 (3 new, for `BRAND.feedback`); pos-core 28. Adding an `await` before
  the copy command in `copyText` makes the "nothing awaited before it" spec fail, so the
  spec has teeth; the change was reverted. The root `pnpm test` was not re-run: it exits 1
  at baseline for the API suites that need Postgres and Redis, and no API file changed.
- `pnpm index` and `pnpm index:check` exit 0 (218 pages). `next build` of `apps/web`
  passes on the final tree (rebuilt after the last code edit).
- The four greps in `CLAUDE.md` against `HEAD`: inline `style={{` 27 and 27,
  `toLocaleString` 6 and 6, bare `fetch` 6 and 6, `text-gray` and `bg-gray` 0 and 0.
- Browser, Chromium against the production build on the final tree, 96 checks, none failing:
  - The specimen, 59 of 59: the flip lands 11.4 ms after the click and no `.spinner` ever
    appears; the clipboard holds the raw account number and IBAN while the page displays
    them with spaces and zero-width characters, and pasting into a field gives the raw
    value; the check holds 2 001 ms and the copy icon is back after the fade; a second
    copy inside the hold replays `.pop`, restarts the clock (idle came 2 s after the second
    click) and is announced twice; the accessible name never changes; the region is
    `role="status"`, mounted and empty before the click; Enter and Space copy, focus stays
    on the button and shows a 2 px ring; the labelled variant shows "Copied" while its name
    stays "Copy"; with the API removed the copy command takes over and the secret pastes
    back; blocked, the state is `failed`, the sentence is visible and announced, the
    secret's field is selected, the label does not say "Copied", and it returns after
    4 001 ms; under reduced motion the fade is 0.01 ms and the state still shows and
    returns; the icon button is 44.0 px at 280 and 380 and 40.0 px from 768; no overflow and
    the card inside the viewport at 280, 380 (dark, and right to left), 768, 1280 (dark)
    and 1536; a field on the body cannot be focused while a modal is open and one inside
    the modal can (the premise of the dialog rule, measured); no console or page errors.
  - A real insecure origin, 7 of 7: the container's own address over plain HTTP
    (`isSecureContext` false, `navigator.clipboard` undefined). The old bare call threw a
    `TypeError` there; the button copied through the command and the secret and the raw
    IBAN pasted back; no scratch field was left behind.
  - The storefront order page with the API answered by network mocks, 30 of 30, in English
    and Urdu: each of the three buttons exists once, copies the stored value and says
    "Copied" (in Urdu, its own words); a shipment with no tracking number has no button;
    the tracking line still reads "TCS · TRK-0042"; nothing inside `main` spills past the
    viewport at 280, 380, 768 and 1280; with the clipboard blocked the failure sentence
    shows inside the card at 280, 380 and 1280 and the value's text is selected for a hand
    copy (at 280 the IBAN stays on one line, the button wraps below it and the sentence
    below that). These scripts are one-off and are not in CI.
- The `ux` agent followed `/ux-review` cold on the uncommitted diff, as in the previous
  addendum. Verdict: Ship, with two S2 findings and several S3, and the browser runs above
  were repeated after the fixes. S2, both fixed: the invisible-character class in
  `copy.ts` had been written as literal invisible characters, which is the hazard `CPY-3`
  names (an editor that strips them breaks it silently; the same was true of the
  spec's fixtures), and it missed the Arabic letter mark U+061C that ICU puts around
  numbers in right-to-left text, the soft hyphen and U+206A to U+206F, so it is now escapes
  with those added and a spec for each; and in a narrow card a failure sentence would
  have squeezed the IBAN, so the row now wraps the button and the sentence below the value.
  S3, fixed: the order page's rows select their text when the copy fails (the sentence
  tells the person to select it), a change of `value` resets a check that stood for the old
  one, the scratch field's `16px` is `1rem`, `CPY-5` said "off screen" where the field is
  in the viewport, and the tracking number is `dir="ltr"`. S3, kept: the failure is a
  polite `status` (a failed copy the person just asked for is not urgent and the sentence
  is visible); no test renders the component (there is no harness, already named); and
  while the specimen's failing mode is chosen every copy button on that page fails, which
  is the point of it and only that page has any.

*Not verified:* Firefox, WebKit and Safari (Safari only honours the write inside the
gesture, which the code allows for and which was not measured); real screen-reader speech
(the region's text and the accessibility name were read, not heard); the copy command
inside a real open modal (the premise was measured and the path is unit-tested with fakes,
but no screen has a copy button inside a dialog to click); the admin API-key page in a
browser (it needs an admin session, so `SecretOnce` was seen through the specimen's
labelled variant and by type and build); a high-contrast or forced-colours render; the
Urdu strings (they need a native reviewer).

**Scope lenses.**
The actor, the principal with no permission key, the grant that ends itself, whose rows
and columns, the threshold, the toxic pair, authority and blast radius, audience: n/a, no
actor, grant, row, permission key or message is created; the button copies a value the
page already shows to the person looking at it, and every adopter renders it under the
permission it already required.
Request or record: the copy is a REQUEST the browser may refuse, and the button says so
when it does; no server write is made.
The movement with no address, four hours down, the money lenses (posting rule, columns,
period, second legal entity, dry run, click the number): n/a, no stock, cash or journal
line is read or written.
The three silhouettes and the absent collaborator: the lint and the laws read no
deployment setting; the clipboard API is the one collaborator that may be absent, and the
copy command and then the failed state are what is recorded and shown instead.
The second copy of the write: a second click inside the hold is the case, and it restarts
the clock and is announced again (`nextCopy` counts it; `lib/copy.spec.ts`).
The hundred-thousandth row: n/a, no list; a page has a handful of buttons.
The adoption test, the reversal document, the undo fan-out, the version stamp, the
erasure the ledger cannot obey: n/a, no number, document or personal datum is created.
The failure path: inline, in the control, and nothing is stored, because a copy that
failed has nothing to replay but another click.
Reachable: `/admin/design-system#controls`, in the page's section nav; the order page's
bank and tracking rows; both API-key pages; `CopyButton` in `components/ui/index.ts` and
the "Use what exists" table in `.claude/rules/ui.md`; `check-clipboard` in `pnpm lint`.
No new permission key.

**Separable work orders, named and not built.**
- *Other identifiers.* Adopt `CopyButton` on the admin order and invoice numbers and
  payment references where an operator pastes them elsewhere.
- *A mobile copy primitive* on `expo-clipboard`, with the same five laws.
- *The browser checks in CI.* The runs above are one-off scripts, like the earlier
  addenda's; the web app has no component test harness (already named above).
- *A native review of the Urdu strings* written for the order page.

**Noticed, not changed.** The storefront header's Search and Language buttons end 25 px
past a 280 px viewport (`scrollWidth` 305) on the order page with and without any copy
row, so a storefront page scrolls sideways at the narrowest width. It predates this
change and was left alone. `pnpm check:overflow` is the check that would report it, and
it has not been able to run since CI stops at Apply migrations.


### Addendum — 2026-10-02 (tenth): a button is never round

**Requirement.** The owner, 2026-10-02: "Never use rounded buttons." **Reason.** `PER-3`
already said a pill is a status and nothing else may be one, but nothing checked buttons
and `rounded-full` was deliberately left alive in `tailwind.config.ts` for circles, so
the storefront kept hand-rolled circular icon buttons beside `.btn` and `.icon-btn`,
which already take the house corner. **Outcome.** One button shape, written into the law
that was already there and held by a lint. **Verification.** Below.

**What was built.**
- `PER-3` gained the sentence: a button, link-as-button or icon button wears the house
  corner (`.btn`, `.icon-btn`, `rounded`, which resolves to `--radius`); circles are for
  avatars, dots, spinners and count badges. No new law ID, so the 192 stays 192.
- `check-tells` gained the tell `round-button` (web and POS, `.tsx` and `.css`): a
  `rounded-full` or an arbitrary 999px or 50% radius in the attributes of a `<button>`,
  `<a>`, `<Link>`, `<summary>` or `…Button` component, or in a `.btn…` / `.…-button` rule.
  It walks back from the class to its tag, so a round dot inside a button is not a hit.
  113 self-test cases (109 before).
- 18 lines changed from `rounded-full` to `rounded`: 16 in the web app (dialog close,
  locale switcher, both mobile-menu buttons, header search, bottom-nav item, grid toggle,
  cart badge link, product quick view, three quantity and remove buttons in the cart, the
  product page's two steppers and colour swatches, the design-system dialog specimen) and
  2 in the POS till (the "pending, retry" and "parked" buttons, which were pills). On
  mobile, `theme.radius.pill` became `theme.radius.sm` on the two pressable chips
  (`ui.tsx`, the catalogue filter). Sizes, hover and transitions are untouched.

**Parameters.** No new number. The corner is the existing `--radius`, 2 px (`sharp` in
`THEME_RADII`). The one baseline entry is `switch.tsx`: 1, a ratchet that may shrink and
may not grow, enforced by `check-tells` in `pnpm lint`; a fifth hand-rolled circle fails
the build with `file:line`.

**Decisions made without the owner, all reversible.**
- "Rounded" is read as a circle or a pill, not the 2 px house corner the owner kept on
  2026-10-02.
- `Switch` keeps its pill track and round thumb: it is `role="switch"`, an input holding a
  state, and the pill is what makes a switch read as one. It is the single baseline entry.
- Product colour swatches are `<button>`s, so they became squares with the house corner.
- Count badges, avatars, dots, spinners, progress bars and wizard step dots stay circles:
  none is a button.

**Failure modes.** The lint misses a class assembled from parts, one held in a constant
and passed in, a JSX element passed as a prop ahead of the class (`icon={<X />}`), and
React Native styles, where the two chips were fixed by hand and `theme.radius.pill` is
still used by the wizard dot and the stage-rail bar, which are not buttons.

**Verification.** Run on the final tree. `pnpm lint` exit 0 (`round-button` 1 found, 1 in
the baseline; 118 law citations resolve to 192 laws); `pnpm typecheck` exit 0 (10 of 10
tasks); mobile `tsc --noEmit` exit 0; web 542 tests; `node scripts/check-tells.mjs
--self-test` 113 cases; the four `CLAUDE.md` greps 27, 6, 6, 0, equal to `HEAD`. Before the
change the tell found 19 lines (18 plus the switch). In Chromium on the production build
at 380 and 1280 px: 416 buttons and links on the storefront home, cart and shop pages and
the design-system page paint corners of 0, 2 and 3 px only, none round; the 11 switches
on the design-system page are still pills; an injected `rounded-full` button is detected
and an injected `rounded` one is not. **Not verified.** The cart steppers and remove
button, the product quick view, the product-page steppers and swatches, the dialog close
button and the POS till buttons were not rendered (they need cart or product data, an
opened dialog, or the POS app), so those rest on the lint, typecheck and the one-line
diff; the two mobile chips were not rendered either.

**Scope lenses.** The actor through the money lenses, the scale lenses and the afterlife
lenses: n/a, no actor, row, permission key, write, number or document is created; the
diff changes a corner class on 20 existing controls. Reachable: every changed control is
where it was; `round-button` runs in `pnpm lint`. No new permission key.

**Separable work orders, named and not built.**
- *Unify the hand-rolled icon buttons on `.icon-btn`.* The 16 web sites keep their own
  sizes and hovers; only the corner changed.
- *A React Native check* for `theme.radius.pill` on a pressable.

### Addendum — 2026-10-02 (eleventh): a consistency pass over the whole design system

**Requirement.** The owner, 2026-10-02, holding a "Merge to main" instruction: "resolve any
conflicts in this design system, any inconsistencies, any flow break, any gap, any
duplication". **Reason.** Ten addenda in two days had each been correct when written and
none had re-read the others: a chapter still said "unbuilt" for a thing that was built,
two documents ruled differently on the same control border, a toast was written out
sixteen more times beside the shared one, and four checkers could print OK having read
nothing. **Outcome.** The documents say what the code does, the duplicated or unreachable
pieces are removed or ratcheted, the flow breaks found are fixed, and everything that is a
real choice is listed below for the owner instead of being decided. **Verification.** Below.

**What was built.**
- *Documents made to agree with the code* (12 chapters and the README under
  `docs/design/`, both rule files, two skills, `CLAUDE.md`). Counts and "unbuilt" claims now match the generated
  index (43 primitives, all 8 token groups built, `check-contrast` built, 5 of 10
  integrity checks built, 278 screens); `ACC-4` is the one statement of the touch-target
  rule (44 below `fold`, 48 on the POS, pointer sizes from `fold`); `PER-3` says a status
  is `Badge` and `.pill` is a count chip; `PRM-2` says a role-grantable action is
  disabled with a reason on focus and touch and an irrelevant one is not rendered;
  `SUC-3` says which row a screen belongs to and what is adopted; `MOT-5` names the new
  `layout-motion` tell; `ITG-9` is scoped to what binds today. `ui.md` gained the
  primitive rows it lacked and names the two known conflicts (below) instead of hiding
  them.
- *Flow breaks fixed.* The four customer auth pages (verify email, unsubscribe, reset
  password, forgot password) said what happened and not what to do next (`FLO-7`); each
  now states its remedy (resend the verification email through the new
  `resendEmailVerification` in `customer-client.ts`, ask for a new reset link, change the
  preference from inside the account), with every string in `messages/en.json` and
  `ur.json`. `ConfirmDialog`'s typed-name field kept the last
  name typed when the dialog reopened, so a second delete arrived already unlocked: it
  now resets on open. `Dialog` handed focus back to an opener that a confirmed delete had
  removed, which dropped it on `<body>`: it now lands on the page's `<main>`, which draws
  no ring (a `:focus-visible` rule in `globals.css` for `main[tabindex='-1']`).
- *Duplication removed.* 16 admin files wrote their own toast markup beside the shared
  one and now render `ToastStack`; the order-status transitions were written twice and
  are now `constants/order-transitions.ts`, imported by the orders list and detail pages;
  the toast and upload-tray lifetimes were two separate `4000`s and are now one
  `BRAND.feedback.toastMs`. The two pre-Recharts charts have newer twins of the same
  name; they are marked SUPERSEDED and `check-chart-imports` holds their importers to the
  3 that exist (a ratchet).
- *Checks that could lie, fixed.* `check-tells`, `check-menus`, `check-clipboard` and
  `check-danger` now exit 1 when they scanned 0 files (a moved folder used to turn them
  all green). `check-contrast` now reads `@apply` statements, so the house classes
  (`.btn`, `.field-input`, `.notice`, `.chip`) are measured, which is what moved its
  baselines. `check-tells` gained the tell `layout-motion` and the round-button tell now
  sees a bare `<Button className="rounded-full">`; its self-test is 124 cases (113
  before) over 10 tells (9 before). The index generator reads barrel imports
  (`components/ui/index`), so component usage counts are real, and it now writes the
  primitives table and the two lists the ledger below leans on.
- *Small code fixes.* The storefront nav underline grows with `scale-x` and not `width`;
  `.eyebrow` and `.table-flat thead th` text went from 45% to 60% so they clear the floor;
  the POS button and field corners match the house corner; `Badge`'s docstring says what
  `StatusBadge` adds.
- *Gaps filled.* `/admin/design-system` shows the page-level pieces it had not: header and
  titled regions, the section rail, the filter bar with its skeleton and its empty result,
  page enter, in-place text change and the revealed board
  (`page-structure-specimens.tsx`), each the real component.

**Parameters.**

| Parameter | Exact value | Applies to | Why this number | Where enforced | How it degrades |
|---|---|---|---|---|---|
| `BRAND.feedback.toastMs` | 4 000 ms (unchanged) | a toast that gets no explicit `duration`, and the upload tray after everything succeeded | about twelve words read in 2 to 3 s plus a second to notice it; equals `copyFailedHoldMs`, which also carries a sentence | `hooks/use-toast.ts`, `lib/upload-queue.ts`; `theme-radii.spec.ts` | `duration: 0` stays until dismissed; a failure never hides on this timer |
| `layout-motion` baseline | 1 file: `stitching-panel.tsx` | `transition-[…]` or `transition:` naming a box-changing property, web and POS | the one site is a `max-height` accordion that needs a `Disclosure` rebuild | `check-tells` in `pnpm lint` | a second site fails the build with `file:line`; a fixed site fails until removed from the baseline |
| Superseded-chart importers | 3 files | imports of `components/admin/funnel-chart` or `gauge-chart` | moving them changes what finance and the analytics blocks look like | `check-chart-imports` in `pnpm lint` | a fourth importer fails; a moved one must leave the list |
| Contrast baseline, light | 52 uses (was 43) | colour pairs below their floor | 43 plus 3 in the stylesheet's dividers plus 6 control outlines newly readable through `@apply`: the scope grew, not the debt | `check-contrast` in `pnpm lint` | may shrink, may not grow |
| Contrast baseline, dark | 42 uses (was 39) | the same, dark theme | the 3 stylesheet dividers; the 6 outlines clear the floor in dark | `check-contrast` | same |

**Decisions made without the owner, all reversible.**
- Where a document and the code disagreed, the document was changed to match what was
  measured, except where the document is a rule (`ACC-4`, `PER-3`, `PRM-2`), where the
  rule was kept and the gap is listed.
- The four auth pages' remedy copy and their Urdu strings were written here and are not
  reviewed by a native speaker.
- The 16 toast sites render `ToastStack` exactly as the six before them did, so each gains
  the timer line and the exit the shared one has.
- `Dialog`'s focus fallback is `<main>`, not the nearest heading or the list's first row.
- The unused `components/common/toast-container.tsx` and the 10 primitives no product file
  imports (`Skeleton`, `SkeletonText`, `SkeletonRegion`, `Switch`, `CooldownBanner`,
  `MultiSelect`, `ProgressRing`, `TypeText`, `Bento`, `BentoTile`) were marked and listed,
  not removed: removing a file needs the owner's word.

**Open for the owner (named, not decided).**
1. *The seven screens.* The law names widths 280, 380, 640, 768, 1024, 1280, 1536; Tailwind
   prefixes are 380, 640, 672 (`fold`), 768 and up, so 640 to 767 has no single meaning.
   The mapping is documented, not renamed, and the sweep of 672 to 767 is not done.
2. *Control borders.* Six house-class outlines sit at 1.54:1 to 1.72:1 against the 3:1 floor
   (WCAG 1.4.11) while `ui.md` says controls take `border-neutral-200`: one of the two
   gives way.
3. *Pointer sizing.* Key `.btn`, `.icon-btn`, `.chip` and `.btn-text` to
   `@media (pointer: fine)` and not to `fold`, so a 700 px touch tablet gets touch sizes.
4. *`.btn-text` uppercase and the `.icon-btn` blur, frosted and ping patterns*, which
   `check-tells` does not yet read.
5. *Red and green.* The mobile app (`#b91c1c`), the web (`#B42318`) and the email palette
   are three reds.
6. *Admin and POS words.* 0 of 246 admin `.tsx` files and 0 POS files call a translation
   function; 62 of 94 storefront files do. Decide whether admin and POS are meant to be
   translated.
7. *`/admin/design-system` is reachable in production.*
8. *Adopt or cut* the 10 primitives and the one file above.
9. *Migrate the 3 legacy chart importers*, a visible change; the net-margin gauge has no
   goal to show.
10. *Gate `pnpm format:check`*, red repo-wide at baseline and in no gate today.
11. *The chart palette and heatmap* against the contrast floors; *terminology word
    choices* the table does not settle.
12. *The stitching accordion* (`max-height` 0 to 4 000 px, which also leaves a collapsed
    control reachable by Tab).
13. *Older items still open:* the milestone ledger; the open redirect through `?next=` on
    register and login; `FileInterceptor` limits on the API; `upload-rules.ts` written
    twice; `Switch` pill and square swatches; the dead `.chart-line` and `drawLine`; a
    React Native round-button check; motion tokens on mobile and the POS.

**Adoption-debt ledger** (a count that exists so it can shrink; none is a regression from
this pass; measured on the final tree with `git grep` over `apps/web/src`, line-based,
so each is approximate to a few sites).
- Forms: 56 files hold a `<form`, 2 of them use `Field` and none uses `FormStack`.
- Menus: 75 native `<select` in 50 files against 42 `<Select` elements.
- Page headers: 75 files write their own `<h1`; 148 files use `PageHeader`.
- Browser dialogs: `confirm()` 7 call sites, `prompt()` 38 in 11 files, `alert()` 1.
- Empty states: 96 `EmptyState` elements, 25 with an action (`ITG-1` wants a way out).
- Confirmations: 38 files raise a toast, 7 use `SuccessState`.
- Formatting: 6 `toLocaleString` or `toLocaleDateString` uses; 7 files build a `FormData`
  by hand beside the upload queue.
- Not re-counted here and so not quoted: hand-rolled icon buttons, `DataTable` empty and
  loading states, a toast action for undo, `Button` `blockedBy` (about 45 sites hide an
  action outright), `ErrorState`, drawers and scroll lock, fonts, mobile contrast and
  literals, POS error notices.

**Failure modes.** `check-contrast` still cannot see a colour assembled at run time or a
surface it cannot know without a render. `layout-motion` misses a transition set from a
constant or a style object. The index's usage counts follow imports it can resolve; a
component reached by a name it cannot see appears unused. The new specimens are not
visual-regression tested (there is none).

**Verification.** Run on the final tree. `pnpm lint` exit 0 (turbo 9 of 9 tasks; contrast 52 light and 42 dark
known-below-floor uses, both within baseline; `check-tells` within baseline with `layout-motion` 1 and
`round-button` 1; chart imports OK with 3 baselined importers; 126 law citations resolve to 192 laws);
`pnpm typecheck` exit 0 (10 of 10 tasks); tests web 542, shared 408, pos-core 28;
`pnpm --filter @newax/web build` exit 0; `node scripts/check-tells.mjs --self-test` 124 cases; the four
`CLAUDE.md` greps 27, 6, 6, 0, equal to `HEAD`. In Chromium on the production build: the auth flows and the
three new specimen groups 14 of 14 checks, run four times, with 0 page errors in three runs and one React
hydration error (#418) in one; it did not recur in three further runs or in 48 loads of the eight changed
pages at 380 px, and that first run did not log which page raised it, so it is reported and not explained.
The dialog checks pass 7 of 7 with 0 page errors, and the same script against the old `ConfirmDialog`
failed the two reopen checks (the field still held the name and confirm was still unlocked), so the bug
was real before the fix and gone after it. **Not verified.** The API test suites on the final tree (they
need `DATABASE_URL` and Redis, which this environment lacks; 70 suites failed for that reason on the last
run); the `overflow` job (it needs the seeded stack); CI (red on every head at "Apply migrations" with
`extension "vector" is not available`, a database-image problem separate from this diff and awaiting the
owner's word); the Urdu wording by a native speaker; the 16 migrated admin pages rendered (they need the API
and a login, so they rest on typecheck and the shape of the diff); the POS corners rendered; and the new
specimens across the seven widths.

**Scope lenses.** The actor through the money lenses, the scale lenses and the afterlife
lenses: n/a, no actor, row, permission key, write, number or document is created. One
parameter moved into `BRAND`, value unchanged. Reachable: the specimens are on the
existing `/admin/design-system` page; every changed check runs in `pnpm lint`. No new
permission key, no migration.

**Separable work orders, named and not built.**
- *Bug found, not fixed:* the stitching panel's "save measurements" never saves (the
  request very likely fails API validation); it needs the API contract read and its own
  change.
- *One shared file walker* for the checkers, which each carry their own.
- *`check-tells` for `TYP-3` and `GLO-7`.*
- *Button `blockedBy`, a toast action (undo), `ErrorState` adoption* and the rest of the
  ledger above.

### Addendum — 2026-10-09 (twelfth): colour and life, a universal pass

**Requirement.** The owner, 2026-10-09: "deploy a universal, I need to check and apply some
better design, like shadow around the boxes, like full premium design I need, and apply some
colors to the icons, and like give the liveness to this project. It is right now a dull
project, only monocolor, but give the liveness to the project, give a soul to this project,
and I need full premium design, 100% premium design. Even if you need to change the UX UI,
change it, but I need full premium design." and, minutes later: "Add maximum motion effects,
maximum premium motion animations." **Reason.** The system was correct and calm and read as
dull: one accent, borders for edges, no colour on any glyph, motion only as feedback.
**Outcome.** A design-system-level change, so it reaches every screen that uses the shared
classes and primitives (admin, storefront, the Auction screens) without a per-page edit.
Nothing was deployed: this repository is a disconnected clone with no deployment, and
"deploy a universal" is read as "make it universal", not as a release.

**What this supersedes, said plainly.** Three earlier calls were right for the calm system
and are changed on the owner's instruction, each with a limit so the change cannot spread:
(1) "`.card` has no shadow; never a border and a shadow on one edge" becomes "a card's edge
is the first layer of its shadow", so there is still one boundary; (2) "no glow under the
primary button" becomes "a glow under the one loud button, and nowhere else"; (3) decorative
and ambient motion was rejected (`MOT-1`, `05-motion.md`) and becomes a third tier, ambient,
allowed only where the thing is itself alive (updating now, running out), on its own clock.
The corner (2 to 3 px) and "a button is never round" (`PER-3`) are untouched: the owner's
earlier rulings on both stand.

**What was built.**
- **Elevation, five steps** (`brand.ts` `elevation`, both themes): `flat`, `card`, `raised`,
  `overlay`, `modal`. `card`, `overlay` and `modal` start with a 1 px ring; `raised` does not.
  `.card`, `.card-lit` and `.metric-strip` are `border-transparent shadow-card`; `.lift` raises
  to `shadow-overlay`; the shell header, the lot photo frame and a selected thumbnail take
  `shadow-card` or `shadow-raised`. `shadow-glow` is derived from the accent fill
  (`accentGlow`) and sits under `.btn-primary` only.
- **Seven tones** (`colors.tone`, `colorsDark.tone`): `teal` (equal to the accent), `indigo`,
  `violet`, `rose`, `amber`, `emerald`, `sky`, each with a wash (the ink mixed into the
  surface), emitted as `--color-tone-*` and `[data-tone]` rules. `IconTile` puts a glyph on its
  tile; `lib/tone.ts` decides the tone, never the glyph, by the *kind of thing* a surface is
  (`KIND_TONE`: shop, selling, making, people, goods, money, movement, settings), so the sidebar's
  Orders group, the dashboard's Orders row and the launchpad's Sales app are one colour; 13 nav
  groups, 9 dashboard groups and 12 launchpad apps name a kind, and any other key falls back to a
  stable hash. Applied to the sidebar groups, every launchpad app, `PageHeader`
  (from the page's nav group, through `PageIdentityProvider`), `EmptyState`, `MetricStrip`
  items, the dashboard groups and the Auction admin and storefront screens.
- **Liveness**: `.live-dot` (a ring leaves the dot) on the lot page's "Live" line under the price
  and on the lot card's time; `.breathe` (a halo swells and fades) on the lot page's closing-soon
  badge only (the lot card has the dot, not the halo, so a grid of lots never breathes together); `CountUp` on dashboard
  figures and a `reel` on the lot's current bid; `RevealScope` (new `as` prop, so a list stays a
  `ul`) staggers the dashboard groups and the lot grid in; `.nav-rail` marks the active page.
- **Lean and glow**: `.lift.tilt` with `useTilt` / `TiltLink` leans a link-card toward a fine
  pointer; the icon tile inside tips and takes a glow; `.btn-primary` sweeps one highlight on
  hover; `.tone-hover` gives a bare storefront icon its tone on hover.
- **Lists**: `DataTable` sits on `.table-surface` (the `.card` surface, edge and corner), which
  steps aside by CSS inside a card, a dialog, a metric strip or another surface, and under
  `stacked` below `md`, so there is no box in a box; the "No outer frame" clause of the table
  rule is replaced by that, and "no vertical lines, no zebra, no `divide-*` on top of it"
  stands. `Badge` leads every tone but `neutral` with a 6 px dot in its own colour
  (`aria-hidden`; the word and the colour already say it). An empty `DataTable` shows the
  `EmptyState` tile and the caller's line instead of bare text.
- **Gallery**: `/admin/design-system` gained the Tones group in Colour, two tone rows in the
  contrast table (measured live, both themes), the elevation step `card`, and a "Colour and
  life" section with every piece above as the real class or component.
- **Docs**: `01-foundations.md` (elevation, Tones), `03-components.md` (`FRM-5`, `CRD-4`),
  `05-motion.md` ("The third tier: ambient"), `.claude/rules/ui.md` (the new primitives and
  classes, the card-edge rule).

**Parameters.** Every number, with why this one and not a smaller or larger one.

| Parameter | Exact value | Why | Where enforced | If it fails |
|---|---|---|---|---|
| `card` shadow, light | `0 0 0 1px rgb(18 17 17 / .06), 0 1px 2px 0 rgb(18 17 17 / .05), 0 6px 16px -6px rgb(18 17 17 / .1)` | the ring is the edge (6% ink reads as a hairline on `#f2f2f2` without a border colour); the two soft layers are the lift. A larger blur makes a grid of cards look like a cloud | `brand.ts` `elevation`, `theme-space.spec.ts` | the spec fails on a ring that is not the first layer, a fourth layer, or a ring on `raised` |
| `card` shadow, dark | `0 0 0 1px rgb(255 255 255 / .07), 0 1px 2px 0 rgb(0 0 0 / .5), 0 8px 20px -6px rgb(0 0 0 / .55)` | a dark ring on a dark page is invisible, so the ring is white at 7%; the black layers carry the secondary cue | same | same |
| `overlay`, `modal` | rings at 6% (light) and 8% (dark); blurs 32 px and 56 px | one step more blur per step more height; `modal` 30% ink is the strongest shadow in the system | same | same |
| Tone wash mix | 12% light, 16% dark | enough that the tile reads as a tile on `#fff`; dark needs 4 points more to leave the surface; each tone's glyph is 3:1 on its wash | `TONE_WASH_MIX` in `theme-tailwind.ts`, `theme-contrast.spec.ts` | the spec fails the build below 3:1 (glyph on wash), 3:1 (on the page), 4.5:1 (on the surface) |
| Tone ink (light) | teal `#0e8294`, indigo `#4f46e5`, violet `#7c3aed`, rose `#e11d48`, amber `#b45309`, emerald `#047857`, sky `#0369a1` | each is the darkest value of its hue that still reads as that hue next to the others; the weakest on its wash is 3.88:1 (teal) and 3.89:1 (rose) | `brand.ts`, `check-contrast` palette | same spec |
| Tone ink (dark) | `#3db8cb`, `#818cf8`, `#a78bfa`, `#fb7185`, `#fbbf24`, `#34d399`, `#38bdf8` | the 400 steps of each hue; all above 4.8:1 on the dark wash | same | same |
| `shadow-glow` | `0 8px 20px -8px` at 60% and `0 2px 6px -2px` at 40% of the accent fill | the negative spread keeps it under the button and off its sides; 60% is the strongest that does not tint the page | `accentGlow`, spec "glow is the accent's own colour" | spec |
| `motion.ambient.pulse` | 2 000 ms | slower than a resting heartbeat (about 1 s) reads as "still here", not "alarm"; 5 times the 420 ms interaction ceiling so it never reads as a reaction | `brand.ts`, `--motion-ambient-pulse` | the global reduced-motion rule ends every loop after one frame at its end state |
| `motion.ambient.breathe` | 3 600 ms | slower than the pulse because it is the louder cue; one cycle per breath at rest is about 4 s | same | same |
| Halo | 5 px ring, 30% of the tone, scale 1 to 1.1, transform and opacity only | visible at arm's length on a 20 px badge without leaving it | `.breathe::after` | none to fail: on reduced motion the ring is at opacity 0 |
| `motion.tilt` | 4 degrees maximum, 900 px perspective | at 4 degrees a grid of cards still reads as level; at 900 px the lean reads as a surface under the hand and not a 3D object | `tiltAngles` (clamped, unit-tested), `useTilt` | below `(hover: hover) and (pointer: fine)` or under reduced motion the CSS ignores the values |
| Tile tip | rise `distance.micro` (2 px), `scale.tip` 1.06, turn `tilt.tipDeg` 3 degrees counter-clockwise, 8 px glow at 50% | the smallest movement that reads as "this answers you" at 48 px; 6% is the most a 40 to 56 px tile can grow before its ring meets the card's padding; 3 degrees is one short of the card's own 4-degree lean so the two never read as one motion | `.icon-tile` rules, from `--motion-distance-micro`, `--motion-scale-tip`, `--motion-tilt-tip`; only under `.lift`, `a.group` or `button.group` | gated like the tilt: no hover or reduced motion shows the tile at rest |
| Button shine | a 34% wide, 22% white band, skewed -20 degrees, one pass over `sweep` (420 ms) | one pass is a flourish, two is a loop; 22% white lightens teal without whitening it | `.btn-primary::after` | RTL mirrors it (`--shine-sign`); reduced motion shows no band |
| Lot grid and dashboard reveal | the existing 80 ms stagger, capped at four steps, `arrive` over `slow` | not a new number: `RevealScope` as it was | `lib/reveal.ts` | no scripting, no observer or reduced motion shows everything at once |

**Decisions made without the owner, all reversible.**
- "Deploy a universal" is read as "make it universal"; no production or preview deploy exists
  to run, and none was run.
- Teal is both the accent and a tone, so the sidebar's overview group and the primary button
  match; a tone that equals the accent is not a second palette.
- Tones are on glyphs and tiles only, never text or status, so the contrast floor and the
  meaning of green and red are untouched.
- The house corner and "never round" stand, because the owner ruled on them twice; the reel's
  24 px cards were not adopted.
- No gradient surface, no glass, no blur: `check-tells` still counts them and the baseline did
  not move.
- The ambient loops are limited to two, each carrying state or attention; "maximum" is read as
  "everywhere it means something", not "everywhere".
- POS and the mobile app are untouched. Mobile does not read this stylesheet, and the POS has
  its own density rules; both are named below.

**Failure modes.** A tone chosen for a new nav group is a one-line edit in `lib/tone.ts`,
and a spec fails on two neighbouring groups sharing one. The ring in `shadow-card` is invisible
where a card sits on a surface of nearly the same lightness (a card inside a card): the rule
"never a box inside a box" still applies, and this pass added none. An old browser with no
`IntersectionObserver` shows everything at once. A browser with no `(hover: hover)` shows no
lean. A page with several `breathe` badges breaks the "one per screen" limit; nothing enforces
it today, so it is review.

**Found in the check, fixed.** The reel's digits are separate inline boxes, so in a
right-to-left line the first Urdu storefront use printed `52.657,2 Rs` for `Rs 2,756.25`.
`CountUp` now sets `dir="ltr"` on its visual strip (a figure reads left to right in every
language) and leaves the screen-reader copy to the page's direction. Seen and fixed in
Chromium on `/ur/auctions/lots/...` at 1440 px.

**Verification.** Run on 2026-10-15 against the tree this addendum describes.
- `pnpm typecheck` exit 0 (ten packages). `@newax/web` 711 tests in 29 files and `@newax/shared`
  472 tests in 27 suites pass. The API suites that touch this change (14 suites, 121 tests) pass
  on a freshly migrated and seeded database; six failed once on an old scratch database that
  predated a migration, which is the database's state and not the code's.
- Lint: `turbo run lint` (eslint, 0 errors, 0 warnings) and every `check:*` script exit 0,
  including `check:contrast` at its lowered baselines (42 to 39) and `check:tells` at an
  unmoved baseline; `check-tells --self-test` passes its 124 cases.
- The CLAUDE.md counts equal the tree before this change: 27 inline `style={{`, 6
  `toLocale*`, 6 bare `fetch`, 0 `text-gray-` / `bg-gray-`.
- A real-browser sweep of 127 admin and storefront routes found 67 surfaces and 0 nested boxes
  (a surface inside a surface). Tailwind's `shadow-none` leaves a transparent multi-layer
  `box-shadow`, not `none`, so the sweep counts a surface by its ring and not by the word.
- In Chromium, with `prefers-reduced-motion: reduce` every loop ends after one frame and
  nothing moves on hover; the lifted tiles, cards and buttons take a visible focus ring from the
  keyboard; the Urdu storefront prints the price left to right (the fix above).
- `pnpm --filter @newax/web build` exit 0, run after the last capture with the dev server
  stopped (the two share `.next`). Before and after captures at 1440 and 390 px, and the dark
  theme at 1440, are attached to the pull request thread.

**Scope lenses.** A design-system change, not a feature: no actor, row, permission key, write,
number or document is created. Reachable: every part appears on a screen a person already
opens, and `/admin/design-system#life` shows each as the real class or component. No new
permission key.

**Separable work orders, named and not built.**
- *The same pass on the POS till*, whose density and 48 px targets (`ACC-4`) need their own
  decision about what a shadow costs on till hardware.
- *The same pass on the mobile app*, which reads `theme` objects, not this stylesheet.
- *A check that fails a second `breathe` on one screen.*
- *The storefront home hero and product pages*, which take the card shadow through `.card`
  but have not had their own colour-and-life design.
