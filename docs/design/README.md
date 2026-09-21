# The NEWAX design system

How this product decides what it looks like, how it behaves, and how it speaks.

Ten chapters. Read the one you need — each says what it governs, what is
already enforced by a command, and what is still only written down.

## Precedence, before anything else

This system is **subordinate to `CLAUDE.md`**. The seven laws are the
constitution; everything here elaborates them and may never contradict them.
Where this system and a law disagree, the law wins and the chapter is wrong.

Three parts of the design system are already binding rules and live in
`.claude/rules/ui.md`, loaded automatically whenever you open a component:
**Use what exists**, **Borders and boxes**, **No dead ends**. They are not
repeated here. This system is the long form around them, not a second copy —
`CLAUDE.md`'s own "never fork a duplicate doc" applies to itself.

## The chapters

| # | Chapter | Governs | Enforced today |
|---|---|---|---|
| 00 | [Principles](00-principles.md) | how a design decision is made at all | by review |
| 01 | [Foundations](01-foundations.md) | the token layer: colour, type, space, size, radius, shadow, z, motion | colour/radius/type partly; **the rest is unbuilt** |
| 02 | [Layout & responsive](02-layout.md) | grid, density, the seven screens, reflow | breakpoints in `tailwind.config.ts` |
| 03 | [Components](03-components.md) | primitives → components → patterns → templates | `.claude/rules/ui.md` + review |
| 04 | [States & behaviour](04-states.md) | every state an element can be in, and what each one promises | partly, by `EmptyState`/`Loading` |
| 05 | [Motion](05-motion.md) | the motion language, its tokens, and the quality bar | **unbuilt** — see the chapter |
| 06 | [Content](06-content.md) | voice, terminology, labels, microcopy, error text | `messages/*.json` only |
| 07 | [Accessibility & i18n](07-accessibility.md) | keyboard, screen readers, focus, contrast, targets, reduced motion, **RTL** | **not enforced at all** |
| 08 | [Governance](08-governance.md) | naming, contribution, versioning, deprecation | `check-rules.mjs` for the rule layer |
| 09 | [Quality gates](09-quality.md) | what must be true before a screen ships, and which of it is automated | `pnpm check` covers part |

## How to use it

**Designing a screen** — 00, then 02, then 03, then 04.
**Building a component** — 03, then 04, then 05, then 07.
**Writing anything a user reads** — 06.
**Reviewing before merge** — 09, which is a checklist, not prose.

```bash
pnpm idx design <text>      # search every chapter
pnpm idx rule <text>        # search the binding rules, scoped or not
```

## An honest statement of maturity

A design system that describes what it wishes were true is worse than none,
because it is quoted as though it were true. So, measured rather than claimed:

| Layer | Reality today |
|---|---|
| Colour, radius, type tokens | exist in `packages/shared/src/theme-*.ts`, 77 lines total |
| Spacing, size, shadow, z-index, motion tokens | **do not exist.** Chapter 01 specifies them; nothing implements them yet |
| Primitives | 12 in `apps/web/src/components/ui`, real and used |
| Patterns and templates | undocumented; they exist only as precedent in pages |
| Motion | `framer-motion` 13.1.1 is installed and imported by **one** file. Motion today is 83 Tailwind `transition-*` utilities, 4 CSS `transition` declarations and 1 `@keyframes` |
| Reduced motion | **2** `prefers-reduced-motion` blocks across both stylesheets |
| Accessibility | 120 `aria-*` attributes, **zero** lint enforcement |
| RTL | Urdu ships today; RTL handling is 30 scattered references and no system |

Chapters marked **unbuilt** are specifications to build against, not
descriptions of the code. Each says so at the top. When one becomes real, the
row above changes with it — and `docs/index/cross/design-system.md` reports
the same figures, generated from the code rather than typed here.
