<!-- POINTER FILE — not the source of truth, never edited to add a design law here. -->

# Design

The design system — 16 chapters, 150 numbered laws with stable IDs — lives
in [`docs/design/`](./docs/design/), starting from
[`docs/design/README.md`](./docs/design/README.md).

| Chapter | Covers |
|---|---|
| `00-principles.md` | The seven laws this whole system serves — no hardcoding, hide complexity in depth, feel like a few features, seven screens with no dead space, one job per page, no clutter, overview first |
| `01-foundations.md` | Color, type, spacing — every token resolved through `packages/shared/src/brand.ts`, never a literal |
| `02-layout.md` | The seven screen widths and what must never waste its space at any of them |
| `03-components.md` | The primitives — what already exists, so nothing is rebuilt by accident |
| `04-states.md` | Every state a screen must ship: empty, loading, error, no-permission — never a blank space standing in for one |
| `05-motion.md` | Motion that communicates, never motion for its own sake |
| `06-content.md` | Voice, tone, one word per concept |
| `07-accessibility.md` | Keyboard, targets, contrast, logical properties (RTL-safe) |
| `08-governance.md` | How a design decision gets made and stays made |
| `09-quality.md` | What "done" means for a screen |
| `10-laws.md` | The full numbered law index, with stable IDs (`pnpm idx law <ID>` looks one up) |
| `11-workflow.md` | How a screen actually gets designed and reviewed here |
| `12-permissions.md` | How a layout closes over an absent permission or module, never leaving a ring of content around an empty middle |
| `13-composition.md` | How primitives compose into a real screen |
| `14-navigation.md` | Nav structure and findability |
| `15-integrity.md` | The build-order of every automated design check (`pnpm check:contrast`, `pnpm check:links`, `pnpm check:overflow`, and the ones still unbuilt, ranked) |

`.claude/rules/design.md` and `.claude/rules/ui.md` are the scoped rule
files that load these obligations automatically the moment an agent opens
a web/POS/mobile component — they summarize; `docs/design/` is where the
actual 150 laws are written out.

```bash
pnpm idx design <text>   # search every chapter
pnpm idx law SPA-4       # one law, by ID or family
```

**This file exists only so "Design.md" is findable by name.** The actual
design system, and the measured state of what it governs, lives in
`docs/design/`.
