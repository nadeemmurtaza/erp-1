# 01 · Foundations

The token layer. Every visual value in the product resolves to something here,
and nothing here is picked because it looked right in one component.

> **Status: partly built.** Colour, radius and type exist in
> `packages/shared/src/theme-*.ts` (77 lines in total). **Spacing, size,
> shadow, z-index and motion tokens do not exist yet** — this chapter
> specifies them so they can be built once rather than invented per component.
> Anything below marked *unbuilt* is a target, not a description.

## Why tokens and not values

House Rule 1 forbids a design literal in application code — no hex, no radius,
no type step at a call site. The reason is not tidiness: this codebase ships to
several clients, and one deployment serves one brand resolved at build time
(ADR-013). A literal is a value that cannot follow the brand. A token can.

The second reason is change: a token layer means refining the visual language
is one edit, not four hundred.

## Colour

Source: `packages/shared/src/theme-colors.ts` → `BRAND.theme.colors`.

**Rules**
- Never a hex in a component. `grep -ro "text-gray-[0-9]*\|bg-gray-[0-9]*" apps/web/src` must stay empty — a second grey is drift.
- Container edges are `border-neutral-100`. Controls that must be findable get `border-neutral-200`. Nothing darker.
- Semantic before literal: a thing is `danger` because it is destructive, not because it is red.

**Unbuilt: contrast validation.** No file in this repository mentions WCAG or
contrast. Every foreground/background pair the tokens permit should be checked
at build time, not by eye. Chapter 07 states the ratios; a checker belongs in
`scripts/`.

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

## Spacing — *unbuilt*

There is no spacing scale today; components use Tailwind's defaults directly.

**Specification.** A single scale, used for padding, gaps and section rhythm,
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

## Size — *unbuilt*

Control heights, icon sizes and container widths currently vary per component.

**Specification.** Three control heights (`sm` 32 · `md` 40 · `lg` 48), three
icon sizes (16 · 20 · 24), and a single `container-page` max width, which
already exists as a class.

**Rule.** An interactive control is never smaller than the touch target
minimum in Chapter 07, whatever its visual size.

## Radius

Source: `packages/shared/src/theme-radii.ts`.

**Rule.** Radius is a family, not a per-component choice. A card, an input and
a button inside that card should read as the same material.

## Shadow and elevation — *unbuilt*

**Specification.** Elevation is a small, ordered set — `flat`, `raised`,
`overlay`, `modal` — and each maps to exactly one shadow token. Shadows are
never composed ad hoc.

**Rules**
- **Never a border and a shadow on the same edge.** That is two boundaries, and
  it is already binding in `.claude/rules/ui.md`.
- `.card` has no shadow. `.lift` adds one on hover, when it means *this rose*.
- Elevation implies z-order: a thing that looks higher must also be higher.

## Z-index / layering — *unbuilt*

There is no layering scale today, which is how overlay bugs start.

**Specification.** Named layers, never raw numbers:

```
z.base      0      content
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

## Motion tokens — *unbuilt*

`framer-motion` 13.1.1 is a dependency and is imported by exactly one file.
Motion today is 83 Tailwind `transition-*` utilities, 4 CSS `transition`
declarations and 1 `@keyframes`, with no shared vocabulary — which is why
durations differ between components that should feel identical.

**Specification.** Chapter 05 defines the language; these are its values.

```
motion.duration.instant   80ms    state that should feel like nothing happened
motion.duration.fast      140ms   hover, focus, press
motion.duration.normal    220ms   panels, disclosure, tab change
motion.duration.slow      320ms   full-surface or route-level change

motion.easing.standard    cubic-bezier(0.2, 0, 0, 1)
motion.easing.emphasized  cubic-bezier(0.2, 0, 0, 1.2)
motion.easing.exit        cubic-bezier(0.4, 0, 1, 1)

motion.spring.snappy      stiffness 400, damping 32
motion.spring.soft        stiffness 260, damping 30
motion.spring.gentle      stiffness 180, damping 26

motion.distance.micro     2px     press, nudge
motion.distance.small     8px     hover lift, tooltip offset
motion.distance.medium    24px    panel and drawer entrance
motion.distance.large     64px    route or section transition
```

**Rule.** A component consumes a token. A duration written into a component is
the thing this layer exists to prevent — refining the motion language must be
one edit, not a hundred.

## Where tokens live

| Token group | Home | State |
|---|---|---|
| Colour, radius, type | `packages/shared/src/theme-*.ts` | built |
| Breakpoints | `apps/web/tailwind.config.ts` | built |
| Spacing, size, shadow, z, motion | *to be added beside the others* | unbuilt |

They belong in `packages/shared` and not in a Tailwind config, because the POS
and mobile apps consume them too and neither uses that config.
