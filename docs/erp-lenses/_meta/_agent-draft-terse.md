# Draft terse

Output of the `draft:terse` agent (Draft phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Path

C:\Users\nommi\Downloads\scraper\yaseenecom\.claude\worktrees\lens-workflow-retry-scope-d435e4\docs\erp-lenses\_draft-terse.md

## Stance

Minimum text, maximum bite. Every lens is a name plus one question a reviewer can paste verbatim into a PR comment; prose appears only where a sentence prevents a misreading. A rule is obeyed in proportion to how fast it can be re-read.

## Lenses Included

29

## Line Count

188

## Summary

Replacement "Feature scope" section written to docs/erp-lenses/_meta/_draft-terse.md (193 lines total: a two-line candidate-draft note, a rule, then 188 lines of section text — under the 190 cap).

Structure: the owner's cart blockquote and the original five lenses are kept intact as the opening group, "The shop-scale five, in the owner's own words", followed by one sentence stating plainly that those five scope a feature for one shop with one till and that the six groups below are what the SAME feature needs when the shop is a group (one Organization, several brands, 100+ locations, 100+ actor kinds, three editions from one build).

Lenses: 5 shop-scale + 24 headline = 29, grouped exactly as the consolidation plan groups them — 1. The actor (3), 2. The authority (4), 3. The act in the world (3), 4. The money (5), 5. The scale (4), 6. The afterlife (5). Every entry is a bold name, the question, and at most one further sentence; no entry exceeds four lines (verified by script). Questions name concrete artifacts from the plan — PERMISSION_CATALOG keys, InventoryService.defaultLocationId(), findPostedEntry(source, sourceRef), the five JournalLine dimension columns, CLOSED/LOCKED FiscalPeriod, JournalLine.contactId and OutboxEvent.payload.

Failable procedure: "The scoping pass, and the artifact it produces" requires a `## Scope map` section in the written plan with one line per lens (29, in order), each answer naming an artifact — a column, table, permission key, service method, screen or number. A reviewer fails the PR when the map is missing, when a line is blank/"TBD"/"handled"/names no artifact, when an n/a carries no reason, or when the diff contradicts a line. Citing a _canonical-decisions.md ruling is an answer; deciding a conflict privately inside a PR is not. The two existing non-negotiables (in scope now vs. named-and-sequenced work order; reachability — UI, nav entry, permission seeded to a real grant) are kept as the map's two closed questions.

Boundary preserved: "The boundary, stated plainly" says a one-line fix, a bug, or an already-narrow request gets NONE of this and remains governed by Change minimization and No speculative functionality; a named feature or capability gets ALL of it. The discount-code-field-with-no-voucher-management test is kept verbatim in spirit.

Pointers: docs/erp-lenses/_meta/_index.md for the full catalogue with worked examples, docs/erp-lenses/_meta/_canonical-decisions.md for the conflict rulings — both cited in the section's opening, before any lens, so the overview comes first and the detail sits one level down.

Verified by command: 24 bold lens entries; per-group counts 3/4/3/5/4/5 matching the plan; zero entries over four lines; zero lines over 79 characters (CLAUDE.md's own prose width in this section is 79); zero first-person pronouns; no emoji. CLAUDE.md was not touched — git status shows only the untracked draft.
