# Owner's verdict on the three Feature scope drafts

## Who is judging

The owner who wrote the cart instruction, and who keeps finding features
shipped as fragments. Two questions, and only two:

1. Does this stop the next fragment — can a reviewer hold the line with it?
2. Is it still what I meant, in a file I have to keep reading?

The second question is not a courtesy. `CLAUDE.md` is 42.9K already. A section
that doubles and duplicates a catalogue is the landfill failure my own
*Interface architecture* section bans — *overview first, detail on click*, and
*historical / technical: its own view, never inline*. The catalogue **is** the
click. A draft that renders the detail inline has failed a rule I wrote.

## What I verified before scoring fidelity

Every claim below was opened in the repository, not inferred.

| Claim | Verdict | Where |
|---|---|---|
| `PERMISSION_CATALOG`, `PermissionsGuard` | true | `apps/api/src/core/auth/guards.ts`, `app.module.ts` |
| `RolesService.create` / `.update` | true | `apps/api/src/core/auth/roles.service.ts:60`, `:91` |
| `InventoryService.defaultLocationId()`, resolving MAIN | true | `apps/api/src/modules/inventory/inventory.service.ts:160-169` |
| `adjust()` takes its `locationId` from it | true | `apps/api/src/modules/inventory/inventory.controller.ts:41-51` |
| `JournalLine`'s five dimension columns | true, all five | `apps/api/prisma/schema/accounting.prisma:185-197` |
| `JournalLine.contactId` survives the `User` | true | same file, `:189` |
| thirteen-account chart | true, exactly 13 | `apps/api/src/modules/accounting/chart-of-accounts.ts:20-32` |
| `FiscalPeriod` has CLOSED and LOCKED | true | `apps/api/prisma/schema/accounting.prisma:80-84` |
| `FiscalPeriod` has **no** brand column | true | same file, `:91-108` |
| `reverseEntry()` dates the reversal `now` | true | `apps/api/src/modules/accounting/accounting.service.ts:112-121` |
| `PaymentsService.refund()` takes a partial amount | true | `apps/api/src/modules/payments/payments.service.ts:289` |
| `onPaymentRefunded` reverses receipt **and** sale in full | true | `apps/api/src/modules/accounting/posting-rules.subscriber.spec.ts:183-192` |
| `OrdersAdminController`, one class-level `orders.manage` | true | `apps/api/src/modules/orders/orders.controller.ts:87-88`, status write at `:112` |
| DELIVERED and RETURNED both in `OrderStatus` | true | `apps/api/prisma/schema/orders.prisma:7-16` |
| `User` has a `Contact` relation, no link to `Party` | true | `apps/api/prisma/schema/core.prisma:48` |
| `TradingPartner` authenticates by key hash | true | `apps/api/prisma/schema/trading-partners.prisma:43-47` |
| `AuditLog.data`, `OutboxEvent.payload`, `InboundEmail.bodyText`, `ReplicationRecord` | all true | `core.prisma:226`, `:364`; `crm.prisma:142,151`; `replication.prisma:49` |
| `ROLE_PERMISSION_SEED` | true | `apps/api/prisma/seed.ts:100`; `apps/web/src/constants/permissions.ts:18` |

Three claims failed.

- **"corporate edition" is not a thing here.** The three editions are
  **Solo / Chain / Organization** — `docs/implementation/RETAIL-ERP.md:352`,
  and `apps/api/prisma/schema/organization.prisma:12` says
  "Organization-edition deployment's ORG-tier database". Terse and auditor
  both write "corporate edition"; teacher writes "at Org" and is right.
- **"the seventy narrower ones behind them"** (teacher, line 187). The
  consolidation's own first line is "How 146 lenses became 24"
  (`docs/erp-lenses/_cluster-analysis.md:1`). 122 behind, not 70.
- **Both catalogue links are dead, in all three drafts.**
  `docs/erp-lenses/_index.md` and `docs/erp-lenses/_canonical-decisions.md`
  do not exist. `find docs -name "*index*" -o -name "*canonical*"` returns
  nothing; `docs/erp-lenses/` holds 124 files and neither is among them.

One thing worth knowing, which none of the drafts got wrong: `CLAUDE.md:114`
itself says `PermissionGuard`, and that symbol has **zero** occurrences in
`apps` or `packages`. The real one is `PermissionsGuard`. All three drafts
spell it correctly; the existing file does not. Fix it while the section is
open.

## The table

| Draft | Fidelity | Voice | Actionability | Coverage | Restraint | **Total** |
|---|---|---|---|---|---|---|
| **terse** | 8 | 7 | 9 | 9 | 9 | **42** |
| teacher | 9 | 9 | 9 | 8 | 6 | **41** |
| auditor | 6 | 7 | 8 | 7 | 7 | **35** |

### Fidelity

**Terse — 8.** Every symbol it names survived opening. It is the only draft
that writes `InventoryService.defaultLocationId()` with its owning class, the
only one naming `InboundEmail.bodyText` in the erasure lens, and it names all
five `JournalLine` dimension columns rather than gesturing at "the five".
Loses two points for "corporate edition" (twice, lines 118 and 132, plus "a
corporate runs" at 47) and the dead links.

**Teacher — 9.** The highest density of checkable, specific claims in the set,
and four of them are complete worked cases where every clause held up. The
money case is the best paragraph any of the three wrote: *"`reverseEntry()`
dates the reversal `now` and resolves the period from it, so the credit lands
in March; `FiscalPeriod` has no brand column to close one brand at a time."*
Both halves verified. One checkable falsehood ("the seventy narrower ones")
and the dead links keep it off 10.

**Auditor — 6.** Nothing it says is false. That is not the same as fidelity.
It systematically hedges the specifics out: *"which of the five dimension
columns"* (never names them), *"and the idempotency key"* (the others name
`findPostedEntry(source, sourceRef)`), *"a refusal in `RolesService` at
role-save time"* (no method), *"a second brand in a second country"* (no
`RetailBrand`). A reviewer cannot grep for a hedge. Same two errors as terse
on top: "a corporate group", "corporate edition", both dead links.

### Voice

**Terse — 7.** The register is right and some headings are better than
anything in the current file — *"The actor — everything after this is a
property of somebody"* is a line I would have written. But it cuts the
existing opening in half, losing *"This section is the method for finding the
rest of it, every time, before calling anything done"* and the cart example by
name. And the ` ```markdown ` fence at line 163 is a register this section has
never used.

**Teacher — 9.** Keeps my opening nearly verbatim and grows out of it. Bold
lead-in, em-dash, prose — the same shape as the five lenses already in the
file and the same shape as the pillar table rows. Indistinguishable, which is
the ask.

**Auditor — 7.** *"a rule that cannot fail a review is decor"* is the best
single line in the draft and belongs in the file. But *"The group-scale
twenty-four"* is a counting heading this file never uses, and the four-part
numbered scope-map recipe at 156-171 reads like a process document that
wandered in from somewhere else.

### Actionability

**Terse — 9.** The `## Scope map` block with *"(29 lines, in order)"* is the
most mechanical instrument of the three: a reviewer counts. Four fail
conditions, plus the one that matters most — *"Where two lenses pull opposite
ways, citing the ruling ... is an answer; deciding it privately inside a PR is
not."*

**Teacher — 9.** Six findings, and three are repo-specific enough to fail a
real PR tomorrow. The best is *"a permission key named in the plan that
reaches no `ROLE_PERMISSION_SEED` grant, only a `Permission` row"* — that
closes a loop `CLAUDE.md:210-212` already opened about `seedPermissions()` vs
`seedRoles()`, and turns a war story into a gate.

**Auditor — 8.** *"An otherwise correct diff still fails on them."* is the
sharpest sentence in any of the three and the one that makes the list a gate
rather than advice. Docked for softness elsewhere: *"Three paragraphs is
enough"* is not a threshold, and *"an artifact named in the map and absent
from the diff"* overlaps two of its own neighbours.

### Coverage

**Terse — 9.** The only bridge paragraph that states the whole scale in one
breath: *"one Organization, several brands, 100+ locations across timezones,
100+ kinds of actor, 100+ roles, every department a corporate runs. One
codebase, three editions — a lens that makes sense for only one edition is not
a lens."* That last clause is the best sentence about editions anywhere in the
three.

**Teacher — 8.** Carries editions concretely — Solo showing quantity/reason/
save with `locationId` never rendered, the chain adding a Location column, the
group posting a shrinkage journal — and names Org correctly. But its scale
statement is thin: *"a hundred kinds of actor ... a hundred locations"*, with
no ranks and no departments.

**Auditor — 7.** *"not a second product and not an edition, but what the same
feature must carry for all three to work"* is a genuinely useful distinction.
Still no ranks, no product volume.

**All three miss 10k+ products.** Nobody carries catalogue volume. "The
hundred-thousandth row" gestures at it and is about the largest table, not the
product count. This is a gap in the set, not a discriminator.

### Restraint

**Terse — 9.** I cannot find a line to cut. It puts the catalogue pointer in
two sentences at the top and never returns to it.

**Teacher — 6.** The six opening cases are its best writing and its
disqualifying flaw. They are roughly twelve lines restating what the catalogue
holds, inline, at the top of the file — *overview first, detail on click*,
failed. It is also the longest of the three. Its cases should survive as
**one**, not six.

**Auditor — 7.** *"It is written to be failed against"* and *"Each lens names
an artifact the plan must contain"* are one idea twice. Scope-map part 1
("The map. The shop-scale five, in prose") duplicates the five lenses printed
forty lines above it. And *"including the surface-specific ones held back
above"* (line 192) refers to something that is not above.

## Winner: `_draft-terse.md`

It wins on the two questions I actually asked. It fails a PR with a countable
artifact, and it does not turn the section into a second document. Teacher is
one point behind and is the better-written draft — but the thing it is better
at is exactly the thing that makes the file heavier, and the detail it renders
inline is detail I already agreed lives one level down. Auditor is third: it
has the best two sentences and the weakest claims, and a lens you cannot grep
for is a lens nobody enforces.

## What the winner must fix

1. **The dead links.** `docs/erp-lenses/_index.md` and
   `_canonical-decisions.md` are cited at lines 13-15 and 182 and neither
   exists. Write both in the same change, or the section ships pointing at
   nothing. My own rule: *adoption is the deliverable, not creation* — a
   pointer with no target is worse than no pointer.
2. **"corporate edition" → Organization.** Lines 47, 118, 132. The editions
   are Solo / Chain / Organization (`RETAIL-ERP.md:352`). Take teacher's
   phrasing: *"the row count the largest table reaches at Org"*.
3. **Restore the opening's second half.** Put back *"Building 'a cart' is not
   done at add/remove line items"* and *"This section is the method for
   finding the rest of it, every time, before calling anything done."* The
   cart by name is the instruction people remember; do not compress it out.
4. **Add the catalogue volume to the bridge.** The paragraph at 44-47 has
   locations, actors, roles and departments but no products. It should say
   10k+ products and 100+ ranks explicitly — ranks are not roles, and a lens
   about who approves what depends on the difference.
5. **Name a symbol in the toxic-pair lens's second half.** Line 75-76 gives
   `RolesService.create`/`.update` for grant time (correct —
   `roles.service.ts:60`, `:91`) and then *"a throw at act time comparing the
   actor to a stored id"*, which names nothing. It is the one lens in the
   draft a reviewer cannot grep.
6. **Drop the "(29 lines, in order)" count or source it.** 5 + 24 = 29 is
   right today and rots the day a lens is added. Either say "one line per
   lens, in catalogue order" or make the catalogue the count's source.
7. **Fix `PermissionGuard` at `CLAUDE.md:114`** while the file is open. Zero
   occurrences in the codebase; the symbol is `PermissionsGuard`.

## What to graft from the losers

### From teacher

- **Three fail conditions terse does not have**, near-verbatim: *"a permission
  key named in the plan that reaches no `ROLE_PERMISSION_SEED` grant, only a
  `Permission` row"*; *"a write the plan never classified REQUEST or RECORD"*;
  *"a scope column shipped nullable with no written meaning for null"*.
- **Exactly one worked case**, in the money group, since it is the one where
  every clause verified: *"A December sale is refunded in March.
  `reverseEntry()` dates the reversal `now` and resolves the period from it,
  so the credit lands in March; `FiscalPeriod` has no brand column to close
  one brand at a time."* One case shows the section is grounded. Six make it
  the catalogue.
- **The typo clause** for terse's boundary paragraph: *"a lens run on a typo
  is scope creep wearing a checklist."*
- **The end of teacher's second-copy lens**: *"then what the loser of a
  simultaneous write sees on screen."* Terse stops at the unique constraint
  and leaves the user out of it.
- **"at Org"**, replacing "corporate edition".

### From auditor

- **The closer for the fail list**: *"An otherwise correct diff still fails on
  them."* Terse's list ends without a verdict; this supplies it.
- **The justification line**, compressed to its second clause: *"a rule that
  cannot fail a review is decor."*
- **The boundary's opening**, which is sharper than terse's: *"A one-line fix
  runs no lenses; a named feature or capability runs all of them. Nothing sits
  in between."*
- **The best sentence in the auditor draft**, which says something neither
  other draft says: *"a scope column left out because this client has one
  brand is not a simpler schema, only a migration run later under deadline."*
- **Its group-2 and group-6 subtitles**, which beat terse's: *"which rows, how
  much, which pairs, who may change it"* and *"undoing it, explaining it
  later, erasing a person."*

### Do not graft

- Teacher's *"the seventy narrower ones behind them"* — 146 became 24
  (`_cluster-analysis.md:1`), so 122 are behind. Wrong and checkable.
- Auditor's heading *"The group-scale twenty-four"* — a count in a heading
  rots the same way terse's 29 does, and worse, because headings get quoted.
- Auditor's four-part scope map — parts 1 and 3 restate work the lens rows
  already do.
