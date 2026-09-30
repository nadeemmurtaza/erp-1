Verdict on the three candidate replacements for CLAUDE.md's "Feature scope"
section. Judging as a reviewer who fails PRs: a lens earns its line only if it
is falsifiable, its repo claim is true, and removing it would cost something.

---

## Who is judging, and against what

Three tests, applied in this order:

1. **Is the claim true?** Every repo symbol named in all three drafts was
   opened and confirmed, not skimmed. Sixteen checks are recorded below.
2. **Can a reviewer fail a PR with this line?** A lens that produces an
   argument rather than a finding is decoration, however well written.
3. **Would removing it cost anything?** CLAUDE.md is already 42.9K. A draft
   that adds beauty adds weight.

## Score table

| Draft | Fidelity | Voice | Actionability | Coverage | Restraint | **Total** |
|---|---|---|---|---|---|---|
| `_draft-terse.md` | 8 | 9 | 8 | 8 | 9 | **42** |
| `_draft-teacher.md` | 8 | 6 | 9 | 7 | 6 | **36** |
| `_draft-auditor.md` | 6 | 7 | 7 | 7 | 7 | **34** |

### Reasoning, one line per score

**terse — fidelity 8.** Names methods at their real owners. `InventoryService`
does define `defaultLocationId()` (`apps/api/src/modules/supply-chain/inventory/inventory.service.ts:161`,
"The MAIN location's id"); `RolesService` does have both `create` (line 60) and
`update` (line 91), so "`RolesService.create`/`.update`" is exact where auditor's
"`RolesService` at role-save time" is not; `findPostedEntry(source, sourceRef)`
matches the signature at `accounting.service.ts:176` character for character.
The five `JournalLine` columns it enumerates all exist (`accounting.prisma:185-197`)
and the erasure lens's five tables — `JournalLine.contactId`, `AuditLog.data`
(`core.prisma:226`), `InboundEmail.bodyText` (`crm.prisma:151`),
`OutboxEvent.payload` (`core.prisma:364`), `ReplicationRecord`
(`replication.prisma:49`) — are each real columns on real models. Two points
off: the dead links (below) and "corporate edition".

**terse — voice 9.** `### The boundary, stated plainly` is carried over from the
live section unchanged, and the bullet shape `- **The actor with three tables.**`
is the same shape CLAUDE.md already uses at lines 113-130. Nothing in it reads
like a different author.

**terse — actionability 8.** The strongest single definition in the set: "An
answer names an artifact: a column, a table, a permission key, a service method,
a screen, a number." A reviewer can hold a line against that with no judgement
call. Docked because the fail conditions are one prose paragraph where teacher
gives six discrete findings.

**terse — coverage 8.** Only draft whose scale claim is testable: "One codebase,
three editions — a lens that makes sense for only one edition is not a lens."
Carries 100+ locations, 100+ actors, 100+ roles, every department. Loses two
points for 10k+ products (below).

**terse — restraint 9.** 194 lines, and I could not find one whose removal was
free. Puts both catalogue links in three lines near the top rather than a
closing paragraph, which is the right call — a reader who needs the catalogue
needs it before the lenses, not after.

**teacher — fidelity 8.** The highest density of verified fact in the set, and
four of its six openers are precisely right:
- `OrdersAdminController` does carry exactly one class-level
  `@RequirePermission('orders.manage')` (`orders.controller.ts:87-88`).
- `reverseEntry()` does date the reversal `now` and resolve the period from it —
  `const now = new Date(); const period = await this.resolveOpenPeriod(now);`
  then `date: now, periodId: period.id` (`accounting.service.ts:112-118`), and
  `FiscalPeriod` has no brand column (`accounting.prisma:91-108`), so "closes one
  brand at a time" is genuinely impossible today.
- `PaymentsService.refund()` does take a partial (`amount?: number`,
  `payments.service.ts:289`) and `onPaymentRefunded()` does ignore it, reversing
  receipt *and* sale in full (`posting-rules.subscriber.ts:150-155`).
- `User` genuinely has no `partyId` (`core.prisma:11-50` — it links to `Contact`,
  not `Party`), and `TradingPartner.inboundApiKeyHash` is a SHA-256 unique
  (`trading-partners.prisma:46`).

No points above 8 because of its dead-link exposure: it does not merely link
`_canonical-decisions.md`, it states what is inside it — "settles the ledger
against the right to erasure, the offline till against the approval gate, and
dry run against the single writer" — and describes "the seventy narrower ones
behind them." That file does not exist. A specific claim about a non-existent
file is worse than a bare link to one.

**teacher — voice 6.** The narrative openers are the problem. `**3. The act in
the world.** The truck leaves Branch A at 09:40, the uplink drops at 09:45, the
goods reach Branch B at 14:00` is good writing and is not CLAUDE.md's writing.
Nowhere in the existing 42.9K does the file tell a story before stating a rule;
it states the rule and cites the symbol. Six of these in a row changes the
document's register.

**teacher — actionability 9.** Best fail list by a clear margin, because three of
its six are greppable rather than arguable: "a permission key named in the plan
that reaches no `ROLE_PERMISSION_SEED` grant, only a `Permission` row" (both
`seedPermissions()` at `seed.ts:82` and `seedRoles()` at `seed.ts:128` exist, so
this finding is mechanically checkable and lands on the exact trap CLAUDE.md
already tracks at its lines 210-212); "a scope column shipped nullable with no
written meaning for null"; "a write the plan never classified REQUEST or RECORD".

**teacher — coverage 7.** "a hundred kinds of actor... which of a hundred
locations" carries actors and locations. Roles are folded into actors with no
rank distinction, departments are absent, and the editions arrive only as
silhouettes.

**teacher — restraint 6.** The openers cost about eighteen lines, and the
shop-scale five are justified twice ("they cost minutes, and they set the
shape" after the block quote already made the point). Against a 42.9K file that
is not free.

**auditor — fidelity 6.** Nothing it says is false, but it names fewer artifacts
than its own stance promises, and one count is loose. "name which of the five
dimension columns it sets" — `JournalLine` carries seven scope columns
(`organizationId`, `retailBrandId`, `branchNodeId`, `costCentreId`, `contactId`,
`supplierId`, `counterpartyBrandId`, `accounting.prisma:185-197`), and the draft
names none of them, so a reviewer cannot resolve which five are meant. It also
degrades three artifacts the others name exactly: "the idempotency key" for
`findPostedEntry(source, sourceRef)`, "a refusal in `RolesService` at role-save
time" for `.create`/`.update`, and "every table still holding an erased person's
identifiers" for a list of five actual tables. For a draft whose opening claim
is "Each lens names an artifact," that is the charge that sticks.

**auditor — voice 7.** Bullet shape and boundary section are right. The
meta-commentary is not: "It is written to be failed against... a rule that
cannot fail a review is decor" and "Detail one level down." CLAUDE.md never
narrates its own enforceability; it just enforces.

**auditor — actionability 7.** The four-part scope map is the best *structure*
of the three. The five findings are weaker than teacher's: "a row naming no
artifact" needs a definition of artifact that the draft never gives (terse does),
and "a conflict resolved against a recorded ruling with no new ruling written"
depends entirely on a file that does not exist.

**auditor — coverage 7.** "several brands, 100+ locations, 100+ kinds of actor,
every department a group runs" plus "not a second product and not an edition,
but what the same feature must carry for all three to work" — that last clause
is good. No roles/ranks, no catalogue scale.

**auditor — restraint 7.** Two sentences asserting the section is enforceable,
which the fail list already demonstrates. "Those five are the shop, and they are
not sufficient" restates the transition the next sentence makes anyway.

## Repo claims checked

| Claim | Verdict | Evidence |
|---|---|---|
| `PermissionsGuard` | true (and CLAUDE.md's own line 114 says `PermissionGuard` — the drafts are right, the live file is wrong) | `apps/api/src/core/auth/guards.ts:80` |
| `PERMISSION_CATALOG`, `ROLE_PERMISSION_SEED` | true | `apps/api/prisma/seed.ts:6-7,85,100` |
| `User` / `Party` / `Contact` / `TradingPartner` | all true, all separate models | `core.prisma:11`, `parties.prisma:15`, `crm.prisma:16`, `trading-partners.prisma:33` |
| `User` has no `Party` link | true | `core.prisma:11-50`; relation is to `Contact` |
| five `JournalLine` dimension columns | true, but seven exist | `accounting.prisma:185-197` |
| `FiscalPeriod` CLOSED / LOCKED | true | `enum FiscalPeriodStatus`, `accounting.prisma:80-84` |
| `FiscalPeriod` cannot close per brand | true — no brand column, only `fiscalYearId` | `accounting.prisma:91-108` |
| `findPostedEntry(source, sourceRef)` | true, exact signature | `accounting.service.ts:176` |
| `reverseEntry()` dates the reversal `now` | true | `accounting.service.ts:112-118` |
| thirteen-account chart | true, 13 entries | `chart-of-accounts.ts:20-32` |
| `defaultLocationId()` on `InventoryService`, resolves MAIN | true | `inventory.service.ts:161`; called at `inventory.controller.ts:51` |
| `OrdersAdminController` one class-level `orders.manage` | true | `orders.controller.ts:87-88` |
| `PaymentsService.refund()` partial, reversed in full | true | `payments.service.ts:289`; `posting-rules.subscriber.ts:150-155` |
| `AuditLog.data`, `OutboxEvent.payload`, `InboundEmail.bodyText`, `ReplicationRecord` | all true | `core.prisma:226,364`; `crm.prisma:151`; `replication.prisma:49` |
| editions are Solo / Chain / **Organization** | true — no draft uses the repo's third name | `RETAIL-ERP.md:352,939` |
| `docs/erp-lenses/_meta/_index.md`, `_canonical-decisions.md` | **false — neither exists** | `git ls-files docs/erp-lenses/` returns only `_agent-cluster.md`, `_agent-manifest.md`, `_cluster-analysis.md` besides the numbered files |

## Winner

**`_draft-terse.md`**, 42 of 50. It is the only draft I could not find a line to
cut from, it is the only one whose voice I could not distinguish from the live
section, and its lens bodies name the most artifacts at the most precise
addresses. The two it loses to on individual axes lose on axes that matter more
here: teacher writes better and reads less like CLAUDE.md; auditor structures
the pass better and names fewer things a reviewer can check.

## What the winner must fix

1. **Two dead links, in the third paragraph.** `docs/erp-lenses/_meta/_index.md` and
   `docs/erp-lenses/_meta/_canonical-decisions.md` do not exist. The section cannot
   merge before they do, because the lens bodies are deliberately short on the
   promise that "every lens with its repository evidence, worked example and
   done test" lives one level down. Without the index, the section is the whole
   rule and it is too thin. Write both, or drop the sentence and inline what it
   defers.
2. **"corporate edition" is not this repo's word.** `RETAIL-ERP.md:352` and
   `:939` both name the tier **Organization** (Solo / Chain / Organization).
   Appears twice: "the row count the largest table reaches at corporate edition"
   and the group-scale preamble. Use the repo's term — a second vocabulary for
   one concept is the parallel-systems failure in prose.
3. **No lens asks about catalogue scale.** The preamble sells 100+ locations and
   100+ actors but never 10k+ products, and "The hundred-thousandth row" is
   about table size, not findability. `docs/erp-lenses/findability-at-scale/22-findability-at-scale.md`
   is a whole domain the section drops. Add a lens, or say in the preamble that
   catalogue scale is deferred to the index and name it.
4. **Roles and ranks are collapsed.** The preamble counts "100+ roles" but no
   lens distinguishes a rank (seniority band, who outranks whom for approval)
   from a role (permission set). `docs/erp-lenses/roles-ranks-orgchart/02-roles-ranks-orgchart.md`
   exists precisely because they differ; "The threshold nobody approves alone"
   names bands but not who is senior to whom.
5. **The `Scope map` block shows a placeholder, not a row.** Every other
   copy-this instruction in CLAUDE.md shows the real thing. Replace
   `<lens name> — <answer, or n/a — one clause why>` with one filled example —
   e.g. a `The movement with no address` row naming a real `locationId` source —
   so the required shape is unambiguous.
6. **Strip the scaffolding.** Lines 1-4 ("Candidate draft... Stance: minimum
   text, maximum bite") do not merge.

## What to graft from the losers

**From `_draft-teacher.md`:**

- **Three of its six fail conditions, verbatim.** Terse's fail paragraph has
  none of them and all three are mechanically checkable:
  - "a permission key named in the plan that reaches no `ROLE_PERMISSION_SEED`
    grant, only a `Permission` row" — this one especially, because it is the
    only line in any draft that closes the loop on the trap CLAUDE.md already
    documents at its own lines 210-212 (`seedPermissions()` vs `seedRoles()`).
  - "a scope column shipped nullable with no written meaning for null"
  - "a write the plan never classified REQUEST or RECORD"
- **Exactly one worked example, the afterlife one**, as a parenthetical inside
  terse's "The reversal document, not the reversal flag" — not as a repeated
  structure. It is the highest-value verified fact in the entire set: a partial
  refund erases the whole sale from the ledger, and both halves are open-and-see
  (`payments.service.ts:289`, `posting-rules.subscriber.ts:150-155`).
- **Teacher's method name for terse's period lens.** Terse's "The period that
  already moved" names no method; teacher supplies the exact one —
  `reverseEntry()` resolving the period from `now` rather than the original
  entry's date (`accounting.service.ts:112-113`). Add the method name to the
  lens.
- **Teacher's authority illustration.** Terse's "Whose rows, and which columns"
  cites no repo site. `OrdersAdminController`'s single class-level
  `@RequirePermission('orders.manage')` (`orders.controller.ts:87-88`) is the
  cleanest one-clause demonstration available and costs half a line.

**From `_draft-auditor.md`:**

- **Its `n/a` rule, which shows the standard instead of asserting it:** "'This
  feature writes no money fact' is a reason. 'N/A' is not, and silence is not."
  Terse only says "when an `n/a` carries no reason"; auditor's eleven-word
  example makes the bar visible.
- **Its boundary opener as terse's first sentence:** "**A one-line fix runs no
  lenses; a named feature or capability runs all of them.** Nothing sits in
  between." Terse takes three clauses to say this; auditor bolds it and stops.
- **Its second boundary example:** "a scope column left out because this client
  has one brand is not a simpler schema, only a migration run later under
  deadline." Terse's boundary closes on the discount-code example alone, which
  covers the shop-scale failure; this covers the group-scale one.

**Do not graft:**

- Auditor's "It is written to be failed against" and "a rule that cannot fail a
  review is decor" — the section describing its own enforceability. No reviewer
  can act on it, and the fail list proves the point without it.
- Auditor's "the five dimension columns" — `JournalLine` has seven
  (`accounting.prisma:185-197`), and the draft names none. Terse's enumerated
  five is correct where this count is not.
- Teacher's sentence describing what `_canonical-decisions.md` settles. Even
  once that file exists, a summary of its contents in CLAUDE.md is a second
  copy that will disagree with the first.
