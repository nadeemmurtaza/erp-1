---
name: ux-audit
description: Audit a screen, flow or area for what is broken, against the numbered design laws, with measurements. Use when asked to audit, review or critique an existing page, find UX problems, or check a screen before a release. Read-only; returns ranked findings with file and line, never a vague opinion.
argument-hint: "<route, component or area to audit>"
---

# /ux-audit: what is broken, and the proof

Audit by measuring, then by reading, and only then by judging. A finding without
a law ID, a `file:line` and evidence is an opinion, and opinions are not
findings. This skill changes no file: it returns the list, and fixing is a
separate step the person asks for.

## 1. Locate it

`docs/index/cross/ui-routes.md` for the route and its file, `components.md` for
what it is built from, `permissions.md` for who may see it. Read the page's
code in full before judging it.

## 2. Measure first

Run what the repository already measures, and quote the numbers. This skill
changes no file, so run the checks one at a time: `pnpm lint` also installs the git
hooks and writes a build cache, which an audit must not do.

```bash
node scripts/check-contrast.mjs        # contrast in both themes
node scripts/check-links.mjs           # links resolve, images exist, no orphan screen
node scripts/check-danger.mjs          # destructive labels name the act and its object
node scripts/check-menus.mjs           # short native selects, native date inputs
node scripts/check-clipboard.mjs       # a clipboard call outside CopyButton and lib/copy.ts
node scripts/check-rebrand.mjs         # Law 1, brand axis
node scripts/check-rules.mjs           # every cited law ID exists
node scripts/check-tells.mjs <the files you are auditing>   # the machine-made look, with file:line
python scripts/nested-borders.py       # a box inside a box (ui.md)
(cd apps/web && npx eslint <files, relative to apps/web>)   # jsx-a11y and the rest; the config lives in the app, not the root
```

The four repository-wide greps from `CLAUDE.md` ("Before you open a PR") are totals
and say nothing about one page. Run each on the target path as well and quote both
numbers:

```bash
grep -n "style={{" <target>                                 # inline styles
grep -n "toLocaleString\|toLocaleDateString" <target>       # stray formatting
grep -n "await fetch(\|= fetch(" <target>                   # bare fetch
grep -on "text-gray-[0-9]*\|bg-gray-[0-9]*" <target>        # a second palette
```

Render when the page can render. At 280, 380, 640, 768, 1024, 1280 and 1536,
light and dark, with `scripts/lib/render-harness.mjs`. The only page that renders
without the API and a seeded database is `/admin/design-system`. Do not try to
render any other: read the code and say plainly that it was not rendered, and that
hierarchy and width are judged from the code.

## 3. Read it against the laws

Go family by family. Cite the ID for every finding. Where a rule has no numbered
law (sentence case, the terminology table, English in JSX), cite the chapter and
section ("06-content, Localisation") and the nearest ID (`ITG-9` for an untranslatable
string, `GLO-6` for a concatenated sentence). A problem outside the design laws
(a security hole, a data-loss path) gets no law ID: say so, name the rule file
(`.claude/rules/security.md`) and hand it to the `security` agent rather than
ranking it yourself.

| Look at | Laws |
|---|---|
| Hierarchy: one headline, three stops, one loud button | `HIE-1`, `HIE-2`, `PER-9`, `COL-4`, `COG-12` |
| States: empty (three kinds), loading, error, permission, module absent | `04-states.md`, `FLO-7`, `PRM-2`, `PRM-5`, `MOD-1` |
| Dead ends: every state has a forward action and a way out | `ITG-1`, `FLO-1`, `FLO-15` |
| A success: specific, next step, surface, open loop, joy | `SUC-1` to `SUC-5` |
| Forms, danger, menus, uploads, cards, copying | `FRM`, `DNG`, `MNU`, `UPL`, `CRD`, `CPY` |
| Space and width: nothing wasted, no ring around a void, seven widths | `SPA-4`, `ITG-4`, `ITG-8` |
| Words: the terminology table, no raw errors, no hype | `06-content`, `FLO-7` |
| Access: keyboard, focus, targets, contrast, reduced motion, RTL | `ACC`, `ITG-11`, `ITG-12`, `GLO-2` |
| Motion: communicates, transform and opacity, tokens | `MOT-1`, `MOT-5` |
| Reachable: a nav entry, a real grant | `ITG-5`, `NAV-6`, `PRM-1` |

## 4. Report

Rank by what it costs the person, not by how easy it is to fix.

| Rank | Means |
|---|---|
| S1 | blocks the person's job, loses their data, or breaks a law that a command already checks (the build would fail) |
| S2 | breaks a law; the person can still finish. A binding law that no command checks (a hardcoded string, a second primary button) is S2 unless it blocks the job, and the report says that no command catches it |
| S3 | polish |

For each finding: the rank, the law ID, `file:line`, the evidence (a command's
output or the quoted code), and the smallest fix. Then three short lists:

- **Introduced by this branch** versus **already there**. Audit the working tree,
  not only `HEAD`: `git diff origin/main...HEAD` for what the branch committed,
  `git diff HEAD` for what it has not, `git blame` for the rest. Blame stops at the
  oldest commit this checkout has, so say "at least since" for anything it
  attributes there. Do not pin old problems on new work.
- **What I could not check**, and why.
- **What is good**, in one line, so the next change does not undo it.

```
AUDIT: <target>   (working tree at <short sha>, <n> files uncommitted)
Measured:      <command: number> ... (repository-wide and on the target)
Findings:      S1/S2/S3  <law ID>  <file:line>  "<evidence>"  fix: <smallest change>
Introduced / already there / Not checked / What is good
```

Finish by offering the fix list as a plan. Do not start editing.
