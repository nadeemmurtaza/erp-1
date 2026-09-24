# 66 — Multi-form-factor POS: a design-law obligation, not a new mode

"Responsive POS layouts optimized to transition across touch monitors,
desktop terminals, handheld tablets, and smartphones" is, for this
repository, not a new capability request — it is Law 4 (seven screens, no
dead space: `xs` 280 · `sm` 380 · `fold` 640 · `md` 768 · `lg` 1024 ·
`xl` 1280 · `2xl` 1536) and `.claude/rules/design.md`'s touch-target law
("at least 44×44, and 48×48 on the POS"), both already binding on
`apps/pos` as a PWA today, plus doc 31's own hardware-driver layer
(`BarcodeScanner`, `ReceiptPrinter`, `CashDrawer`) already built to degrade
correctly on a device that lacks dedicated hardware — "camera-based
scanning (mobile/tablet POS with no dedicated scanner)" is doc 31's own
words, not new scope invented here.

## 1. What already covers this, and what a gap would actually look like

- **Layout** — every `apps/pos` screen is already obligated to satisfy Law
  4's seven widths and the design system's own "no dead space" rule; a
  screen that overflows or wastes space at any of the seven is already a
  defect under `pnpm check:overflow`, not a new requirement this document
  introduces.
- **Touch targets** — the 48×48 POS-specific minimum (larger than the
  44×44 general web minimum, because a till is operated by touch under
  time pressure) is already the standing rule for every interactive
  element in `apps/pos`.
- **Hardware degrade path** — doc 31's `PosHardwareDriver` interfaces
  already assume the no-dedicated-hardware case as a first-class,
  correctly-degrading state (camera-based scanning, no-op print/kick),
  which is precisely what a handheld tablet or a bare smartphone running
  the same PWA needs.

**The one genuinely open question** is not architectural — it's measured:
has `pnpm check:overflow`'s real sweep (`.github/workflows/ci.yml`'s
`overflow` job) actually been run against every `apps/pos` screen at all
seven widths including `xs` 280 and `sm` 380 (a handheld's realistic
viewport), or only verified at `apps/web`'s own admin-screen widths? If
the sweep already covers `apps/pos`, this document has nothing further to
specify. If it does not yet include `apps/pos` routes, that is the one
real work order below — extending an existing check's coverage, never
building a second responsive framework.

## Scope lenses

Not repeated in full — this document adds no schema, permission, or write
path; it is a design-and-verification coverage note. The two lenses worth
naming: **Three silhouettes** — a Solo till is almost always one fixed
touch monitor; a Chain's line-busting staff use handheld tablets during
peak hours, which is where the `xs`/`sm` widths first matter for real; an
Organization's mixed fleet (monitors at some branches, tablets at others)
is where a layout gap would first be *found* if one exists. **The absent
collaborator** — n/a: this is a rendering concern, not a module boundary.

## Work orders

**WO-66.1** — confirm (or extend, if missing) `check:overflow`'s route
sweep to include every `apps/pos` screen at all seven widths, not only
`apps/web`'s admin routes. If coverage already exists, record that finding
in this document rather than re-running speculative work.
**WO-66.2** — where the sweep finds a genuine overflow or a sub-48×48
touch target on an `apps/pos` screen, fix that specific screen — a design
defect under the existing rule, not a new feature.

## Acceptance

- `pnpm check:overflow` reports zero violations across `apps/pos` at all
  seven widths, evidenced by the CI job's own output, not by eyeballing a
  resized browser window.
- No `apps/pos` interactive element measures below 48×48, evidenced by
  `eslint-plugin-jsx-a11y` plus the design system's own measured-state
  tracking in `docs/design/`.

## Out of scope

A distinct "handheld mode" UI variant with different information density
than the fixed-terminal layout — Law 4's own seven-screen discipline
already requires one responsive layout that works at every width, never a
second, separately-maintained layout tree for a different form factor.
