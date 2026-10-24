---
name: restyle
description: Remove the machine-made look from a screen, and put the house system back. Use only when asked to restyle, de-slop or clean up a screen that looks generic or AI-generated. Removes tells (gradients, glass, heavy shadows, emoji icons, hype copy, empty success messages), fixes hierarchy, and proves the count went down.
argument-hint: "<file, route or component to restyle>"
disable-model-invocation: true
---

# /restyle: kill the AI look

A machine-made interface is recognisable by what it does to be safe: it
decorates everything a little, centres everything, puts a card around every
section and a gradient behind the hero, and says "Elevate your workflow". The
house system is the opposite: flat tokens, one loud button, copy that names its
object. This skill removes the tells and puts the system back. It is a
restyle, not a redesign: behaviour stays, and nothing is deleted to make a page
calm (Law 2: depth is moved, not removed).

## 1. Count the tells

```bash
node scripts/check-tells.mjs                      # totals for the whole repo, and the ratchet
node scripts/check-tells.mjs <file> [<file>...]   # the tells in these files, with file:line and the replacement
```

The tells it can see are gradient surfaces, glass (`backdrop-blur`), bouncing and
pinging motion, heavy shadows, round buttons (`rounded-full` on a button, link or icon button:
use the house corner, `rounded`), `transition-all`, a transition on a layout property
(`layout-motion`: width, height, margin, an edge), emoji used as icons, marketing
filler and a success message with no content. The whole-repo run prints only
totals, so note the per-file lines for the files you are about to touch.

## 2. Find the tells a script cannot see

Read the screen and look for these. Each one names its replacement.

| Tell | Instead |
|---|---|
| Three equal cards, each an icon in a circle, a heading and two lines | one list, or a table, or the one thing the page is for (`HIE-1`) |
| A box with a border and a tint around a message | `.notice` with `.notice-info`, `.notice-success` or `.notice-error` (they arrive and announce themselves). Check the text colour on the tint with `node scripts/check-contrast.mjs`: a small `neutral-500` note on `neutral-50` is below the floor |
| A hand-rolled `animate-*` on a `.notice` | nothing: `.notice[role]` already arrives, and a later utility class overrides it. The script cannot see this |
| `shadow-lg`, `shadow-xl` | the token it resolves to (`shadow-overlay`, `shadow-modal`): the same render, and the name says which tier |
| A confirmation after a record was made or sent | `SuccessState` (`SUC-3`). A safe, reversible act (add to cart, a setting) stays inline or a toast; `SuccessState` there is wrong |
| Everything centred, including long text | a left edge (`TYP-7`), a line length of about 70 characters (`TYP-1`) |
| A card around every section | space groups, not boxes (`PER-1`); no box inside a box (`ui.md`) |
| Two or three filled accent buttons | one loud button, the rest quiet (`PER-9`, `COL-4`) |
| A decorative blob, illustration or gradient behind the heading | nothing; the headline is the hero |
| A hero figure and a bigger headline at the same step | one largest thing (`HIE-1`) |
| An icon on every row, from the same set | an icon only where it carries meaning |
| Uppercase tracked labels everywhere | `micro` for a label, sentence case for the rest (`TYP-6`) |
| "Learn more" with no object; "Get started" with nowhere to go | the verb and the object ("View invoice") |
| Hype in the copy: elevate, seamless, unlock, supercharge | what it does, with a number or a noun (`06-content`) |
| A placeholder person, "John Doe", or lorem ipsum | a real example in the right locale |
| A second palette (`gray-*`, `slate-*`) or a hex | the tokens (Law 1) |
| Success that says "Success!" | what happened to which thing (`SUC-1`) |

## 3. Restyle, smallest edit first

1. Remove the tell. If a token or a primitive replaces it (`.lift`, `.skeleton`,
   `PageHeader`, `Section`, `StatusBadge`, `SuccessState`), use it; do not
   invent a look.
2. Fix the hierarchy last, once the noise is gone: the headline, the three
   stops, the one loud button (`HIE-1`, `HIE-2`).
3. Rewrite the copy in the words of the terminology table. Customer-facing
   strings stay in `apps/web/messages/*.json`, in both languages.
4. Two traps in the replacements: `.btn-text` is uppercase, tracked and `2xs`
   (it breaks `TYP-6` as a plain text link), and `.icon-btn` carries a backdrop
   blur (a tell itself). Where neither fits, keep the line and name it.
5. A comment in the `BASELINE` of `check-tells.mjs` is a record, not a ruling. If
   a tell has a token spelling that renders the same, use it and lower the
   baseline; say in the report that it was a rename and not a redesign.
6. Leave behaviour, data and permissions alone. A tell that is doing a real job
   (a scrim that keeps text legible over a photograph) stays, and is named in
   the report.

## 4. Prove it

```bash
node scripts/check-tells.mjs <file>   # the file's tells went down, none went up
node scripts/check-tells.mjs          # lower BASELINE in the same change where a count fell
node scripts/check-contrast.mjs       # removing a border moves its baseline too; --explain=<token> lists the uses
pnpm lint && pnpm typecheck && pnpm test
```

Render before and after at 280 and 1280, in both themes, when the page can
render (`scripts/lib/render-harness.mjs`; only `/admin/design-system` renders
without the API and a seeded database), and say so when it cannot. Report the
counts before and after, the tells you removed, the ones you kept and why, and
what you could not verify. A string you wrote in Urdu is a guess: mark it as
needing a native reviewer.
