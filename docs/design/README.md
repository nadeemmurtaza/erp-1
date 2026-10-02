# The NEWAX design system

How this product decides what it looks like, how it behaves, and how it speaks.

Sixteen chapters and **192 numbered laws**. Read the one you need — each
says what it governs, what is already enforced by a command, and what is
still only written down.

A law has a stable ID, so it can be cited in a review or a commit: `SPA-4`,
`FLO-7`, `PRM-2`. `pnpm idx law SPA-4` prints it.

## Precedence, before anything else

This system is **subordinate to `CLAUDE.md`**. The seven laws are the
constitution; everything here elaborates them and may never contradict them.
Where this system and a law disagree, the law wins and the chapter is wrong.

Three parts of the design system are already binding rules and live in
`.claude/rules/ui.md`, loaded automatically whenever you open a component:
**Use what exists**, **Borders and boxes**, **No dead ends**. They are not
repeated here. This system is the long form around them, not a second copy —
`CLAUDE.md`'s own "never fork a duplicate doc" applies to itself.

## Using it while you build

`.claude/rules/design.md` says when each of these applies. Four skills in
`.claude/skills/` (`/ux-design`, `/ux-audit`, `/ux-review`, `/restyle`) turn the
laws into a procedure: a brief before a screen is coded, an audit with evidence,
a review of the diff, and a restyle that removes the generic look. They cite laws
by ID, and `scripts/check-rules.mjs` fails if one cites a law that does not
exist.

## The chapters

| # | Chapter | Governs | Enforced today |
|---|---|---|---|
| 00 | [Principles](./principles-laws/00-principles.md) | how a design decision is made at all | by review |
| 01 | [Foundations](./foundations/01-foundations.md) | the token layer: colour (light and dark), type, space, size, radius, shadow, z, motion, and **theming** | built; contrast in both themes by `check-contrast.mjs`; POS and mobile dark mode unbuilt |
| 02 | [Layout & responsive](./layout-composition/02-layout.md) | grid, density, the seven screens, reflow, hierarchy (`HIE`) | breakpoints in `tailwind.config.ts` |
| 03 | [Components](./components-states/03-components.md) | primitives → components → patterns → templates | `.claude/rules/ui.md` + review |
| 04 | [States & behaviour](./components-states/04-states.md) | every state an element can be in, and what each one promises, and the success state (`SUC`) | partly, by `EmptyState`/`Loading` |
| 05 | [Motion](./motion/05-motion.md) | the motion language, its tokens, and the quality bar | **unbuilt** — see the chapter |
| 06 | [Content](./content/06-content.md) | voice, terminology, labels, microcopy, error text | `messages/*.json` only |
| 07 | [Accessibility & i18n](./accessibility/07-accessibility.md) | keyboard, screen readers, focus, contrast, targets, reduced motion, **RTL** | **not enforced at all** |
| 08 | [Governance](./process-governance/08-governance.md) | naming, contribution, versioning, deprecation | `check-rules.mjs` for the rule layer |
| 09 | [Quality gates](./process-governance/09-quality.md) | what must be true before a screen ships, and which of it is automated | `pnpm check` covers part |
| 10 | [The law catalogue](./principles-laws/10-laws.md) | 87 borrowed laws — perception, cognition, action, heuristics, type, colour, space, motion, a11y, i18n — each with its **ruling here** | rulings bind on review |
| 11 | [Workflow](./process-governance/11-workflow.md) | 100-step processes, approvals, state machines, drafts, dead ends | **unbuilt** as a system |
| 12 | [Permissions](./process-governance/12-permissions.md) | designing one page for thousands of permissions and 250+ roles | server-side enforcement only |
| 13 | [Composition](./layout-composition/13-composition.md) | shipping shop-only through shop+CRM+ERP+multi-branch from one codebase | API side checked; **UI side not** |
| 14 | [Navigation](./layout-composition/14-navigation.md) | hundreds of departments in one information space | **unmeasured** |
| 15 | [Integrity](./process-governance/15-integrity.md) | dead ends, broken links and images, overflow — the mechanical risks | **specified, not built** |

## How to use it

**Designing a screen** — 00, then 02, then 03, then 04.
**Building a component** — 03, then 04, then 05, then 07.
**Writing anything a user reads** — 06.
**Designing a long process** — 11, then 04, then 06.
**Designing anything role-sensitive** — 12, then 02.
**Adding a module, or a nav entry** — 13, then 14.
**Reviewing before merge** — 09, which is a checklist, not prose.
**Settling an argument** — 10. Cite the law.

```bash
pnpm idx law SPA-4          # one law: what it says, and the ruling here
pnpm idx law                # every law ID, one line each
pnpm idx design <text>      # search every chapter
pnpm idx rule <text>        # search the binding rules, scoped or not
```

## The law families

| Prefix | Family | Chapter |
|---|---|---|
| `PER` `COG` `ACT` `HEU` | perception, cognition, action, Nielsen's ten | [10](./principles-laws/10-laws.md) |
| `TYP` `COL` `SPA` `MOT` | type, colour, space and ratio, motion | [10](./principles-laws/10-laws.md) |
| `ACC` `GLO` | accessibility, globalization | [10](./principles-laws/10-laws.md) |
| `FLO` | workflow | [11](./process-governance/11-workflow.md) |
| `PRM` | permissions | [12](./process-governance/12-permissions.md) |
| `MOD` | composition and modularity | [13](./layout-composition/13-composition.md) |
| `NAV` | navigation and information architecture | [14](./layout-composition/14-navigation.md) |
| `ITG` | integrity — the machine-checkable failures | [15](./process-governance/15-integrity.md) |

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
| Accessibility | `eslint-plugin-jsx-a11y` runs on both apps; focus order, in-place contrast, reduced motion and RTL still unchecked |
| RTL | Urdu ships today; RTL handling is 30 scattered references and no system |

| Workflow | long processes exist; a shared primitive, a draft contract and a reachability check do not |
| Permissions | enforced server-side; no design contract for what a page becomes at partial privilege |
| Composition | module boundaries checked in the API by `pnpm lint`; **nothing checks the UI** |
| Integrity | broken links, missing images and orphan screens are checked (`check-links.mjs`); contrast is checked (`check-contrast.mjs`); overflow and dead ends still are not |

Chapters marked **unbuilt** are specifications to build against, not
descriptions of the code. Each says so at the top. When one becomes real, the
row above changes with it — and `docs/index/cross/design-system.md` reports
the same figures, generated from the code rather than typed here.

## The one thing this system refuses to do

Describe what it wishes were true. Every status line above is measured, every
gap is named, and chapter 15 turns the named gaps into a build order rather
than a hope. A design system quoted as though it were true, when it is not,
is worse than no design system — because it ends arguments with a false
answer.
