# Judge engineer

Output of the `judge:engineer` agent (Judge phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Winner

_draft-terse.md

## Must Fix

- Dead links: docs/erp-lenses/_meta/_index.md and docs/erp-lenses/_meta/_canonical-decisions.md do not exist in the worktree or main — either both files land in the same commit or the links come out; a dead link in CLAUDE.md violates its own 'No dead ends' section (line 376).
- 'Corporate edition' (terse lines 47, 133) is not this repo's vocabulary — RETAIL-ERP.md:350 (R14) names the three editions Solo / Chain / Organization. Use those names and cite R14.
- Restore the incumbent's framing clauses that terse drops: CLAUDE.md line 146's 'stated directly and repeated because it was under-applied' and line 150's 'This section is the method for finding the rest of it'. Auditor keeps both.
- Restore the named reachability trap: current CLAUDE.md lines 209-212 name seedPermissions() vs seedRoles() as this repo's own tracked instance; terse lines 176-177 keep the rule but lose the instance.
- Give the scope map a home in the existing artifact: '## Scope map' floats free. Put it inside the '## Implementation Plan' block at CLAUDE.md line 520 as '### Scope lenses', beside '### Out of Scope', the way teacher does at lines 158-160.
- Cut one of the two discount-code passages (terse lines 9-10 and 192-193 make the same point). A draft whose stance is 'minimum text' is already 1,816 words against the incumbent's 790.
- Fix CLAUDE.md's own spelling while landing this: lines 99 and 117 say PermissionGuard; the class at apps/api/src/core/auth/guards.ts:80 is PermissionsGuard. All three drafts get this right, the surrounding file does not.

## Scores

### _draft-terse.md

**Fidelity:** 8

**Voice:** 8

**Actionability:** 8

**Coverage:** 9

**Restraint:** 8

**Total:** 41

**Best Parts:** Coverage paragraph lines 43-47 is the best in the set: 'One codebase, three editions — a lens that makes sense for only one edition is not a lens' is the only clause anywhere that turns three-editions-from-one-build into a test a lens can fail. Best fail sentence in the set at lines 180-183 ('...when a line is blank, "TBD", "handled", or any answer naming no artifact; when an n/a carries no reason; or when the diff contradicts a line of it'). Most precisely named symbols: InventoryService.defaultLocationId() is the only class-qualified form of the three (confirmed inventory.service.ts:166); RolesService.create/.update names both methods and both exist (roles.service.ts:60,91); findPostedEntry(source, sourceRef) is the exact signature (accounting.service.ts:176); the five-table erasure list at lines 150-153 all check out. '(29 lines, in order)' at line 166 is arithmetic a reviewer can verify — 5+3+4+3+5+4+5 = 29, correct.

**Worst Parts:** 'Corporate edition' at lines 47 and 133 is invented vocabulary for what R14 calls Organization. The two dead catalogue links sit in paragraph two, before any content. Drops the incumbent's own why-this-exists clauses. '## Scope map' does not say where it lives relative to the '## Implementation Plan' template already in CLAUDE.md at line 520. Claims 'minimum text' while running 1,816 words against 790, and repeats the discount-code example already made in the intro.

### _draft-auditor.md

**Fidelity:** 6

**Voice:** 9

**Actionability:** 8

**Coverage:** 8

**Restraint:** 7

**Total:** 38

**Best Parts:** Best voice match: keeps the incumbent's opening verbatim through 'This section is the method for finding the rest of it', keeps 'The boundary, stated plainly' as a heading, and its em-dash group glosses ('**2. The authority** — which rows, how much, which pairs, who may change it.') are the exact shape of the 'Scale: the three axes' bullets; the closing 'Detail one level down' echoes Law 2 without quoting it. Best single reviewer line anywhere in the set, line 168: "'This feature writes no money fact' is a reason. 'N/A' is not, and silence is not." Lines 46-49 are the clearest statement that this is one build: '...not a second product and not an edition, but what the same feature must carry for all three to work.' Lines 186-187 are the best sentence for killing the one-brand argument: 'a scope column left out because this client has one brand is not a simpler schema, only a migration run later under deadline.' Its four-part scope map is the best-structured artifact spec, and 'the group-scale twenty-four' counts correctly (3+4+3+5+4+5).

**Worst Parts:** Systematically strips the symbol out of lenses the other two carry: 'the five dimension columns' (line 103) instead of naming them, 'the idempotency key' (line 102) instead of findPostedEntry(source, sourceRef), 'a refusal in RolesService at role-save time' (line 78) instead of .create/.update, 'a second brand in a second country' (line 109) instead of RetailBrand, unqualified 'defaultLocationId()' (line 92), and an erasure lens at lines 148-150 that says 'Name every table' while naming none. It sets the standard at line 16 — 'a rule that cannot fail a review is decor' — and several of its own lenses are decor by it. Most meta-text of the three (lines 14-16, 46-49, 52-54). Scope-map part 1 demands 'The shop-scale five, in prose. Three paragraphs is enough' — prose I would resent composing on the fifth feature.

### _draft-teacher.md

**Fidelity:** 9

**Voice:** 6

**Actionability:** 9

**Coverage:** 6

**Restraint:** 6

**Total:** 36

**Best Parts:** Highest fidelity: six worked cases, six confirmed against the repo. User has no link to Party (core.prisma); TradingPartner authenticates by inboundApiKeyHash (trading-partners.prisma); OrdersAdminController carries one class-level @RequirePermission('orders.manage') (orders.controller.ts:85-88, verbatim); reverseEntry() dates at now and resolves the period from it (accounting.service.ts:113-114, 'const now = new Date(); const period = await this.resolveOpenPeriod(now);'); FiscalPeriod has no brand column; adjust() resolves defaultLocationId() (inventory.controller.ts:41,51). Its refund case at lines 135-137 is the single highest-value claim in the whole set: PaymentsService.refund() (payments.service.ts:289-299) accepts, validates and persists a partial refundAmount while onPaymentRefunded() (posting-rules.subscriber.ts:150-156) reverses the receipt and the sale whole — contradicting that subscriber's own docblock at lines 141-147, which asserts 'nothing sets it to less than the full amount'. Best fail list, every item greppable in this repo: 'a permission key named in the plan that reaches no ROLE_PERMISSION_SEED grant, only a Permission row' (the trap CLAUDE.md lines 209-212 already tracks), 'a write the plan never classified REQUEST or RECORD', 'a scope column shipped nullable with no written meaning for null'. Lines 158-160 put the output inside the existing plan template under '### Scope lenses'. 'at Org' (line 133) is the correct edition name.

**Worst Parts:** Voice: the six bold narrative openers are a device CLAUDE.md never uses — '**3. The act in the world.** The truck leaves Branch A at 09:40, the uplink drops at 09:45, the goods reach Branch B at 14:00' is good writing and unmistakably not this file; the nearest thing CLAUDE.md has is a one-line aphorism (line 243). Weakest coverage: scale is one passing clause at lines 48-50, three-editions-from-one-build never becomes a rule, 'all departments' absent. Longest at 1,921 words, and the six scenes are precisely the removable part. Worst single fidelity failure in the set: lines 187-193 fabricate detail about files that do not exist, claiming _index.md holds 'the seventy narrower ones' and that _canonical-decisions.md 'settles the ledger against the right to erasure, the offline till against the approval gate, and dry run against the single writer' — three specific rulings attributed to an absent file. Do not graft that paragraph.

