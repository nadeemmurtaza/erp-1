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

The long form is **[`docs/design/`](../../docs/design/README.md)** — ten
chapters covering principles, tokens, layout, components, states, motion,
content, accessibility, governance and quality gates. Its measured state,
generated from the code, is `docs/index/cross/design-system.md`.

Search it rather than reading it:

```bash
pnpm idx design <text>
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
| reviewing before merge | `09-quality` — a checklist, not prose |

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
