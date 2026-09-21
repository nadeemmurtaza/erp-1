# 09 · Quality gates

What has to be true before a screen ships, and — stated honestly — which of it
a command proves and which of it a person has to look at.

Status: **the engineering gates are real and green; the design gates are
not automated at all.** `pnpm check` runs index freshness, lint (which
includes module boundaries, frontend secrets, env templates and the rule
index), typecheck and tests. Nothing in that chain looks at contrast, focus
order, reduced motion, RTL, or whether a screen wastes its width.

## The two columns

Every row below is either *proved* or *reviewed*. Mixing them is how a team
ends up believing a green build means an accessible screen.

```bash
pnpm check                 # index · lint · typecheck · test
pnpm check --build         # the above plus build
pnpm check <gate>          # one gate: index, lint, typecheck, test, build
```

### Proved by a command

| What | Command |
|---|---|
| Index describes this commit | `node scripts/build-index.mjs --check` |
| No lint error or warning, either app | `turbo run lint` |
| No cross-module import outside `KNOWN_MODULE_COUPLINGS` | `scripts/check-module-boundaries.mjs` |
| No secret reachable from the frontend bundle | `scripts/check-frontend-secrets.mjs` |
| Every env var documented in the templates | `scripts/check-env-templates.mjs` |
| No brand literal in application code (Law 1) | `scripts/check-rebrand.mjs` |
| No rule file orphaned from `CLAUDE.md`'s index | `scripts/check-rules.mjs` |
| Types sound across the workspace | `turbo run typecheck` |
| Behaviour as specified | `turbo run test` |
| It compiles for production | `turbo run build` |
| Formatting | `pnpm format:check` |

CI (`.github/workflows/ci.yml`) runs lint, index, typecheck, test and build
against a real Postgres with migrations applied and the database seeded — so
a migration that does not apply cleanly fails there, not in someone's
checkout.

### Counted, not proved

`CLAUDE.md` asks for these numbers before a PR, and a number is evidence in a
way that reading is not. Quote the count:

```bash
grep -rn "style={{" apps/web/src --include='*.tsx'           # inline styles
grep -rn "toLocaleString\|toLocaleDateString" apps/web/src    # stray formatting
grep -rn "await fetch(\|= fetch(" apps/web/src                # bare fetch
grep -ro "text-gray-[0-9]*\|bg-gray-[0-9]*" apps/web/src      # second palette
```

The documented exceptions are listed in `CLAUDE.md` — inline `style` on
data-driven widths and colours, `app/global-error.tsx` and `app/not-found.tsx`
which render before any stylesheet exists, and `any` in `*.spec.ts`. Do not
"fix" them.

The rebrand leak is no longer one of these greps. It is
`scripts/check-rebrand.mjs`, run by `pnpm lint`, and it belongs in the table
above rather than here — a brand literal in a screen now fails the build
instead of waiting for someone to remember a command.

### Reviewed by a person

Nothing below has a command. Each is phrased so that the answer is yes or no,
not a matter of taste.

**The laws** — the only gate that can reject a screen outright:

- Does any brand, locale or design literal appear in application code? (Law 1)
- Was anything deleted to make the page calm, rather than moved down a level?
  (Law 2)
- Does the page make the product look big? (Law 3)
- At `xs` 280, `sm` 380, `fold` 640, `md` 768, `lg` 1024, `xl` 1280 and
  `2xl` 1536 — does any screen waste its space? (Law 4)
- Does the page do exactly one job? (Law 5)
- Is anything visible removable without loss? (Law 6)
- Does it render the detail of everything, rather than overview first?
  (Law 7)

**States** — [04 · States and behaviour](04-states.md) has the full matrix:

- Are empty, loading and error all designed, or only the happy path?
- Are the three empties distinguished — never-had-any, none-match-the-filter,
  and cleared-them-all?
- Does every error say what happened, why, and what to do next?
- Is a destructive action undoable, or confirmed, or both?
- Does a permission the user lacks disappear, or appear and then fail?

**Interaction and motion** — [05 · Motion](05-motion.md):

- Does every motion communicate something, or is it decoration?
- Does the interface respond within one frame of input, even when the result
  takes longer?
- Is `prefers-reduced-motion` honoured, with the information the motion
  carried preserved rather than the state jumping?
- Does anything animate a property that forces layout?

**Accessibility and i18n** — [07 · Accessibility](07-accessibility.md):

- Is every interactive element reachable and operable by keyboard?
- Is focus visible, and does it go somewhere sensible after an overlay closes?
- Does text meet 4.5:1, and does a control boundary meet 3:1?
- Are touch targets at least 44×44, and 48×48 on POS?
- Does it hold up in Urdu, right to left, with logical properties rather than
  `left`/`right`?

**Content** — [06 · Content](06-content.md):

- One word per concept, matching the terminology table?
- Is every user-visible string in `messages/*.json`?
- Does a number, date or currency go through the shared formatter rather than
  `toLocaleString`?

**Performance** — `.claude/rules/performance.md` is the binding version:

- Is every list endpoint paginated?
- Does any query run inside a loop?
- Does a new cache state its key, its owner and its invalidation?

## Regression

The gates above stop a defect entering. These stop one returning.

- **A bug fix ships with the test that would have caught it.** Not a test of
  the fix — a test of the behaviour that was wrong. `.claude/rules/testing.md`
  is the standard.
- **A shared-component change re-runs every consumer's tests**, which is what
  `turbo run test` does by default; do not narrow it to one package to go
  faster before pushing.
- **Never reuse an old passing run as evidence for a new change.** The
  protocol in `CLAUDE.md` says this outright, and it is the single easiest
  gate to fail by accident.
- **Visual regression is not covered.** There is no screenshot diffing in this
  repository. A layout break is caught by a person at seven widths or not at
  all — which is exactly why Law 4 names the widths rather than saying
  "responsive".

## The honest gap, ranked

What the next automation should be, in the order it would catch the most:

1. ~~**`eslint-plugin-jsx-a11y`**~~ — **done.** Enabled in both apps' configs;
   the 24 violations it found are fixed, and its four documented exceptions
   each carry their reason at the line.
2. **A token lint** — once spacing/size/shadow/z/motion tokens exist
   ([01 · Foundations](01-foundations.md)), a rule that rejects a raw value
   where a token exists. Without it the token layer decays the week after
   it ships.
3. ~~**Contrast checking in CI**~~ — **done**, `scripts/check-contrast.mjs`.
   It confirmed the failure chapter 07 records, and found a larger one: the
   brand accent is under the body-text floor.
4. **Screenshot diffing at the seven widths** — expensive, and the only thing
   that makes Law 4 verifiable rather than remembered.

None of these exist. Until they do, this chapter's second column is the gate,
and it is a person — so it is written as questions a person can actually
answer, not as an aspiration to "review quality".

## Definition of done, for a screen

`CLAUDE.md`'s definition of done governs every change here and is not repeated.
Three items it contains are the ones design work fails most often, so they are
restated:

- **Reachable** — a nav entry and real UI, not a URL you have to know, and
  every permission it needs granted to a role a live user actually holds.
- **Security reviewed** — a client-side restriction is not authorization.
- **Acceptance criteria verified** — by a command or an observation, stated.
  "Looks right" is not evidence, and neither is reasoning about the diff.
