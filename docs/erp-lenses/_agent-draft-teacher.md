# Draft teacher

Output of the `draft:teacher` agent (Draft phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Path

C:\Users\nommi\Downloads\scraper\yaseenecom\.claude\worktrees\lens-workflow-retry-scope-d435e4\docs\erp-lenses\_draft-teacher.md

## Stance

The worked examples carry the weight. Each of the six groups opens with one real, verified case from this repository — a franchisee's manager who is three rows, a class-level orders.manage that turns a staff-note edit into a ledger reversal, a truck that arrives while the uplink is down, a December sale reversed into March, one stock-adjust screen drawn at three editions, a partial refund that erases a whole sale — and that group's lenses fall out of the case rather than standing above it. Discipline on length was kept: the section is 187 lines against the 190 budget, with all 24 headline lenses retained by compressing prose rather than cutting lenses to the catalogue.

## Lenses Included

24

## Line Count

187

## Summary

Replacement section drafted at docs/erp-lenses/_draft-teacher.md, opened by a two-line note marking it a candidate draft rather than the adopted rule.

Structure: the owner's cart blockquote and the original five lenses are kept verbatim as "The shop-scale five", explicitly framed as what makes a feature whole at one shop; "The same feature when the shop is a group" then carries all 24 headline lenses in the plan's six groups (actor 3, authority 4, act in the world 3, money 5, scale 4, afterlife 5), each group led by a concrete repo case. Then a scoping pass with a written deliverable (a `### Scope lenses` block in the plan, one line per lens carrying an answer or an `n/a` with its reason) and a six-item list a reviewer can fail a PR against. Then the boundary paragraph, preserved in spirit: no lens reaches a bug fix or a one-line change, every group reaches a named feature. Closes with pointers to docs/erp-lenses/_index.md and docs/erp-lenses/_canonical-decisions.md.

Constraints verified by command, not by reading: section 187 lines (limit 190); max prose width 79 characters, matching CLAUDE.md exactly; no lens entry exceeds 4 lines; no emoji; no first person; CLAUDE.md untouched (git status shows only the untracked draft).

Every worked example was checked against source before use: orders.controller.ts:87, inventory.controller.ts:51, accounting.service.ts:113 (resolveOpenPeriod(now)), accounting.prisma:91 (FiscalPeriod has no brand column), payments.service.ts:297 and posting-rules.subscriber.ts:150-155. PERMISSION_CATALOG and ROLE_PERMISSION_SEED confirmed in apps/api/prisma/seed.ts.

Two deliberate departures from the plan's wording. First, the plan's money group pairs "reverseEntry() reroutes to today's open period" with "recordCashMovement() throws"; the throw I could find is on a closed shift, not a closed fiscal period, so rather than print an imprecise contrast in a section whose whole stance is that the examples must be true, I dropped that half and kept the verified reverseEntry behaviour plus the missing FiscalPeriod brand column. Second, the afterlife example was written with PKR amounts; since this file is the repository's own zero-hardcoding standard, the figures were replaced with currency-free phrasing.

Flag for the parent agent: docs/erp-lenses/_index.md and docs/erp-lenses/_canonical-decisions.md do not exist yet. Both are linked as required, at repo-root-relative paths (correct once the section sits in CLAUDE.md, not resolvable from the draft's own location), so the links are dead until those files are written.
