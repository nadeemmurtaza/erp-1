# 01 · Foundations

The token layer. Every visual value in the product resolves to something here,
and nothing here is picked because it looked right in one component.

> **Status: built, in two themes.** All eight token groups exist in
> `packages/shared/src/` — colour (light and dark), radius, type, space, size,
> elevation, layers and motion — each a thin view onto one source,
> `brand.ts`. `theme-tailwind.ts` turns them into the CSS both themes read, and
> `/admin/design-system` renders every token and
> component in the theme you are viewing. **Theming** below is the mechanism.
> What is still unbuilt is called out where it occurs — POS and mobile have not
> adopted dark mode, and the motion *spring* and *distance* values have no
> consumer yet.

## Why tokens and not values

House Rule 1 forbids a design literal in application code — no hex, no radius,
no type step at a call site. The reason is not tidiness: this codebase ships to
several clients, and one deployment serves one brand resolved at build time
(ADR-013). A literal is a value that cannot follow the brand. A token can.

The second reason is change: a token layer means refining the visual language
is one edit, not four hundred.

## Colour

Source: `packages/shared/src/brand.ts` → `BRAND.theme.colors` (light) and
`BRAND.theme.colorsDark` (dark). `theme-colors.ts` is a typed view of both.

**Rules**
- Never a hex in a component. `grep -ro "text-gray-[0-9]*\|bg-gray-[0-9]*" apps/web/src` must stay empty — a second grey is drift. The Tailwind palette is **closed** (`theme.colors` is replaced, not extended), so an unlisted colour generates no CSS at all: a visible bug, not a silent one.
- Container edges are `border-neutral-100`. Controls that must be findable get `border-neutral-200`. Nothing darker.
- Semantic before literal: a thing is `danger` because it is destructive, not because it is red.
- **Name a role, never a theme.** `text-neutral-900`, `bg-surface`, `bg-accent`: the class says what the colour is *for*, and the theme decides the value. No component asks which theme it is in, and there is no `dark:` variant in application code.
- **A fill that must stay a fill across the flip uses the inverse pair.** `bg-inverse text-on-inverse` (a selected chip, a count badge) — never `bg-neutral-900 text-white`, which reads 17.9:1 in light and 1.07:1 in dark because the ramp reverses and the white label does not.
- **A veil is `bg-scrim/NN`**, not `bg-black/NN`. `black` is not in the palette.
- **A floating surface** (menu, popover, dialog) is `bg-overlay`; a card is `bg-surface`; the page is `bg-neutral-50`. See Theming.

**Enforced.** `scripts/check-contrast.mjs` (run by `pnpm lint`) reads both
palettes from `brand.ts` and measures every stated pair and every painted
surface against WCAG 2.2 AA in **both** themes, each with its own baseline of
known debt. `packages/shared/src/theme-contrast.spec.ts` asserts every role
pair the dark palette promises, so editing a dark value that breaks a floor
fails a test rather than a screen.

## Typography

Source: `packages/shared/src/theme-type.ts` (41 lines — the most developed of
the three).

**Rules**
- A type step is a token, never a `text-[13px]`.
- Line height travels with the step; they are one decision.
- Long-form legal text has its own treatment (`.prose-legal`) and does not
  inherit UI type.
- Urdu needs a different font stack and different line height for the same
  step. Chapter 07.

## Spacing

Source: `theme-space.ts` → `BRAND.theme.space`. Tailwind's own spacing keys (`p-4`, `gap-6`) already land on this scale; the tokens are what `apps/mobile` reads.

A single scale, used for padding, gaps and section rhythm,
derived from one base unit rather than chosen per component:

```
space.0   0        space.5   16px
space.1   2px      space.6   24px
space.2   4px      space.7   32px
space.3   8px      space.8   48px
space.4   12px     space.9   64px
```

**Rules**
- A gap comes from the scale. `gap: 24px` is only legal because it is `space.6`.
- Spacing communicates grouping: related things share the smaller step,
  unrelated things the larger. Equal spacing everywhere says nothing.
- Section rhythm is one step, applied consistently down a page, not tuned per
  section.

## Size

Source: `theme-size.ts`. Utilities: `h-control-sm|md|lg`, `h-icon-*` / `w-icon-*`, `min-h-touch`, `min-h-touch-pos`.

Three control heights (`sm` 32 · `md` 40 · `lg` 48), three
icon sizes (16 · 20 · 24), and a single `container-page` max width, which
already exists as a class.

**Rule.** An interactive control is never smaller than the touch target
minimum in Chapter 07, whatever its visual size.

## Radius

Source: `packages/shared/src/theme-radii.ts`.

**Rule.** Radius is a family, not a per-component choice. A card, an input and
a button inside that card should read as the same material.

## Shadow and elevation

Source: `theme-elevation.ts`. Elevation is a small, ordered set — `flat`,
`raised`, `overlay`, `modal` — and each maps to exactly one shadow token
(`--shadow-*`, which differs per theme). Shadows are never composed ad hoc. The
stock names are mapped onto the four steps (`shadow`/`shadow-sm` → raised,
`shadow-md`/`shadow-lg` → overlay, `shadow-xl`/`shadow-2xl` → modal), so
existing call sites are on the system without an edit.

**Light says "higher" with a shadow; dark says it with a lighter surface.** A
shadow on a near-black page is invisible, so dark's `surface` and `overlay` are
each lighter than the last (`#171516` → `#242122`), and its shadows are pure
black at higher opacity as a secondary cue.

**Rules**
- **Never a border and a shadow on the same edge.** That is two boundaries, and
  it is already binding in `.claude/rules/ui.md`.
- `.card` has no shadow. `.lift` adds one on hover, when it means *this rose*.
- Elevation implies z-order: a thing that looks higher must also be higher.

## Z-index / layering

Source: `theme-layers.ts`. `theme.zIndex` is **replaced**, so `z-50` is not generated — a numeric z-index is now a build-visible bug. Named layers, never raw numbers:

```
z.base      0      content
z.raised    1      one step above its siblings (a card's stretched link, a gallery control)
z.raised-2  2      badges and the hover scrim inside a card
z.raised-3  3      a control that must stay reachable above the scrim (the wishlist heart)
z.sticky    10     sticky headers, the admin sidebar
z.dropdown  20     menus, popovers, comboboxes
z.overlay   30     drawer and dialog backdrops
z.modal     40     dialog surfaces
z.toast     50     notifications
z.debug     90     development only
```

**Rule.** A `z-index` literal in a component is a bug. If two things at the
same layer overlap wrongly, the fix is ordering or structure, not a bigger
number.

## Breakpoints

Source: `apps/web/tailwind.config.ts` → `screens`. These are Law 4's seven
screens and are **not** negotiable per component:

```
xs 280 · sm 380 · fold 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536
```

Law 4 says none may waste its space. Chapter 02 is how.

## Motion tokens

Source: `brand.ts` (`BRAND.theme.motion`), read by `theme-motion.ts`. Durations, easings, distances, scales and the stagger step are emitted as `--motion-*` custom properties by `staticVars()` and consumed by Tailwind (`duration-fast`, `ease-settle`), by the keyframes and animations in `tailwind.config.ts` and `globals.css`, and by the JavaScript that has to follow the same curves (`apps/web/src/lib/motion.ts`). A bare `transition-colors` resolves to `duration.fast` and `easing.standard` (Tailwind's own 150 ms default was a number nobody chose). **Springs and `distance.medium` have no consumer yet** — they are defined for the day `framer-motion` is used more than once.

Chapter 05 defines the language; these are its values.

```
motion.duration.instant   80ms    state that should feel like nothing happened
motion.duration.fast      140ms   hover, focus, press
motion.duration.normal    220ms   panels, disclosure, tab change
motion.duration.slow      320ms   full-surface or route-level change
motion.duration.sweep     420ms   the button fill sweep

motion.easing.standard    cubic-bezier(0.2, 0, 0, 1)
motion.easing.emphasized  cubic-bezier(0.2, 0, 0, 1.2)
motion.easing.exit        cubic-bezier(0.4, 0, 1, 1)
motion.easing.decelerate  cubic-bezier(0.22, 0.61, 0.36, 1)
motion.easing.settle      cubic-bezier(0.16, 1, 0.3, 1)   leaves fast, finishes slowly, never overshoots

motion.spring.snappy      stiffness 400, damping 32
motion.spring.soft        stiffness 260, damping 30
motion.spring.gentle      stiffness 180, damping 26

motion.distance.micro     2px     press, nudge
motion.distance.small     8px     hover lift, tooltip offset
motion.distance.medium    24px    panel and drawer entrance
motion.distance.large     64px    route or section transition, side sheet
motion.distance.nudge     4px     the invalid-field shake, the card lift

motion.scale.press        0.98    pressed control
motion.scale.arrive       0.97    arriving and leaving surfaces
motion.stagger.step       80ms    delay between peers
motion.stagger.steps      4       the cap: peers after the fourth share one delay
```

`settle`, the two scales, `nudge` and the stagger were measured off a
reference reel (chapter 05, "The reel"). Tests in `theme-space.spec.ts` pin the
ranges: `settle` never overshoots, `press` is under 1 and over 0.95, `nudge` is
under `small`, and the whole stagger ramp fits inside one `slow` duration.

**Rule.** A component consumes a token. A duration written into a component is
the thing this layer exists to prevent — refining the motion language must be
one edit, not a hundred.

## Theming

**The mechanism.** A theme is the `data-theme` attribute on `<html>`
(`light` or `dark`). `createThemeTailwind()` in `packages/shared/src/theme-tailwind.ts`
emits every colour as a custom property (`--color-neutral-900`, `--color-surface`,
`--shadow-raised`, …) under three scopes — `:root` (light, the default),
`[data-theme='light']` and `[data-theme='dark']` — and Tailwind generates
`rgb(var(--color-…) / <alpha-value>)` utilities, so `bg-neutral-900/60` works
in both. There is no `dark:` variant in application code; `darkMode` is
configured only so a third party's `dark:` classes follow the same attribute.

**The preference** is `light`, `dark` or `system` (follow the device, the
default). `themeInitScript()` (`theme-runtime.ts`) is inlined in `<head>` by
`ThemeInitScript`, so the attribute is set before first paint: no flash of
white for anyone who chose dark. If storage throws, `matchMedia` is missing or
the script itself fails, the stylesheet's `@media (prefers-color-scheme: dark)`
fallback still gives the right theme. `useTheme()` and `<ThemeToggle>` are the
only client pieces; the choice is stored in `localStorage` (`newax.theme`) and
follows across tabs.

**Fill and ink are different colours in dark.** The brand teal cannot be both
dark enough for a white label (4.53:1) and light enough to read as a link on a
dark surface (the fill is 4.02:1 there; the ink that clears it gives a white
label 2.36:1). So `bg-accent` is the same fill in both themes (`#0e8294`, white label
4.53:1), while `text-accent`, `border-accent` and `ring-accent` resolve to the
**ink** (`#3db8cb` in dark, 7.72:1 on the surface). The same split applies to
the status hues: their washes (`bg-red-50`…`200`) and ink (`text-red-600`…`900`)
follow the theme, while solid fills keep their stock value. The dark half of a
hue is derived, not picked (`darkHueScale`): washes are the hue's 500 mixed
into the surface at 10/16/26/40 %, ink is taken from the light end of the
scale, and lightness is reversed but hue is not.

**Pinned regions.** An element with `data-theme="light"` (or `"dark"`) holds one
theme whatever the page is in. Use it where the ink was chosen for a fixed
surface: a label over a product photograph, the announcement bar, the footer, a
diagram canvas. Tailwind's `dark:` would not do this; the scoped custom
properties do, because a descendant reads the nearest scope. `check-contrast.mjs`
judges a pinned region only against the theme it holds.

**The roles, measured** (WCAG contrast; floors: 4.5:1 text, 3:1 a control's
boundary and a chart mark):

| Role | Token / class | Light | Dark |
|---|---|---|---|
| Page | `bg-neutral-50` | `#f2f2f2` | `#0c0b0b` |
| Surface (cards) | `bg-surface`, `bg-white` | `#ffffff` | `#171516` |
| Overlay (menus, dialogs) | `bg-overlay` | `#ffffff` | `#242122` |
| Inverse fill / its label | `bg-inverse` / `text-on-inverse` | `#121111` / `#ffffff` | `#f9f7f8` / `#121111` |
| Veil | `bg-scrim/NN` | `#121111` | `#000000` |
| Strong text on the page | `text-neutral-900` | 16.84:1 | 18.43:1 |
| Strong text on a surface | `text-neutral-900` | 18.85:1 | 17.04:1 |
| Strong text on an overlay | `text-neutral-900` | 18.85:1 | 14.96:1 |
| Link on a surface | `text-accent` | 4.53:1 | 7.72:1 |
| White label on the brand fill | `bg-accent text-white` | 4.53:1 | 4.53:1 |
| Label on the inverse fill | `bg-inverse text-on-inverse` | 18.85:1 | 17.67:1 |
| Positive / negative on a surface | `text-feedback-*` | 5.37 / 6.57:1 | 8.75 / 7.96:1 |
| Icon and disabled ink | `text-neutral-400` | 3.34:1 | 5.30:1 |
| Chart series 0 on a surface | `chart-0` | 4.53:1 | 6.28:1 |
| A control's outline | `border-neutral-200` | **1.72:1** | 3.44:1 |

The last row is a known gap, not a pass: light's outline was 1.72:1 before this
work and is still (ADR-083 lists it as a follow-up); dark was built to the 3:1
floor. The live version of this table is measured in the browser at
`/admin/design-system`.

**Drawing outside CSS.** An SVG `stroke`, a Recharts tick or an inline style
cannot use a class. `themeColorVar('neutral-900', 0.6)` returns
`rgb(var(--color-neutral-900) / 0.6)`, which resolves through the same property,
so a chart repaints the instant the theme changes with no hook and no second
copy of the palette in JavaScript.

**Adding a colour.** Add it to `brand.ts` in **both** `colors` and `colorsDark`
(the type forces the pair), emit it in `themeVars()`, name it in the closed
palette in `createThemeTailwind()`, and add its pair to
`theme-contrast.spec.ts`. A colour that exists in one theme only is a defect.

**Known limits.** `app/global-error.tsx` and `app/not-found.tsx` render before
any stylesheet and stay light. The POS and mobile apps have not adopted dark
mode; the tokens they need are in `packages/shared`, the work is sequenced in
ADR-083. Urdu's line height
is `rtlLineHeight`, not a token of the type scale, because Nastaliq needs it per
font, not per step.

## Where tokens live

| Token group | Home | State |
|---|---|---|
| Colour (light and dark), radius, type | `packages/shared/src/brand.ts` → `theme-colors.ts`, `theme-radii.ts`, `theme-type.ts` | built |
| Space, size, elevation, layers, motion | `theme-space.ts`, `theme-size.ts`, `theme-elevation.ts`, `theme-layers.ts`, `theme-motion.ts` | built |
| Theme mechanism (CSS variables, Tailwind theme) | `theme-tailwind.ts`, consumed by `apps/web/tailwind.config.ts` | built |
| Theme preference and no-flash script | `theme-runtime.ts`; `useTheme()`, `ThemeToggle`, `ThemeInitScript` in `apps/web` | built |
| Breakpoints | `apps/web/tailwind.config.ts` | built |
| Dark mode on POS and mobile | — | **unbuilt** (ADR-083) |

They belong in `packages/shared` and not in a Tailwind config, because the POS
and mobile apps consume them too and neither uses that config.
