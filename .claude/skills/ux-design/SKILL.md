---
name: ux-design
description: Design a screen before coding it. Use before writing JSX for a new page, flow or major layout change, and when asked to design, mock up, plan or sketch a UI. Produces a one-page screen brief (job, hierarchy, every state, the success surface, seven widths, copy, proof), challenges it, then builds from it.
argument-hint: "<the screen, flow or job to design>"
---

# /ux-design: design the screen, then code it

A senior designer does not start with components. They start with the person,
the one job the page is for, and what happens after it, and they write that
down before anything is drawn. This is that step, written. It is the UX half of
the plan `CLAUDE.md` asks for under "Plan before build": a named feature still
runs its scope lenses, and a one-line fix runs none of this.

**Skip it** for a copy change, a bug fix that changes no layout or state, or a
token tweak. Say so in one line and carry on.

## 1. Look it up before you search

- Does the screen already exist? `docs/index/cross/ui-routes.md`.
- What can it be built from? `docs/index/cross/components.md` and the "Use what
  exists" table in `.claude/rules/ui.md`. Open the nearest existing page of the
  same template (the three shapes are listed under "Templates" in
  `docs/design/components-states/03-components.md`: list, detail, task; there is
  no skeleton file, so the nearest real page is the skeleton) and start from it.
- Where does it link to? Routes are constants in `apps/web/src/constants/routes.ts`
  (`ROUTES`); a destination with no entry there, or no page behind it, is a
  finding for the brief, not something to invent.
- Who sees it? `docs/index/cross/permissions.md` for the key, and which modules
  it mentions that may be absent (`MOD-1`).
- Read the chapter for what you are building (the table in
  `.claude/rules/design.md`). `pnpm idx law <ID>` prints any law.

## 2. Write the brief

This is the deliverable. One page, in the plan, the PR description or the
thread, before the first line of JSX.

```
SCREEN BRIEF: <name>
Job:          one sentence, one verb (Law 5). If it needs "and", it is two pages.
Actor:        who, which permission key gates it, what a person without it sees
              (PRM-2), what the page does with a module absent (MOD-1).
Before/after: where they came from and what they do next (FLO-1, NAV-4).
Template:     list | detail | task | other (a fourth shape needs a stated reason).
Hierarchy:    the headline (HIE-1); the three stops (HIE-2); the one loud button
              and its verb (PER-9, COL-4); what moves one level down (Law 2, COG-5).
Primitives:   reused: ...   missing: ... (a new one needs the rule of three).
States:       default | loading (a Skeleton shaped like it) | empty (never had,
              none match, cleared) | error (what, why, next: FLO-7) |
              permission-blocked | module absent | stale or partial | offline
              (POS) | long text and 10 000 rows.
Destructive:  each act with its ACT-6 tier; where the DangerZone sits (DNG-3, DNG-5).
Success:      which SUC-3 row; the title and its proof (SUC-1); the next-step
              trio (SUC-2); the one open loop (SUC-4); celebrate: no (SUC-5).
              The primary must lead somewhere that exists. When the natural
              destination (the thing just made) has no page, the primary is the
              nearest real one (the list, the dashboard) and the missing page goes
              under Out of scope as its own work order. Never a primary that goes
              nowhere, and no loop for a thread the system cannot follow.
Widths:       an ASCII sketch at 280 and 1280; what reflows at fold and md; where
              the optical centre is (SPA-4); nothing wasted (Law 4).
Copy:         every label, empty state and error written out, in the words of the
              terminology table (06-content). Customer-facing strings go in
              apps/web/messages/*.json in both languages (06-content, binding).
              Admin pages write literals today and `en.json` has no admin
              namespace: follow the nearest admin page and say so. Never build a
              sentence from fragments.
Motion:       the functional tier unless the brief says why not; each motion and
              what it communicates (MOT-1), or none.
Proof:        the command or render that will show each claim above (section 5).
Out of scope: what this does not do.
Challenge:    one line per question in section 3.
```

## 3. Challenge it before you build it

Answer these in the brief, in a line each. If an answer is weak, change the
design, not the answer.

- What is the one thing the person came to do, and does the headline say it?
- Can you name the three stops aloud? Do you need a fourth?
- What could be removed (Law 6)? What could move one level down (Law 2)?
- Which state will people spend most of their time in? It is rarely the default.
- What does it look like with 0 rows, 1 row, 10 000 rows, a 90-character name?
- Where will a first-time person go wrong, and what stops them (`HEU-5`)?
- If this screen ends in a success, what is the surface (`SUC-3`)?

## 4. Decide the forks yourself

A fork that does not change the goal, an output the person will notice or a
step nobody can undo: pick the reasonable default, say which one, and carry on.
Ask only when the answer changes one of those three.

A request whose premise the code contradicts ("announce to customers" when the
screen messages staff) is not a fork to ask about: design the screen that exists,
put the contradiction in the first line of the brief, and ask only if the real goal
differs from what the code does.

## 5. Build from the brief, then prove it

Use the primitives. Write the states in the same change as the happy path. Then
prove the brief, with a command, not by eye. Quote the numbers.

```bash
pnpm lint && pnpm typecheck && pnpm test     # contrast, links, danger, menus, tells, rebrand
node scripts/check-overflow.mjs --self-test  # the overflow logic; pnpm check:overflow boots the real stack
```

- Render at 280, 380, 640, 768, 1024, 1280 and 1536, light and dark
  (`scripts/lib/render-harness.mjs`; only `/admin/design-system` runs without the
  API and a seeded database).
- Keyboard path end to end, reduced motion, and a right-to-left pass at 380.
- `node scripts/check-rules.mjs` after you cite a law: it fails on an ID that does
  not exist. `node scripts/check-tells.mjs` for the machine-made look.
- No command checks copy, which SUC-3 row a screen belongs in, or whether a state
  is the right one. For those, write a spec of the strings the screen builds from
  its data (`lib/*.spec.ts`) or say that it is review only.
- Say which of these you could not run, and why. An unrun check is not a pass.

End with the brief and one line per claim saying how it was proved.
