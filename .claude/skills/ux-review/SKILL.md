---
name: ux-review
description: Review a diff for UX defects before it merges. Use when asked to review UI changes, check a PR that touches components, pages or CSS, or before opening a PR that changes what a person sees. Reads only the added lines, checks them against the design laws and the commands that bite, and returns Ship or Fix first.
argument-hint: "[PR number, branch, or empty for this branch against main]"
---

# /ux-review: review the diff, not the file

Review what this change adds. A problem that was already there is not a finding
against this diff: list it once, separately, and move on. Read-only: this
returns a verdict and a list, and changes no file unless the person asks.

## 1. Get the diff

A branch that is committed:

```bash
git fetch origin main
git diff origin/main...HEAD --stat
git diff origin/main...HEAD -U0 -- 'apps/web/src' 'apps/web/messages' 'apps/pos/src' 'packages/shared/src' '*.css'
```

Work that is not committed yet (no fetch is needed). `git diff` does not list new
files, so list those and read them whole:

```bash
git diff HEAD --stat
git diff HEAD -U0 -- 'apps/web/src' 'apps/web/messages' 'apps/pos/src' 'packages/shared/src' '*.css'
git ls-files -o --exclude-standard -- apps packages
```

For a PR number, read its files and diff through the GitHub tools. List what
changed that a person can see: pages, components, copy in `messages/*.json`,
tokens, CSS.

## 2. Run what bites on this diff

This skill changes no file, and `pnpm lint` installs the git hooks and writes a build
cache, so run the checks one at a time. `pnpm lint` and `pnpm test` are the
authority before a merge: run them when you are allowed to write, and say which you
ran.

```bash
node scripts/check-contrast.mjs && node scripts/check-links.mjs && node scripts/check-danger.mjs
node scripts/check-menus.mjs && node scripts/check-clipboard.mjs && node scripts/check-rebrand.mjs && node scripts/check-rules.mjs
node scripts/check-tells.mjs <the changed and new files>    # file:line for each tell
pnpm --filter @newax/web exec tsc --noEmit
pnpm --filter @newax/web test
(cd apps/web && npx eslint <the changed files, relative to apps/web>)
```

Compare the counts the repository watches against `HEAD`, so a number that grew is
caught. Same pipeline both sides, so the numbers can be compared:

```bash
git grep -n 'style={{' HEAD -- 'apps/web/src/*.tsx' | wc -l     # HEAD
grep -rn 'style={{' apps/web/src --include='*.tsx' | wc -l      # working tree (includes new files)
```

and the same pair for `toLocaleString\|toLocaleDateString` and
`await fetch(\|= fetch(` (drop the `*.tsx` restriction), and `grep -ro
'text-gray-[0-9]*\|bg-gray-[0-9]*' apps/web/src | wc -l` for a second palette. Quote
both numbers.

## 3. Read the added lines

Quote the line for each finding. A line the diff touched only to rename a token
is judged on what it newly does: the token it carried over is "already there", and
narrowing `transition-all` to `transition-[width]` is no worse than before. Check,
in this order:

1. **Law 1.** A hex, a pixel size, a colour, a locale or a company name typed in
   code instead of imported from `@newax/shared`.
2. **Use what exists.** A new component, class or helper that the "Use what
   exists" table or `docs/index/cross/components.md` already has. A duplicate is
   a defect.
3. **Hierarchy.** One headline and three stops (`HIE-1`, `HIE-2`); exactly one
   filled accent button in its region (`PER-9`, `COL-4`). A region is what a person
   sees as one screen state: the page, or a dialog or sheet on top of it. A result
   that appears on a page with its own loud button (a form's Import above a
   success state's View) is two loud buttons in one region.
4. **States.** Every new async view has loading, empty (which of the three
   kinds), error (what, why, next: `FLO-7`) and the permission and absent-module
   cases. A view with only the happy path is incomplete.
5. **Dead ends.** Every new state has a forward action and a way out (`ITG-1`).
6. **Success.** Specific, a next step, the right surface for the stakes, at most
   one open loop, and no celebration on a routine save (`SUC-1` to `SUC-5`).
7. **Danger.** A destructive control names the act and its object, sits off the
   happy path and carries the right `ACT-6` tier (`DNG-1` to `DNG-6`).
8. **Words.** The terminology table, no raw error text, no hype, and no English
   typed into customer-facing JSX.
9. **Right to left.** `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`,
   `text-left`, `text-right` on an added line is a bug (`GLO-2`).
10. **Motion.** Transform and opacity only, from the tokens, with reduced motion
    keeping the information (`MOT-1`, `MOT-4`, `MOT-5`). No `transition-all`.
11. **Access.** Keyboard reaches it, focus is visible, targets are 44 px,
    contrast holds in both themes (`ACC`).
12. **Reachable.** A new page has a nav entry, and its permission reaches a role
    a real person holds, not only a `Permission` row (`CLAUDE.md`, "A feature
    ships whole").

## 4. Report

```
VERDICT: Ship | Fix first
Blocking:      <law ID> <file:line> "<the added line>" : what is wrong, the smallest fix
Non-blocking:  the same shape
Counts:        style={{ 27 -> 27 | toLocaleString 6 -> 6 | bare fetch 6 -> 6 | tells ...
Already there: problems this diff did not add, once
Not checked:   what needs a render or the API, and that it was not run
```

**Blocking** means the diff introduces it, on a path a person reaches, and it breaks a
law a command checks, loses data, leaves a dead end, or puts two loud buttons in one
region. **Non-blocking** is introduced but a judgement or polish (a plural, a tint),
or a carried-over token on a line the diff touched. A diff with a blocking finding is
"Fix first" however small the diff. Do not soften a finding because the author is the
person asking.

Always list under **Not checked**: `pnpm check:overflow` (the seven widths needs the
real stack), dark-theme contrast of any new tint, 44 px targets, right-to-left, reduced
motion and the real API's shape, unless you ran them.
