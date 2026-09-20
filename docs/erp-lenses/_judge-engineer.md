# Judge: the engineer who has to obey this next week

Judging as a senior engineer on this repository who will be handed a real work
order that says "build returns" and will have to produce whatever this section
demands, then defend it in review — and who will have to read the section again
on the fifth feature without skipping it.

The three candidates are `_draft-terse.md`, `_draft-teacher.md`,
`_draft-auditor.md`. The incumbent is CLAUDE.md lines 144–225.

## What I verified in the repository

Every symbol below was opened and confirmed in this worktree before scoring
fidelity. Line numbers are from the worktree at the time of judging.

| Claim | Where | Verdict |
|---|---|---|
| `PERMISSION_CATALOG` | `packages/shared/src/permissions.ts:45` | true |
| `PermissionsGuard` (not `PermissionGuard`) | `apps/api/src/core/auth/guards.ts:80` | true — and CLAUDE.md's own line 99 spells it wrong |
| `InventoryService.defaultLocationId()` | `apps/api/src/modules/inventory/inventory.service.ts:166` | true |
| `adjust()` resolves `defaultLocationId()` | `apps/api/src/modules/inventory/inventory.controller.ts:41,51` | true — it is the controller's `adjust()`, and it then calls `inventory.move()` |
| `findPostedEntry(source, sourceRef)` | `apps/api/src/modules/accounting/accounting.service.ts:176` | true, exact signature |
| The five `JournalLine` dimension columns | `apps/api/prisma/schema/accounting.prisma:162` | true — `organizationId`, `retailBrandId`, `branchNodeId`, `costCentreId`, `counterpartyBrandId` all present |
| Thirteen-account chart | `apps/api/src/modules/accounting/chart-of-accounts.ts` | true — exactly 13 entries |
| `FiscalPeriod` status `CLOSED`/`LOCKED`, and no brand column | `accounting.prisma:80-84, 91` | true on both |
| `reverseEntry()` dates at `now` and resolves the period from it | `accounting.service.ts:102,113-114` | true — `const now = new Date(); const period = await this.resolveOpenPeriod(now);` |
| `OrdersAdminController` has one class-level `@RequirePermission('orders.manage')` | `apps/api/src/modules/orders/orders.controller.ts:85-88` | true, verbatim |
| `RolesService.create` / `.update` | `apps/api/src/core/auth/roles.service.ts:60, 91` | true, both exist |
| `ROLE_PERMISSION_SEED` vs a bare `Permission` row | `apps/api/prisma/seed.ts:7,100,116` | true |
| `User` has no link to `Party` | `core.prisma` `model User` | true — no party field |
| `TradingPartner` authenticates by key hash | `trading-partners.prisma` `inboundApiKeyHash String? @unique` | true |
| Erasure tables: `JournalLine.contactId`, `AuditLog.data`, `InboundEmail.bodyText`, `OutboxEvent.payload`, `ReplicationRecord` | accounting / core / crm / replication prisma | all five true |
| `PaymentsService.refund()` takes a partial amount, `onPaymentRefunded()` reverses in full | `payments.service.ts:289-320`, `posting-rules.subscriber.ts:150-156` | **true, and better than the code's own docblock** — see below |
| The three editions | `docs/implementation/RETAIL-ERP.md:350` (R14) | **Solo / Chain / Organization** — "corporate edition" is not this repo's word |
| `docs/erp-lenses/_index.md`, `_canonical-decisions.md` | — | **do not exist**, in the worktree or in `main` |

The refund finding deserves calling out because only one draft has it. The
subscriber's docblock at `posting-rules.subscriber.ts:141-147` asserts
"`Payment.refundAmount` exists but nothing sets it to less than the full
amount". That is false: `refund()` at `payments.service.ts:297-299` computes
`const refundAmount = amount ?? payment.amount`, validates it as `1..amount`,
persists it and publishes it. `onPaymentRefunded()` then reverses both the
receipt and the sale entries whole. Teacher's line 135-137 is the only draft
text in the set that contradicts a comment in this repository and is right.

The missing index is a shared defect. All three drafts link
`docs/erp-lenses/_index.md`; all three link `_canonical-decisions.md`. Neither
file is in the tree. Whichever draft is adopted ships CLAUDE.md with two dead
links, against this file's own "No dead ends" section (line 376) and its
documentation-first rule.

## Score table

Out of 10 each, 50 total.

| | terse | teacher | auditor |
|---|---|---|---|
| Fidelity | 8 | 9 | 6 |
| Voice | 8 | 6 | 9 |
| Actionability | 8 | 9 | 8 |
| Coverage | 9 | 6 | 8 |
| Restraint | 8 | 6 | 7 |
| **Total** | **41** | **36** | **38** |

### terse — 41

**Fidelity 8.** Every symbol it names is real and most are named more precisely
than the other two: `InventoryService.defaultLocationId()` is the only
class-qualified form in the set; `RolesService.create`/`.update` names both
methods and both exist; `findPostedEntry(source, sourceRef)` carries the exact
signature; the erasure list at lines 150-153 names five tables and all five
check out. Two deductions: "corporate edition" at lines 47 and 133 is invented
vocabulary for what R14 calls **Organization**, and the two dead catalogue
links sit in paragraph two, before any content.

**Voice 8.** Declarative, reason-carrying, no meta-commentary — the register of
"Scale: the three axes". It loses the incumbent's own framing clause, though:
CLAUDE.md line 146 says the instruction is "stated directly and repeated
because it was under-applied", and line 150 says "This section is the method
for finding the rest of it". Terse drops both, so the section arrives without
the sentence that says why it exists.

**Actionability 8.** The best single fail sentence in the set, lines 180-183:
"A reviewer fails the PR when there is no scope map; when a line is blank,
'TBD', 'handled', or any answer naming no artifact; when an `n/a` carries no
reason; or when the diff contradicts a line of it." And "(29 lines, in order)"
at line 166 is arithmetic a reviewer can check — 5 + 3 + 4 + 3 + 5 + 4 + 5 = 29,
correct. Deducted because the scope map is a free-floating `## Scope map` that
does not name where it lives relative to the `## Implementation Plan` template
already in this file at line 520.

**Coverage 9.** Lines 43-47 are the best scale paragraph of the three: "one
Organization, several brands, 100+ locations across timezones, 100+ kinds of
actor, 100+ roles, every department a corporate runs. One codebase, three
editions — a lens that makes sense for only one edition is not a lens." That
last clause is the only place in any draft that turns three-editions-from-one-
build into a test a lens can fail.

**Restraint 8.** Tightest per-lens phrasing, no paragraph about the section
itself. But the stance line claims "minimum text" and the draft is 1,816 words
against the incumbent's 790 — it more than doubles the section. The
discount-code example appears in the boundary at line 192 having already been
made by the cart example at line 9.

### teacher — 36

**Fidelity 9.** The highest, and I tried hardest to break it. Six worked cases,
six confirmed: the `User`/`Party` gap, `TradingPartner` key-hash auth, the
class-level `orders.manage` on `OrdersAdminController` — "so the key that lets
a junior edit a staff note also pushes a DELIVERED order to RETURNED" is a fair
reading of one class-level decorator over the whole controller — `reverseEntry`
dating to `now`, `adjust()` and `defaultLocationId()`, and the partial-refund
case above. Not 10, because the catalogue paragraph at lines 187-193 fabricates
detail about files that do not exist: it claims `_index.md` holds "the seventy
narrower ones" and that `_canonical-decisions.md` "settles the ledger against
the right to erasure, the offline till against the approval gate, and dry run
against the single writer". Three specific rulings attributed to an absent
file. That is the one kind of error this section exists to prevent.

**Voice 6.** The six bold narrative openers are a device CLAUDE.md never uses.
"**3. The act in the world.** The truck leaves Branch A at 09:40, the uplink
drops at 09:45, the goods reach Branch B at 14:00" is good writing and is
unmistakably not this file. The nearest thing CLAUDE.md has is the aphorism at
line 243, "A branch is a point in time. A sector is a configuration." — one
line, no scene.

**Actionability 9.** The best fail list, because every item maps to something I
can actually check in this repo: "a permission key named in the plan that
reaches no `ROLE_PERMISSION_SEED` grant, only a `Permission` row" is the
repository's own tracked trap, already named at CLAUDE.md lines 209-212; "a
write the plan never classified REQUEST or RECORD"; "a scope column shipped
nullable with no written meaning for null". And lines 158-160 put the output
inside the existing plan template under `### Scope lenses`, which is where it
belongs rather than in a new artifact.

**Coverage 6.** Weakest. The scale statement is one passing clause at lines
48-50 — "a hundred kinds of actor... a hundred locations" — and three editions
from one build never becomes a rule. "at Org" at line 133 is the correct
edition name, but nothing in the draft says a lens must hold for all three.
"All departments" is absent.

**Restraint 6.** Longest at 1,921 words, and the six scene-setting paragraphs
are exactly the removable part: cut them and no lens loses a requirement.

### auditor — 38

**Fidelity 6.** Nothing it says is false; it says much less. It systematically
strips the symbol out of lenses the other two carry: "the five dimension
columns" (line 103) instead of naming them, "the idempotency key" (line 102)
instead of `findPostedEntry(source, sourceRef)`, "a refusal in `RolesService`
at role-save time" (line 78) instead of `.create`/`.update`, "a second brand in
a second country" (line 109) instead of `RetailBrand`, "`defaultLocationId()`"
unqualified (line 92), and an erasure lens at lines 148-150 that says "Name
every table" while naming none. It sets its own standard at line 16 — "a rule
that cannot fail a review is decor" — and several of its lenses are decor by
it.

**Voice 9.** The closest match. It keeps the incumbent's opening through "This
section is the method for finding the rest of it" (line 13), keeps "The
boundary, stated plainly" as a heading, and its group headers with an em-dash
gloss — "**2. The authority** — which rows, how much, which pairs, who may
change it." — are the exact shape of the "Scale: the three axes" bullets. The
closing "Detail one level down" at line 189 echoes Law 2 without quoting it.

**Actionability 8.** The four-part scope map is the best-structured artifact
spec, and line 168 is the best single line for a reviewer anywhere in the set:
"'This feature writes no money fact' is a reason. 'N/A' is not, and silence is
not." Held at 8 because finding 3 of its five — "an artifact named in the map
and absent from the diff" — has the least to bite on, given how few artifacts
its own lenses name.

**Coverage 8.** Lines 46-49 are the clearest statement that this is one build:
"Asked of a corporate group — several brands, 100+ locations, 100+ kinds of
actor, every department a group runs — they leave out everything below: not a
second product and not an edition, but what the same feature must carry for all
three to work." Just short of terse because "corporate edition" recurs at line
132 and the three editions are never named.

**Restraint 7.** Most meta-text: lines 14-16 are about how the section is
written, lines 46-49 about what the previous subsection was not, lines 52-54
about how the next one is ordered. Individually defensible, collectively the
beginning of a landfill. Its scope-map part 1 also asks for "The shop-scale
five, in prose. Three paragraphs is enough" — on the fifth feature I would
resent writing three paragraphs of prose about the transaction every time, and
that is the question this judgement was asked to answer.

## Winner: `_draft-terse.md`

It is the one I would still read on the fifth feature. Every line is a question
with an artifact in it, no paragraph is about the section itself, and the scope
map is a template I can copy and fill rather than an essay I have to compose.
Auditor reads better and demands less; teacher teaches better and scales worse.

## What the winner must fix

1. **The two dead links.** `docs/erp-lenses/_index.md` and
   `docs/erp-lenses/_canonical-decisions.md` do not exist. Either both files
   land in the same commit as this section, or the links come out. Shipping
   CLAUDE.md with a dead link violates "No dead ends" (line 376) in the same
   file.
2. **"Corporate edition" is not this repo's word.** Lines 47 and 133. R14 at
   `docs/implementation/RETAIL-ERP.md:350` names them **Solo**, **Chain**,
   **Organization**. Use those and cite R14, so the reader can find the table.
3. **Restore the incumbent's framing.** Graft CLAUDE.md line 146's "stated
   directly and repeated because it was under-applied" and line 150's "This
   section is the method for finding the rest of it" — auditor keeps both.
   Without them the section opens with no statement of why it exists.
4. **Restore the named reachability trap.** Terse line 176-177 keeps the rule
   but loses the instance: current CLAUDE.md lines 209-212 name
   `seedPermissions()` vs `seedRoles()` as this repo's own tracked case. A
   reviewer greps for that; keep it, or replace it with teacher's sharper
   `ROLE_PERMISSION_SEED` failure line.
5. **Give the scope map a home in the existing template.** `## Scope map`
   floats. Put it inside the `## Implementation Plan` block at CLAUDE.md line
   520 as `### Scope lenses`, next to `### Out of Scope`, the way teacher does
   at lines 158-160.
6. **Cut one of the two discount-code passages.** Lines 9-10 and 192-193 make
   the same point. A draft whose stance is "minimum text" cannot make the same
   example twice at 1,816 words.
7. **Fix `PermissionGuard` while you are here.** CLAUDE.md lines 99 and 117 say
   `PermissionGuard`; the class at `apps/api/src/core/auth/guards.ts:80` is
   `PermissionsGuard`. All three drafts get this right; the file around them
   does not.

## Graft from the losers

From **auditor**:

- Line 168 verbatim, into terse's fail list, replacing the thinner "when an
  `n/a` carries no reason": *"**Not applicable, with the sentence that makes it
  true.** 'This feature writes no money fact' is a reason. 'N/A' is not, and
  silence is not."*
- Lines 46-49, the "not a second product and not an edition, but what the same
  feature must carry for all three to work" clause — fold into terse's own
  scale paragraph at lines 43-47, which has the facts but not that framing.
- The em-dash group glosses. Terse has one for group 1 ("everything after this
  is a property of somebody") and group 3; auditor has all six. Take the four
  missing ones.
- Lines 186-187, into terse's boundary: *"a scope column left out because this
  client has one brand is not a simpler schema, only a migration run later
  under deadline."* Best sentence in the set for killing the "we only have one
  brand today" argument in review.

From **teacher**:

- Three items from the fail list at lines 163-172, which terse's generic
  "naming no artifact" does not cover: the `ROLE_PERMISSION_SEED`-vs-
  `Permission`-row check, "a write the plan never classified REQUEST or
  RECORD", and "a scope column shipped nullable with no written meaning for
  null".
- Lines 158-160, the placement of the answers under `### Scope lenses` in the
  existing plan template.
- The refund case at lines 135-137, as the section's one worked example rather
  than as a narrative opener — one sentence: `PaymentsService.refund()`
  (`payments.service.ts:289`) accepts and persists a partial `refundAmount`
  while `onPaymentRefunded()` (`posting-rules.subscriber.ts:150`) reverses the
  receipt and the sale whole. It is the only claim in any draft that catches a
  live defect this repository's own comment denies.
- "at Org" over "corporate edition", per must-fix 2.

Do **not** graft teacher's catalogue paragraph (lines 187-193). It attributes
three specific rulings to `_canonical-decisions.md`, a file that does not
exist.
