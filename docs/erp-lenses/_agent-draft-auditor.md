# Draft auditor

Output of the `draft:auditor` agent (Draft phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Path

C:\Users\nommi\Downloads\scraper\yaseenecom\.claude\worktrees\lens-workflow-retry-scope-d435e4\docs\erp-lenses\_draft-auditor.md

## Stance

Pass or fail instrument. Every lens names an artifact the plan must contain and the diff must then hold; a rule that cannot fail a review is decoration. The section therefore ends in a named procedure with a written output (the scope map, in four parts) and five findings any one of which fails the PR on its own, so a reviewer can reject an otherwise correct diff by citing this section.

## Lenses Included

24

## Line Count

188

## Summary

Draft written. Structure: intro (kept verbatim from CLAUDE.md) plus a two-line stance paragraph; "The shop-scale five" carrying the owner's cart blockquote unchanged and the five original lenses, with a transition saying plainly that those five are the shop and what follows is what the same feature carries at group scale; "The group-scale twenty-four" as the plan's six groups (actor, authority, act in the world, money, scale, afterlife) with all 24 headline lenses, each a bold name, its question, and at most one further sentence; "The scoping pass, and how a reviewer fails it"; and the boundary paragraph. Verified by measurement, not by reading: section is 188 lines against the 190 cap (file is 193 including the two-line candidate-draft note and the --- rule); 24 bullets across 6 group headers; no entry exceeds 4 lines (max height 4); every prose line wraps at 78 or less, the file's own prose width, with the only exceptions being the owner's verbatim quote line that CLAUDE.md already wraps at 79 and the _canonical-decisions.md link; no emoji, no first person. Requirement 3 is met by the scope map (the shop-scale five in prose, one row per group-scale lens naming its artifact and where it lands, a written reason for each not-applicable, and separable capabilities sequenced as their own numbered work orders) plus five named review failures: a lens with no row, a row naming no artifact, an artifact in the map and absent from the diff, a "does not apply" with no reason, and a conflict resolved against a recorded ruling with no new ruling written. Requirement 4 is a single sentence in bold — a one-line fix runs no lenses, a named feature runs all of them — with the existing cross-references to Change minimization and No speculative functionality preserved. Both pointers are present: docs/erp-lenses/_index.md for the catalogue and docs/erp-lenses/_canonical-decisions.md for the rulings; note that neither file exists on disk yet. One correctness note against the plan text: the guard class is PermissionsGuard, confirmed at apps/api/src/core/auth/guards.ts:80, which matches the plan; CLAUDE.md's own pillar table calls it PermissionGuard at line 99, which is a pre-existing error in that table and outside this section, so it was left alone. CLAUDE.md was not modified.
