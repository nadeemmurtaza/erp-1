# Judge auditor

Output of the `judge:auditor` agent (Judge phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Scores

### _draft-terse.md

**Total:** 42

**Fidelity:** 8

**Voice:** 9

**Actionability:** 8

**Coverage:** 8

**Restraint:** 9

**Best Parts:** Names methods at their real owners and at exact signatures: InventoryService.defaultLocationId() (inventory.service.ts:161, doc comment literally reads "The MAIN location's id"), RolesService.create/.update (both exist, lines 60 and 91 — auditor degrades this to "RolesService at role-save time"), findPostedEntry(source, sourceRef) matching accounting.service.ts:176 character for character. The erasure lens names five real columns on five real models — JournalLine.contactId, AuditLog.data (core.prisma:226), InboundEmail.bodyText (crm.prisma:151), OutboxEvent.payload (core.prisma:364), ReplicationRecord (replication.prisma:49) — where auditor says only "every table still holding an erased person's identifiers". Strongest enforceable definition in the set: "An answer names an artifact: a column, a table, a permission key, a service method, a screen, a number." Only draft whose editions claim is testable: "One codebase, three editions — a lens that makes sense for only one edition is not a lens." Voice is indistinguishable from the live section: it carries `### The boundary, stated plainly` over unchanged and uses the same `- **Name.** sentence` bullet shape as CLAUDE.md lines 113-130.

**Worst Parts:** Both catalogue links are dead: docs/erp-lenses/_meta/_index.md and docs/erp-lenses/_meta/_canonical-decisions.md do not exist (git ls-files docs/erp-lenses/ returns only _agent-cluster.md, _agent-manifest.md, _cluster-analysis.md besides the numbered files), and the lens bodies are deliberately thin on the promise that evidence lives one level down. "at corporate edition" twice — the repo's own tier name is Organization (RETAIL-ERP.md:352 and :939, "Solo / Chain / Organization"), so this is a second vocabulary for one concept. No lens asks about 10k+ products or catalogue findability despite docs/erp-lenses/findability-at-scale/22-findability-at-scale.md being a whole domain. Preamble counts "100+ roles" but no lens separates rank from role (02-roles-ranks-orgchart.md). The Scope map code block ships a placeholder rather than one filled row.

### _draft-teacher.md

**Total:** 36

**Fidelity:** 8

**Voice:** 6

**Actionability:** 9

**Coverage:** 7

**Restraint:** 6

**Best Parts:** Highest density of verified repo fact in the set; four openers check out precisely. OrdersAdminController does carry exactly one class-level @RequirePermission('orders.manage') (orders.controller.ts:87-88). reverseEntry() does date the reversal now and resolve the period from it — `const now = new Date(); const period = await this.resolveOpenPeriod(now);` then `date: now, periodId: period.id` (accounting.service.ts:112-118) — and FiscalPeriod genuinely has no brand column (accounting.prisma:91-108). PaymentsService.refund() does take `amount?: number` (payments.service.ts:289) while onPaymentRefunded() ignores it and reverses receipt and sale in full (posting-rules.subscriber.ts:150-155) — the single highest-value verified fact in any draft. User genuinely has no partyId (core.prisma:11-50, it links to Contact). Best fail list by a margin: three of its six are greppable — "a permission key named in the plan that reaches no ROLE_PERMISSION_SEED grant, only a Permission row" (both seedPermissions() at seed.ts:82 and seedRoles() at seed.ts:128 exist, and this lands on the exact trap CLAUDE.md already tracks at its lines 210-212), "a scope column shipped nullable with no written meaning for null", "a write the plan never classified REQUEST or RECORD".

**Worst Parts:** Voice: the six narrative openers are a device CLAUDE.md uses nowhere in 42.9K. "The truck leaves Branch A at 09:40, the uplink drops at 09:45, the goods reach Branch B at 14:00" is good writing and is not this document's writing — CLAUDE.md states the rule and cites the symbol. Six in a row changes the register. Restraint: those openers cost ~18 lines and the shop-scale five are justified twice. Worst dead-link exposure of the three — it does not merely link _canonical-decisions.md, it states its contents ("settles the ledger against the right to erasure, the offline till against the approval gate, and dry run against the single writer") and claims "the seventy narrower ones behind them", about a file that does not exist. Also says "at Org" where the repo says Organization. Coverage: no roles/ranks distinction, no departments, no 10k+ products.

### _draft-auditor.md

**Total:** 34

**Fidelity:** 6

**Voice:** 7

**Actionability:** 7

**Coverage:** 7

**Restraint:** 7

**Best Parts:** Best structure of the three: the four-part scope map (the map / the lens rows / not-applicable-with-the-sentence / sequenced out) is more reviewable than either rival's single block. Its n/a rule shows the standard instead of asserting it — "'This feature writes no money fact' is a reason. 'N/A' is not, and silence is not." — where terse only says an n/a must carry a reason. Its boundary opener is the tightest statement of the rule anywhere: "**A one-line fix runs no lenses; a named feature or capability runs all of them.** Nothing sits in between." Its second boundary example covers the failure the discount-code example misses: "a scope column left out because this client has one brand is not a simpler schema, only a migration run later under deadline." Its framing of the group scale is accurate and well put: "not a second product and not an edition, but what the same feature must carry for all three to work."

**Worst Parts:** Fails its own stated stance. It opens "Each lens names an artifact" and then names fewer than either rival, degrading three the others get exactly: "the idempotency key" for findPostedEntry(source, sourceRef), "a refusal in RolesService at role-save time" for .create/.update (both methods exist, roles.service.ts:60 and :91), and "every table still holding an erased person's identifiers" for a list of five real tables. "name which of the five dimension columns it sets" is the worst line: JournalLine carries seven scope columns (organizationId, retailBrandId, branchNodeId, costCentreId, contactId, supplierId, counterpartyBrandId — accounting.prisma:185-197) and the draft names none, so a reviewer cannot resolve which five are meant. Two of its five findings are soft — "a row naming no artifact" needs a definition of artifact it never gives, and "a conflict resolved against a recorded ruling" depends wholly on the non-existent _canonical-decisions.md. Self-description CLAUDE.md never engages in: "It is written to be failed against", "a rule that cannot fail a review is decor", "Detail one level down." Same "corporate edition" slip.

## Winner

_draft-terse.md

## Must Fix

- Two dead links in the third paragraph: docs/erp-lenses/_meta/_index.md and docs/erp-lenses/_meta/_canonical-decisions.md do not exist. git ls-files docs/erp-lenses/ returns only _agent-cluster.md, _agent-manifest.md and _cluster-analysis.md besides the numbered domain files. The section cannot merge before they do, because its lens bodies are deliberately short on the promise that 'every lens with its repository evidence, worked example and done test' lives one level down — without the index the section is the whole rule and it is too thin. Write both files, or delete the sentence and inline what it defers.
- Replace 'corporate edition' (used twice, including 'the row count the largest table reaches at corporate edition') with the repo's own tier name, Organization. RETAIL-ERP.md:352 gives the table Solo | Chain | Organization and :939 gives 'EDITION presets (Solo / Chain / Organization)'. A second vocabulary for one concept is the parallel-systems failure in prose.
- No lens asks about catalogue scale. The preamble sells 100+ locations and 100+ actors but never 10k+ products, and 'The hundred-thousandth row' is about table size and index coverage, not findability, facets or list screens. docs/erp-lenses/findability-at-scale/22-findability-at-scale.md is a whole domain the section silently drops. Add a lens, or state in the preamble that catalogue scale is deferred to the index and name it there.
- Roles and ranks are collapsed. The preamble counts '100+ roles' but no lens distinguishes a rank (seniority band, who outranks whom for an approval) from a role (permission set). docs/erp-lenses/roles-ranks-orgchart/02-roles-ranks-orgchart.md exists because they differ; 'The threshold nobody approves alone' names amount bands and a role per band but never who is senior to whom.
- The Scope map code block ships a placeholder — '<lens name> — <answer, or `n/a — one clause why`>'. Every other copy-this instruction in CLAUDE.md shows the real thing. Replace it with one filled row, e.g. a 'The movement with no address' line naming a concrete locationId source, so the required shape is unambiguous.
- Strip lines 1-4, the draft scaffolding ('Candidate draft for CLAUDE.md's "Feature scope" section, not the adopted rule. / Stance: minimum text, maximum bite...'). They do not merge.
- Graft from teacher — three fail conditions verbatim, since terse's fail paragraph has none of them and all three are mechanically checkable: 'a permission key named in the plan that reaches no ROLE_PERMISSION_SEED grant, only a Permission row' (this one especially: seedPermissions() at seed.ts:82 and seedRoles() at seed.ts:128 both exist, and it closes the loop on the trap CLAUDE.md already documents at its own lines 210-212); 'a scope column shipped nullable with no written meaning for null'; 'a write the plan never classified REQUEST or RECORD'.
- Graft from teacher — exactly one worked example, the afterlife one, as a parenthetical inside 'The reversal document, not the reversal flag', not as a repeated six-opener structure: PaymentsService.refund() takes a partial amount (payments.service.ts:289) and onPaymentRefunded() ignores it, reversing both the receipt and the sale in full (posting-rules.subscriber.ts:150-155), so a token goodwill refund erases the whole sale from the ledger.
- Graft from teacher — a method name for terse's 'The period that already moved', which currently names none: reverseEntry() resolves the period from now rather than from the original entry's date (accounting.service.ts:112-113, 'const now = new Date(); const period = await this.resolveOpenPeriod(now);').
- Graft from teacher — a repo site for 'Whose rows, and which columns', which currently cites none: OrdersAdminController carries one class-level @RequirePermission('orders.manage') (orders.controller.ts:87-88), so the key that lets a junior edit a staff note also pushes a DELIVERED order to RETURNED. Half a line, best available illustration.
- Graft from auditor — its n/a rule, which shows the bar instead of asserting it: "'This feature writes no money fact' is a reason. 'N/A' is not, and silence is not." Terse only says an n/a must carry a reason.
- Graft from auditor — its boundary opener as terse's first boundary sentence: '**A one-line fix runs no lenses; a named feature or capability runs all of them.** Nothing sits in between.' Terse takes three clauses to say this.
- Graft from auditor — its second boundary example, since terse closes on the discount-code case alone (a shop-scale failure) and this covers the group-scale one: 'a scope column left out because this client has one brand is not a simpler schema, only a migration run later under deadline.'
- Do NOT graft: auditor's self-description ('It is written to be failed against', 'a rule that cannot fail a review is decor', 'Detail one level down.') — no reviewer can act on it and the fail list proves the point; auditor's 'the five dimension columns' — JournalLine has seven (accounting.prisma:185-197) and auditor names none, where terse's enumerated five is correct; teacher's sentence describing what _canonical-decisions.md settles — even once that file exists, a summary of its contents in CLAUDE.md is a second copy that will drift.
- Fix CLAUDE.md's own pre-existing error while in here: line 114 says 'JwtAuthGuard + PermissionGuard on every route'. The class is PermissionsGuard (apps/api/src/core/auth/guards.ts:80). All three drafts spell it correctly; the live file does not.

