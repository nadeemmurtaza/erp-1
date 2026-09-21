---
paths:
  - "apps/web/src/**/*.tsx"
  - "apps/web/src/**/*.css"
  - "apps/pos/src/**/*.tsx"
  - "apps/pos/src/**/*.css"
  - "apps/mobile/**/*.tsx"
  - "packages/shared/src/theme-*.ts"
  - "packages/shared/src/brand.ts"
---

<!-- BINDING — identical force to CLAUDE.md itself.
     Scope: anything a person looks at. This is a router plus the obligations
     that are enforceable; the reasoning lives in docs/design/ and is not
     duplicated here, per CLAUDE.md's own "never fork a duplicate doc". -->

## The design system

The long form is **[`docs/design/`](../../docs/design/README.md)** — sixteen
chapters and **150 numbered laws**, covering principles, tokens, layout,
components, states, motion, content, accessibility, governance, quality
gates, the borrowed law catalogue, workflow, permissions, composition,
navigation and integrity. Its measured state, generated from the code, is
`docs/index/cross/design-system.md`.

Search it rather than reading it. Every law has a stable ID, so cite the ID
in a review or a commit rather than paraphrasing:

```bash
pnpm idx law SPA-4          # one law: what it says, and the ruling here
pnpm idx law PRM            # one family
pnpm idx design <text>      # search every chapter
```

`.claude/rules/ui.md` already carries the three parts of the system that were
binding before it existed — **Use what exists**, **Borders and boxes**,
**No dead ends**. They are not repeated here or there.

**Precedence.** `CLAUDE.md`'s seven laws win over every chapter. A chapter
that appears to contradict a law is wrong, and this rule does not change that.

## Read the chapter before you build the thing

| Building | Read first |
|---|---|
| a screen | `00-principles`, `02-layout`, `04-states` |
| a component | `03-components`, `04-states`, `07-accessibility` |
| anything that animates | `05-motion` |
| anything a user reads | `06-content` |
| a token, or adding a token group | `01-foundations`, then `DECISIONS.md` |
| a long or multi-step process | `11-workflow` — `FLO-1` through `FLO-15` |
| anything that differs by role or permission | `12-permissions` — `PRM-1` through `PRM-12` |
| a module, or anything that can be absent | `13-composition` — `MOD-1` through `MOD-10` |
| a nav entry, or anything about findability | `14-navigation` — `NAV-1` through `NAV-12` |
| reviewing before merge | `09-quality` — a checklist, not prose |
| settling an argument | `10-laws` — cite the ID |

## The obligations, stated so they can be checked

These are binding now. Everything else in the chapters is reasoning or a
specification for something not yet built.

- **Ship every state, not the happy path.** A view that can be empty, loading
  or failing has all three designed. Empty means one of three different
  things — never had any, none match the filter, cleared them all — and they
  do not share a message.
- **Every error says what happened, why, and what to do next.** A raw status
  code, a stack trace, or "Something went wrong" alone is not an error state.
- **A destructive action is undoable, confirmed, or both.** Never neither.
- **Motion communicates or it does not ship.** Decorative motion is clutter
  under Law 6. Every motion honours `prefers-reduced-motion`, and under it the
  information the motion carried survives — the state does not simply jump.
- **Never animate a property that forces layout.** Transform and opacity.
- **Interaction responds within one frame**, even when the result is slow.
  The acknowledgement is immediate; the result can take as long as it takes.
- **Keyboard reaches everything.** Every interactive element is operable
  without a mouse, focus is visible, and nothing traps it. This includes the
  POS — till hardware often has a keyboard and no mouse.
- **Touch targets are at least 44×44**, and 48×48 on the POS.
- **Use logical properties, not `left`/`right`.** Urdu ships; a physical
  direction is a bug in a right-to-left locale.
- **Every user-visible string lives in `messages/*.json`**, and every number,
  date and currency goes through the shared formatter — never
  `toLocaleString`. This is Law 1 as much as it is content.
- **One word per concept.** The terminology table in `06-content` decides it;
  a synonym is a defect, not a style choice.
- **No dead end** (`ITG-1`). Every screen and every state — empty, error,
  permission-blocked, absent-module, end-of-flow — has a forward action and a
  marked exit.
- **No ring of content around an empty middle** (`SPA-4`). At every one of the
  seven widths, the optical centre carries the page's job. Where content does
  not fill the width, constrain and centre the container; never push content
  outward to reach the edges.
- **Space is the primary grouping device** (`PER-1`, `SPA-2`), ahead of borders
  and boxes — and the gap inside a group is always smaller than the gap around
  it. When that inverts, the page groups backwards and is read wrong.
- **Hide a nav entry, disable an action, explain both** (`PRM-2`). A door to a
  locked room is a dead end; a silently missing action makes the object look
  different than it is. The reason text names the permission, not "denied".
- **Layout closes over absence** (`PRM-5`, `MOD-1`). When a permission or a
  module is missing, the layout reflows — it never leaves a hole. So a
  permission- or module-sensitive region is content-driven (`auto-fit`,
  `flex-wrap`), never a fixed template with slots that may be empty.
- **Acknowledge within one frame** (`ACT-3`), whatever the result costs. The
  acknowledgement and the result are two different promises.
- **Match friction to blast radius** (`ACT-6`). Reversible and small → do it,
  offer undo. Irreversible or wide → name the object and the count.
  Irreversible and financial or cross-branch → require typing the name.
- **A refusal states its remedy** (`FLO-7`). "Awaiting approval" is a status,
  not a message.
- **Work is durable from the first real value** (`FLO-3`). Closing a tab may
  cost the current field, never the current hour.
- **Tabular figures, right-aligned, for every column of numbers** (`TYP-5`).
  Misaligned money is misread money.
- **Prose caps at ~70 characters** (`TYP-1`), however wide the screen.

## Promoting something into the system

The rule of three: the same solution written three times, on purpose, in three
places. Two is a coincidence. Before adding a rung to the ladder, answer
`CLAUDE.md`'s own question — *what real boundary justifies its existence?*
Governance, deprecation and naming are `08-governance`.

## What is not enforced by any command

Stated out loud so a green build is never mistaken for a reviewed screen:
contrast, focus order, reduced motion, RTL, touch-target size and whether a
screen wastes its width have **no** automated check in this repository today.
There is no accessibility lint and no visual regression. `09-quality` lists
them as questions a person answers before merge, and ranks what should be
automated first.
