# 07 · Accessibility and internationalisation

How broadly the product can actually be used.

> **Status: still the largest gap, but no longer unverified.**
> `eslint-plugin-jsx-a11y` now runs on both apps (chapter 15's check 4), so
> the hand-written `aria-*` across the three surfaces has something checking
> it, and `check-contrast` measures the colour pairs written as classes, and
> in `@apply` lines of the stylesheets, in both themes. What neither can see —
> focus order, reduced motion, RTL — is still individual diligence. The stylesheet has **two**
> `prefers-reduced-motion` blocks. Urdu ships in production and RTL is 62
> scattered references with no system behind them.
>
> This chapter is a specification and a to-do list, not a description.

## Why this is grouped with i18n

Both are the same question — *can this person use the product?* — and in this
product they interact: Urdu is right-to-left, so a focus order, an icon
direction and a keyboard shortcut are all locale-dependent. Treating them
separately is how an interface ends up accessible in English only.

## The target

**WCAG 2.2 AA.** Not as a certificate, as a floor.

## Keyboard

Every interactive element is reachable and operable by keyboard. No exceptions,
including the POS — till hardware often has a keyboard and no mouse.

- **Tab order follows visual order.** If it does not, the DOM order is wrong;
  fix the DOM, not with `tabindex` above 0.
- **`Escape` closes** any overlay. The shared `Dialog` already wires Escape,
  backdrop click and a labelled close button — a hand-rolled modal will forget
  one.
- **`Enter` submits** the form the focus is in.
- **Arrow keys move within a composite** — tabs, menus, table selection — while
  `Tab` moves between composites.
- **No keyboard trap.** Anything that takes focus must give it back.
- **Skip to content** on every page with persistent navigation.

## Focus

- **Never remove a focus indicator.** `outline: none` without an equally
  visible replacement is a defect. Chapter 04 repeats this because it is where
  it gets deleted.
- The indicator meets contrast against **both** the control and the surface
  behind it.
- **Focus moves deliberately**: into a dialog when it opens, back to the
  trigger when it closes, to the first invalid field on a failed submit.
- Focus is never lost to `document.body` after an action.

## Screen readers

- **Semantic HTML first.** A `<button>` is better than a `<div role="button">`
  every time, because it brings keyboard, focus and announcement for free.
- Every input has a **real label**, not a placeholder standing in for one.
- Icon-only controls carry an accessible name (`.icon-btn` is the class; the
  name is not optional).
- **Live regions** for asynchronous change — a saved toast, a validation
  summary, a queued-sale count — so the change is announced rather than merely
  drawn.
- Tables use real `<th>` with scope. `DataTable` should guarantee this so no
  caller has to remember.
- Decorative images are `alt=""`; meaningful ones describe the meaning, not the
  picture.

## Contrast

| Content | Minimum |
|---|---|
| Body text | 4.5:1 |
| Large text (≥18.66px bold, ≥24px) | 3:1 |
| UI component boundaries and states | 3:1 |
| Focus indicator | 3:1 against adjacent colours |

**Built.** `scripts/check-contrast.mjs`, run by `pnpm lint`, reads the palette
from `brand.ts` and measures the pairs written as classes, and the pairs in
`@apply` statements (the house classes `.field-input`, `.btn-secondary`,
`.chip-unselected`, `.card`, and the POS equivalents), against these floors in
both themes, as a ratchet (most uses warn only). It used to read quoted class
strings only, which hid the house classes from it; reading them added six
control outlines at 1.54:1 to 1.72:1 to the baseline, a real failure of the
3:1 boundary floor above that is now written down and not yet fixed (it is an
owner decision: ADR-083, consistency addendum). Contrast is arithmetic over
tokens — the cheapest accessibility guarantee available, and it never needs a
human.

Note the tension with `.claude/rules/ui.md`: container edges are
`border-neutral-100` (#E8E8E8), which is deliberately soft and will **not**
meet 3:1. That is acceptable for a decorative boundary and **not** acceptable
for a control boundary or a state indicator — which is exactly why the same
rule already says findable controls get `border-neutral-200`. The checker must
know the difference rather than flagging every soft edge.

## Touch targets

| Surface | Minimum |
|---|---|
| Web, below `fold` | 44×44 (ACC-4) |
| Web, `fold` and up | 40 tall for `.btn`, 36 square for `.icon-btn`, never below 24×24 CSS px with spacing (WCAG 2.5.8) |
| Mobile | 44×44 |
| **POS** | **48×48** — used standing, at speed, sometimes gloved |

A control may *look* smaller than its target. The hit area is what matters.

## Reduced motion

Required, not optional — see [Chapter 05](../motion/05-motion.md). Honour
`prefers-reduced-motion: reduce` by replacing movement with an instant,
legible change. Two blocks in the whole stylesheet is the current state and is
not compliance.

Also honour it in skeletons: a shimmering skeleton is animation.

## Semantic structure

- One `<h1>` per page, and heading levels do not skip.
- Landmarks: `<nav>`, `<main>`, `<aside>`, `<footer>` — a screen-reader user
  navigates by them the way a sighted user navigates by layout.
- Lists are lists. A table is a table, not a grid of divs.

## Right-to-left

Urdu ships today. RTL is not a translation concern; it is a layout concern.

- **Use logical properties**: `margin-inline-start`, not `margin-left`;
  `padding-inline`, not `padding-left/right`. This is the single change that
  removes most RTL bugs at once.
- **`dir` is set on the document** from the locale, not per component.
- **Directional icons mirror**: back, forward, next, previous, chevrons in
  navigation. Non-directional icons do **not** — a clock, a logo, a checkmark
  stay as they are.
- **Numbers and money do not mirror.** A currency amount keeps its digit order;
  only its position in the sentence changes.
- **Keyboard arrows follow visual direction**, so "next" is `←` in RTL.
- **Test in Urdu, not in a mirrored English page.** The two fail differently,
  because string length changes too.

## Internationalisation beyond direction

- Never concatenate sentences from fragments (Chapter 06).
- Assume strings grow; never size a control to its English label.
- Dates, numbers and currency through `@newax/shared`.
- Do not sort user-visible lists by raw byte order.

## What would make this real

In rough order of value per effort:

1. ~~**`eslint-plugin-jsx-a11y`** in both web eslint configs.~~ **Done.** Turns hopeful
   `aria-*` attributes into something verified, and catches the whole class of
   missing-label and bad-role errors at build time.
2. ~~**A contrast checker** over `theme-colors.ts`, run by `pnpm lint`.~~ **Done**
   (`check-contrast.mjs`), which now reads `@apply` lines too.
3. **Logical properties** adopted in `globals.css` and the primitives, which
   fixes most RTL layout at the source.
4. **Reduced-motion coverage** as a rule rather than two blocks.
5. **A keyboard pass on the primitives** — 43 components, done once, inherited
   by every page.
6. Automated axe checks in the e2e suite for the main templates.

Items 1 and 2 are configuration and arithmetic. They are the cheapest real
accessibility this product can buy and neither needs a human in the loop.
