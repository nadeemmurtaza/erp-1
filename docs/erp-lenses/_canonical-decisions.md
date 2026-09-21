# Canonical decisions

The verdicts. Cite a ruling by number — "ruling 3" — and the argument is over.
The argument itself, stated fairly on both sides with the file and line where
it collides, is in [`_conflicts.md`](_conflicts.md), numbered to match. Read
that one to understand a ruling; cite this one to apply it.

Three rules about this file:

- **A ruling is not advice.** Each names the side that wins by default, the
  condition under which the other applies, and what the engineer does when
  both bite in one PR. There is no "it depends" here. Where a ruling is wrong,
  it is superseded in writing, in this file, with a date — never worked around
  in a PR and never re-litigated in review.
- **A conflict resolved against a ruling fails the review.** So does a
  conflict resolved privately, with no ruling written, on a shape this file
  already covers.
- **A new conflict gets written up in `_conflicts.md` first**, then ruled on
  here. A verdict with no stated argument behind it is not citable, because
  nobody can tell later what it was deciding.

---

# Part 1 — The fourteen rulings

## Ruling 1. The ledger wins. Erasure pseudonymises the reference; it does not touch the row

**Default:** immutability. A posted fact carries a person two ways, and they
are treated differently. The **foreign key stays** — `JournalLine.contactId`
is not nulled, not cascaded, not edited — and resolves instead to a tombstone:
the person row is replaced by an erased-subject row, so the ledger stays
balanced, attributable and unedited. The **free text is destroyed**:
`AuditLog.data`, `InboundEmail.bodyText`/`fromName`/`fromAddress`,
`OutboxEvent.payload`, `ReplicationRecord.payload`. The ledger's integrity does
not depend on any of them.

**No erasure path may issue an UPDATE or DELETE against a table protected by
an immutability trigger.** That is not a preference; the trigger raises.

**The other side applies when** a legal hold is open, and then it outranks
both. Even the destruction of free text stops. The request is answered with a
dated refusal naming the hold, the refusal is itself written to the audit
trail, and the retention clock resumes at release.

**When both bite:** the engineer ships a per-table disposition with exactly
three values — `cascade`, `pseudonymise in place`, `retain under a named legal
basis` — one row per table that holds the person. A table with no row fails
the review. "Retain" with no named basis fails the review.

**Prerequisite work this ruling depends on:** DB-level immutability on
`AuditLog`. Today only `JournalLine` and `JournalEntry` have triggers. See the
cut list below — that migration is work, not a lens, and evidence-class audit
(ruling 9) also depends on it.

## Ruling 2. The classification decides, and it is fixed at design time

**Default:** the classification. A **REQUEST** may be blocked by an approval
that has not happened. A **RECORD** may never be. It follows, without further
argument, that **no approval gate may sit on a path a disconnected branch has
to complete.** If one does, either the classification was wrong or the gate is
in the wrong place.

**The other side applies when** a feature genuinely needs both — and the
answer is then **bounded offline authority, never deferred approval**: a
stated ceiling the device may act within while disconnected; the act queued as
a fact; anything above the ceiling recorded as a variance that a named
permission clears afterwards. The approval then reviews a fact rather than
gating one.

**When both bite:** the engineer writes the ceiling in the PR **as a number**.
"It will sync and then be approved" is not a design. Either it commits at the
till or it refuses at the till, and the PR says which.

## Ruling 3. Dry run wins on the decision; the single writer wins on the write

**Default:** both, because they only conflict while they share one function.
Every rule splits in two:

- `decide(inputs) -> outcome` — pure. No `prisma.` write, no `publish(`.
- `apply(outcome, tx)` — the one writer, unchanged.

Simulation calls `decide` only. Production calls `decide` then `apply`.
Concretely: a feature adding a posting rule puts account selection and amounts
in a pure function that the subscriber calls, and the subscriber keeps the only
`AccountingService.postEntry()` call in the system.

**The other side applies** never. There is no case for evaluating policy
inside the write path; the single-writer invariant is preserved *by* the split,
not threatened by it.

**When both bite:** a dry run that needs to call the writer "with rollback" is
not a dry run. An open transaction held across a thirty-day replay is an
outage, and the reviewer rejects it.

## Ruling 4. Schema is not UI. The column ships; the control waits for a second row

**Default:** the column, in the first migration, **NOT NULL**, defaulted to
this deployment's own entity — the `MAIN` `Location` trick R14 already names
as the working precedent. Solo rows are then correctly attributed and no
nullable-scope invisibility trap is created.

**The other side applies to the control, always.** The picker, the chip row
and the scope selector render on `count(entities) > 1` — never on a flag,
never on an edition check, never speculatively. R14's first constraint holds:
every tier concept is invisible in Solo.

**When both bite:** note that the compromise everybody reaches for — a
nullable scope column with no written meaning for null — fails both lenses at
once. `scopeFilterFor()`'s `{ retailBrandId: { in: [...] } }` never matches
NULL, so that history disappears the day the tier is switched on. A nullable
scope column with no written meaning for null fails the review on its own.

## Ruling 5. Write the column; do not write the rollup

**Default:** dimensions on the fact are **mandatory** and need no argument. A
feature may add a scope column freely.

**Synchronous aggregates over that dimension are not.** A feature may not add
a second synchronous cross-location aggregate without stating, as a number,
what it reads at a hundred locations.

**The other side applies when** the aggregate is genuinely needed: it becomes
a maintained counter or a read-time query, never a recompute inside the write
transaction. The thing to remove from `applyMovement()` is the cross-location
`SUM`, not the `locationId`.

**When both bite:** the denormalised total is a maintained counter or a
read-time query. A recompute inside the write transaction fails the review,
and "it already does that" is not a defence — it is the instance the lens was
written from.

## Ruling 6. Deactivation removes authority synchronously and never closes a fact synchronously

**Default:** split the transaction by what is a grant and what is a fact.

**In the same transaction as `isActive = false`:** revoke refresh tokens;
delete `UserRoleAssignment` and `AdminScope` rows; reassign or escalate every
pending decision.

**Not in that transaction:** the drawer. An open `PosShift` moves to a named
abandoned state that requires a second person holding the cash-count
permission to close it against a physical count. Its over/short becomes a
variance row owned by that branch's manager.

**The other side applies** never — force-closing to a computed figure writes a
count nobody performed, which is worse than an open shift because it looks
settled. `PosShift.closingCashMinor` is documented as the cashier's own
physical count; a computed value in that column is indistinguishable from a
real one.

**When both bite:** the leaver's authority is gone within the transaction, and
the leaver's cash is a queue item with a named owner by the end of the shift.

## Ruling 7. Scope wins over comparability, and the surface says so on its face

**Default:** the scope. The list opens narrowed, and the narrowing is the
opening state, not an optional filter.

**The price of that is stated, not hidden.** Every scoped figure renders its
scope in the same element as the number — "3 of 11 branches". **A figure that
cannot state its own scope may not be rendered.**

**The other side applies to the unscoped group total**, which is not a default
view: it lives behind a key that names it.

**When both bite:** the drill-down from a scoped tile lands on the same scoped
list, so the two agree by construction — because they are one predicate, not
two queries that happen to match.

## Ruling 8. The registry is not relaxed. An upward flow is a fact or it does not exist

**Default:** `replication.registry.ts`'s FACT-up / POLICY-down pairing stands.
A branch-created product does not travel up as a `Product`.

**It travels up as a proposal** — which is a fact the branch genuinely
originated, carrying the proposed attributes. The brand's acceptance creates
the `Product` at brand tier, which replicates DOWN as policy like every other
product, and the branch's proposal row is resolved to `accepted`, `rejected` or
`merged` with the resulting id recorded on it.

**The other side applies** never. There is no second, contradictory
replication direction.

**When both bite:** if a feature cannot express its upward flow as a fact, it
does not have an upward flow — it has a request for a second replication
direction. That is refused in an architectural decision record — the home
CLAUDE.md names is `docs/implementation/DECISIONS.md` — never special-cased in
the registry.

## Ruling 9. Two audit classes, declared per call site

**Default:** operational audit stays best-effort and never blocks the
business — a status change, a login, a list export. `AuditService.record()`'s
existing catch-and-log is correct for these.

**Evidence-class audit is written inside the same transaction as the act, and
its failure fails the act.** The classes that are evidence:

- the old and new value of a money or permission change
- a refusal caused by a legal hold
- an approval above a threshold
- a read of a record behind a critical-sensitivity key

**The class is named where the call is made**, not inferred later.

**The other side applies when** the act genuinely cannot afford to fail on its
audit write — and then it is **not evidence-class**, and the PR says so in one
sentence instead of claiming a trail it does not have.

**When both bite:** the sentence goes in the PR. A PR that claims an audit
trail while using the best-effort path fails the review. Evidence-class audit
presupposes the `AuditLog` immutability migration named in ruling 1.

## Ruling 10. A rule that must differ by brand does not become a `Setting`

**Default:** it becomes a real column on the entity that already owns
brand-level policy — `BrandPolicy` — or the request is declined.

**Forbidden outright:** faking it. A composite key like
`brand.<id>.cod_fee` is a scope column in disguise, no query can filter on it,
and the 30-second per-process cache makes it worse. This is refused on sight.

**The other side applies when** the feature does the platform change itself:
scoping `Setting` is real work with its own cache-invalidation problem, and a
feature that needs it either does that work inside its own scope or picks
another door.

**When both bite:** name the door in the PR — sector pack, extension point,
`Setting` key, shared schema field, or a written refusal. If the honest answer
is that none of the five fit, that is a platform work item, not a clever key
string.

## Ruling 11. Ruling 4 governs scope columns, not edges. An edge ships nullable, with null's meaning written down

**Default:** the distinction, decided by what the column names. A **scope**
column names which entity owns this row — org, brand, node, `Location`,
terminal. That question always has an answer, so ruling 4 stands unchanged:
first migration, **NOT NULL**, defaulted to this deployment's own entity. An
**edge** column names which *other row of the same kind* this one points to — a
manager, a parent brand, a predecessor. That question genuinely has no answer at
the root, so it ships **nullable**, and the repository's own precedent is
`RetailBrand.parentId String?` with `onDelete: SetNull`
(`organization.prisma:43`).

**Null's meaning is part of the column.** Ruling 4's real clause was never
"NOT NULL", it was "no unwritten null" — so a nullable edge still fails the
review unless the schema states, in words beside the column, what null means.
And where "nobody recorded a manager" and "top of the ladder" are different
facts the feature must tell apart, that is a second column or an enum, never a
convention in somebody's head.

**Neither kind of column lives in a module that is off by default.**
`organization` is off in every deployment today (`modules.registry.ts:81`, the
only `offByDefault: true` entry, whose comment at `:77-80` cites R14 by name),
so a hierarchy column placed in its tables is not empty at Solo and
SME — it is absent, which is an edition boundary doing density's job. `managerId`
belongs on `core.prisma`'s `User`.

**The other side applies** never. There is no case for defaulting an edge to the
row's own id, or to whoever the single admin happens to be. That manufactures a
reporting line nobody asserted and makes it indistinguishable from one somebody
did — the same failure ruling 6 refuses for a cash count.

**When both bite:** the escalation query reads the edge, and on null falls back
to a **named** backup approver. A `findFirst` over everyone sharing an
`AdminScopeLevel` is an arbitrary row, and an arbitrary row fails the review.

## Ruling 12. Rank is its own axis. `Role.ceiling` is refused; a per-assignment override is allowed only above a rank

**Default:** a `Rank` model carrying a numeric level, and a `UserId`→`RankId`
grant beside `UserRoleAssignment` rather than inside it. Rank orders people;
`Role` grants keys. A feature needing a ceiling names the rank that carries it,
and escalation is a comparison of numbers on that one axis.

**Refused outright:** a ceiling column on `Role`. `Role.name` is `@unique` and
`RoleGrant` keys off `roleId`, so varying the number for identical duties forks
a duplicate `Role` row with a duplicated grant set to maintain forever —
and `RolesService`'s `duplicateOfRoleName` flags that shape without blocking it,
so nothing catches it in review.

**Allowed, with its cost written down:** `UserRoleAssignment.ceiling` as a
**per-assignment override above a rank the person already holds** — one person,
one scope, with an end date. It may not *be* the rank. A PR using it states in
writing that the number is not comparable across roles and that grade reporting
reads the rank, never the override.

**This supersedes lens 02's done test (2026-09-21)**, which accepted "a numeric
ceiling column reachable from `Role` or `UserRoleAssignment`" as sufficient. It
is not: neither location builds the second axis the rule's own premise requires,
and the catalogue may not hold a test that contradicts the rule it serves.
*Rank is a ceiling, not a location* stays absorbed into *The threshold nobody
approves alone*; what changes is where the ceiling is allowed to live.

**When both bite:** a feature that genuinely needs no ladder — one shop, one
owner, no escalation — says so and adds nothing, exactly as lens 02 already
allows with "no ceiling, the grant is unconditional, reviewed". What is refused
is a number that looks like a rank and can be neither ordered nor grouped.

## Ruling 13. Scope-match first, then take the highest ceiling among the grants that survive

**Default:** a ceiling is never read off the resolved permission set. It is
resolved per act, from the grants that act's own scope admits:

1. Take every live grant the actor holds.
2. Keep only those whose `AdminScope` reach covers the act's own
   `retailBrandId`/`branchNodeId` — the intersection `assertCanManageAtScope()`
   already performs for authorization (`scope.guard.ts:84`).
3. Apply the **highest** ceiling among the survivors.
4. Record which grant supplied it on the record that was approved.

**The skipped step is the bug, not the max.** Step 3 is deliberately
permissive: acting cover exists in order to raise a ceiling, and a rule taking
the lowest would defeat the grant it was given for. What lens 44 names is step 2
being absent — a Branch 12 cover raising a Branch 5 purchase order.

**`resolveForUser()` does not change shape.** `ResolvedPermissions` stays
`{ roles, permissions }`. The composition rule is a separate function with its
own unit test, and the approval check calls that, not the resolver. Ruling 3
applies unchanged: the selection is a `decide`, and it holds no write.

**The other side applies when** a grant carries no end date — and then it is not
a grant this ruling will compose. Any grant that can raise a ceiling expires on
its own, per *The grant that ends itself*. A max over an unexpiring cover is a
permanent promotion nobody signed.

**When both bite:** the approved record names the grant, the scope it matched
at, and the number. A record naming only the actor fails the review, because
once the cover expires nothing can say what authorized it.

## Ruling 14. The guard refuses a revoke. It never refuses a deactivation — the deactivation names a successor

**Default:** both, separated by which path is running.

**On an ordinary revoke** — `unassign()`, or a personal override — the orphan
guard applies and refusal is correct: nobody is leaving, and the operator can
simply not do it. That check belongs on `RolesService.unassign()`, which today
runs a bare `deleteMany` (`roles.service.ts:155`) while
`assertLockedKeysStillHeldAfterRevoke` is wired only into `updatePermissions()`
(`users-admin.service.ts:297`).

**On a deactivation the guard may not refuse.** The transaction still strips
every grant, per ruling 6. Where the leaver was the last holder of a locked key,
the deactivation **requires a named successor for that key and grants it inside
the same transaction.** The refusal, when it comes, is at the API boundary and
says who is missing — "name who takes over `roles.manage_permissions`" — not a
guard exception the operator cannot act on.

**The other side applies** never. Skipping the guard when `isActive` is going
false reopens the hole on the one path nobody watches; refusing the deactivation
leaves a departed person holding keys. Neither is available.

**When both bite:** this is the general shape of a control the live roster
cannot satisfy, and the answer is always the same — the shortfall becomes an
explicit input, named by a person, recorded evidence-class per ruling 9. Never a
silent single-approver bypass, and never a path that simply blocks. Both the
successor grant and the revoke are audited with the old and the new holder.

---

# Part 2 — Canonical names, and what each absorbed

169 lenses became 24 headline lenses plus a catalogue. The ranking rule was
**leverage**: the damage a lens's absence causes, times how often it fires. A
lens that fires on every feature beats one that fires on three, even when the
three are expensive. Where one domain would have taken over a group, the
narrowest member of it went to the catalogue instead.

Where a canonical lens carries a name its own domain file does not, the rename
is recorded below and both names appear in
[`_index.md`](_index.md) so that grepping either finds it. A lens absorbed into
a canonical is not deleted: its contribution is named, and its file still holds
its worked example and its done test.

## Group 1 — The actor

**The actor with three tables** (01) — canonical, unchanged.
Absorbs *One customer, two ledgers* (12): the same missing link, between
`Contact` and `TradingPartner`, where the consequence is a buyer's exposure
showing as two disagreeing balances. The canonical now asks for the link column
for counterparties, not only for logins.

**The principal with no permission key** — renamed from 01's *The credential
with no permission key*, because the question is about the acting principal,
not the secret it holds.
Absorbs *The actor with no role* (02), the same question from the role side;
*The principal with no permission to check* (21), which contributes that
`JwtStrategy.validate` is the only path into the resolver, so a
`@RequirePermission` on a partner route is either a blanket 403 or an accident;
*The machine caller's own scope* (32), which contributes that a minted machine
credential carries an explicit `PermissionKey` subset and its issue is audited
like a role grant; and *The portal has no read scope* (19), which contributes
the row half — `getLiveStock()` checks only `partner.kind`, so every
CUSTOMER-kind partner reads the whole catalogue.

**The grant that ends itself** — renamed from 02's *The grant that never
expires*, because the lens asks for the mechanism, not the absence.
Absorbs *The access with no end date* (01), the externally-sourced time-boxed
actor; *Acting cover has no clock* (04), which contributes the
`startsAt`/`endsAt` delegation row the resolver unions in only inside its
window; *The leaver keeps the keys* (06), which contributes that the
deactivation transaction touches only `User.isActive` and `RefreshToken`; and
*The approval orphaned by a leaver* (04), which contributes that a pending
decision must be reassigned in that same transaction. See ruling 6 for what
that transaction may and may not close.

## Group 2 — The authority

**Whose rows, and which columns** — renamed from WO-22's *Name the owner, name
the reader it refuses*, which named the shape but not the two axes.
Absorbs WO-22's *Whose rows?* — the export, the schedule and the drill-down
apply the same filter and the same mask as the screen; *The default is a scope,
not a filter* (22) — the narrowing is the list's opening state; *Opt-in cost
redaction* (10) — the column half, where the `cost-fields.ts` strippers are
opt-in and no call site is forced to use them; and *Branch means database, not
location* (06) — the fact that makes today's answer negative:
`AdminScope.branchNodeId` is a foreign key into `Node`, which names a child
deployment, not one of 100+ `Location` rows. See ruling 7.

**The threshold nobody approves alone** (04) — canonical, unchanged.
Absorbs *Rank is a ceiling, not a location* (02) — `AdminScopeLevel` answers
where, never how much; *Five commitments, one key* (13) — the five purchasing
moments behind one `purchasing.manage` grant; the ceiling half of *Compensation
authority is a boolean, not a ceiling* (20); the value-band, time-window
and reverse-your-own clauses of WO-22's *Who may unmake it, how large, how
late, and whose*; and *Escalation across roles needs a number, not a name*
(45), which sharpens the canonical's own "who outranks whom" clause into an
artifact — outranking is a comparison, so it needs a number on an axis every
role shares, not a name-to-name lookup in the shape of
`NodesService.childRole`'s hardcoded `NodeRole` switch (`nodes.service.ts:34`).
Where that number is allowed to live is ruling 12; which grant supplies it when
the actor holds several is ruling 13.

**The toxic pair, caught at grant or at act** — renamed, and merged from 03's
first two lenses, *The conflict matrix has no home* and *Detected at grant or
at act*, which were one question split in half.
Absorbs *Who counts the drawer they held* (03) — the worked instance:
`closeShift()` never compares `closedByUserId` to `openedByUserId`; and *The
auditor's key is not a master key* (36) — the same question where one side of
the pair is `audit.view` and the other is the operational key over what it
audits.

**Authority and blast radius** (WO-22) — canonical, unchanged.
Absorbs *The number the auditor cannot see* (11), which supplies the sharpest
live instance of the missing audit row: `product-admin.service.ts:287` logs
`{ changed: Object.keys(dto) }` — field names with no values — while the old
and new price exist only inside a fire-and-forget domain event. See ruling 9
for which class that row belongs to.
Absorbs *The grant nobody can trace back* (42), which extends the row itself:
for a change to **who holds what**, the target's before and after is not
enough — the row must also carry the granter's own resolved permissions at that
instant, because a reviewer cannot otherwise tell whether the grant was inside
the actor's authority when it was made. `user.role_assigned` /
`user.role_unassigned` write `{ roleId }` and nothing else
(`users-admin.service.ts:88-111`), and `UserRoleAssignment` (`core.prisma:336`)
has no `grantedBy`, so the question has no data to answer it from. Evidence
class, per ruling 9.

## Group 3 — The act in the world

**Request or record — classify every write** (WO-22) — canonical, unchanged,
and the governing classification for ruling 2.
Absorbs *A fact that already happened is never rejected* (WO-22 integrations),
which adds the inbound-message case and its one sanctioned exception — an
authenticity failure is refused with no write, everything past the signature
check is a fact; and *The overshort that vanishes* (09), which adds that cash
has no `StockVariance`: `zReport()` computes `overShortMinor` and writes it
nowhere.

**The movement with no address** — renamed from 24's *The write-off with no
address*, and widened from the admin `adjust()` endpoint to every silent
`InventoryService.defaultLocationId()` call site, plus `StockCount` having no
`locationId` and a goods receipt landing at `MAIN`.

**Four hours down, the counter stays open** (WO-22) — kept intact. Its
device-side complement, *Which writes get the queue* (33), sits under it in the
catalogue: that one asks which client actions the till itself protects against
its own disconnection.

## Group 4 — The money

**The unwritten posting rule** (07) — canonical, unchanged.
Absorbs *The liability with no account* (23) — the account itself may not exist
in the thirteen-row chart; *The ledger has no door for opening balances* (27) —
`postEntry()`'s only callers are the seven event handlers and year-end close, so
a non-event fact has no entry point at all; and *The register the ledger never
sees* (37) — capex and depreciation as a second instance of missing account plus
missing rule. See ruling 3 for where the rule's decision lives.

**Every column or none** (07) — canonical, unchanged, and the five dimension
columns are named in the rule rather than counted.
Absorbs *The ledger's five unfilled columns* (10), adding that `costCentreId`
has no backing model so it must be wired or removed; and *One ledger line for
every drawer and every bank* (09), adding that the dimension problem is not
only on the line — account `1000` is one row for every drawer and every bank
account.

**The period that already moved** (07) — canonical, unchanged.
Absorbs the closed-period clause of WO-22's *Who may unmake it, how large, how
late, and whose*. `AccountingService.resolveOpenPeriod()` finds the OPEN period
containing the date and, when none does, falls back to whichever OPEN period
started most recently — so a backdated fact lands wherever, silently, and the
done test is the report that finds every `JournalEntry` whose `date` sits
outside its own period's range.

**The second legal entity** — renamed from 08's *One tax regime, many legal
entities*.
Merges 08's *Number series, one legal entity at a time* — a shared counter
reads to a tax authority as suppressed sales — and *The calendar every brand
shares* (30) — `FiscalPeriod` has no brand column, so one brand's close locks
every other brand's books. Distinct from the catalogue's *The adoption test*,
which is about node collisions on merge, not legal-entity separation inside one
database.

**Dry run before live** (WO-22) — kept intact, and in this group because the
repository's worst instance of evaluation-inside-the-write-path is
`posting-rules.subscriber.ts` picking account codes as it posts. Ruling 3 is
how it coexists with the single-writer invariant.

## Group 5 — The scale

**Three silhouettes, and the day the tier above appears** — WO-22's *Three
silhouettes*, extended in the name because the second half is the part that
gets dropped.
Absorbs *The edition above and the day it appears* (WO-22 topology), which adds
the nullable-scope trap. See ruling 4.
Absorbs *The ladder that must stay empty at Solo* (43), which adds the clause
ruling 4 never covered: **where** the column lives, not only whether it is
nullable. A tier-bearing column placed inside a module that is off by default is
not empty at the editions below — it is absent, and the edition boundary has
quietly done density's job. `organization`, which holds `AdminScope` and
`RetailBrand`, is off in every deployment today (`modules.registry.ts:81`), so
the column goes on the core model. Ruling 11 splits scope columns from edges and
settles which of the two may be null.

**The absent collaborator** (WO-22) — canonical, unchanged.
Absorbs *The refusal that isn't graceful* (28), which adds the distinction that
decides the answer: an extension point no-ops when its module is off, a direct
`KNOWN_MODULE_COUPLINGS` import fails module resolution at boot — so a client's
"just turn that module off" reaches production as a deploy that will not start.

**The second copy of the write** (WO-22) — canonical, unchanged.
Absorbs *The tap that might have already landed* (33), which adds the arrival
moment the original list missed: a device replaying its own write after a
client-side timeout, through an outbox carrying no request-level key, into a
`placeFromPos()` with no idempotency check.

**The hundred-thousandth row** (WO-22) — canonical, unchanged, and the edition
in it is **Organization**, per R14. There is no "corporate edition".
Absorbs *The report that recomputes from scratch* (29), which adds the index
half with a named instance: `balancesAsOf()` (`gl-reports.service.ts:37`)
filters through the relation on `JournalEntry.date`, which has no index, across
a near-total POSTED set, with no report cache anywhere. See ruling 5.

## Group 6 — The afterlife

**The reversal document, not the reversal flag** (WO-22) — canonical,
unchanged.
Absorbs *The credit note is a filed document, not a status flip* (08), where
the reverse document is itself a filing, so it needs its own gapless series and
must move output tax; and the ledger half of *Compensation authority is a
boolean, not a ceiling* (20) — `PaymentsService.refund()` accepts, validates and
persists a partial `refundAmount`, while `onPaymentRefunded()` ignores it and
reverses both the receipt and the sale in full.
Absorbs *The overpayment has no way back* (38), which adds the clause where this
lens meets *The period that already moved*: a correction is issued against a
line whose **own document sits in a period that has since closed**, so the
reverse document lands in the currently open period carrying a foreign key back
to the original line, and is neither refused nor silently re-dated with no link.
`reverseEntry()` reverses a whole `JournalEntry` in one transaction, and the
`payment.refunded` handler's own comment in `posting-rules.subscriber.ts`
records that full reversal is the only shape the domain model supports today.

**The undo fan-out** (WO-22) — canonical, unchanged.
Absorbs *The void that outruns the refund* (24): `changeStatus()` reaches
CANCELLED from three post-payment statuses without reading `Payment.status` or
reversing the posted entry — an uncovered fan-out of exactly the shape this
lens enumerates.

**The version stamp** (WO-22) — kept intact. `TaxRate`'s
`effectiveAt`/`endedAt` is the only rule in the schema that already answers it;
every other rule is read live from a flat `Setting` row behind a 30-second
cache. See ruling 10 for why that row cannot also carry a scope.
Absorbs *The act nobody can trace to its grant* (44), which names the version
stamp an **approval** needs. "Can the number on this record be explained from
its own stored fields a year later" has a specific answer here and it is not the
actor: it is which grant supplied the ceiling, because grants expire and roles
are re-granted, so a record naming only the actor becomes unexplainable the day
a two-week acting cover ends. Ruling 13 states how the grant is selected and
requires the record to name it.

**The erasure the ledger cannot obey** — renamed from 25's *The row the ledger
will not let you touch*, because the lens covers every table, not one row.
Merges *The request the ledger cannot obey* (23), which contributes the
per-table disposition as the deliverable, and *The payload that already left*
(25), which contributes the copies outside the row — an `OutboxEvent` nothing
deletes and a `ReplicationRecord` already in a parent database in another
jurisdiction. Ruling 1 governs it.

**The failure path, and who is allowed to walk it** (WO-22) — canonical,
unchanged.
Absorbs *The operator's second door* (26), which names the concrete artifact:
an `ADMIN_NAV` entry gated by a real `PERMISSION_CATALOG` key, because
`nav-registry.ts` has no operations group and `OutboxEvent`, the replication
tables and `AuditLog` have zero admin routes.

## Catalogue merges

Eleven catalogue lenses absorbed a narrower twin rather than standing beside it,
and two of them absorbed two. The last four are from the backfill files, where
two lenses in one file, or two files in one pass, had reached the same artifact
from different directions:

| Canonical | Absorbed | What the absorbed one contributes |
|---|---|---|
| The price that wins (11) | One price, however many doors (19) | The resolution order must carry counterparty as well as location and channel |
| The till has no floor (11) | The price nobody can point to (24) | The same key, ceiling and preserved-original-price column |
| Custody without ownership (19) | The cloth that leaves the building (16) | Subcontracted stock is the same question as consignment stock |
| The handoff that has no signer (15) | Custody has no holder (37) | A carton and a card-handling device need the same row |
| Shortage with no reason, no evidence (15) | The scrap that has no reason code (16); The claim's evidence pack (35) | A reason code distinct from shrinkage; the claim record and the missing attachment model |
| The branch that cannot trade tomorrow (35) | Going live has no state (31); Downtime that outranks the sale (37) | One missing `Location` state machine, asked at both ends of a branch's life |
| Five doors, one hallway (28) | The field with no home (28) | A subset of the same five doors |
| The busiest minute, and the lock you hold through it (WO-22) | The write that doesn't chunk (29) | `StockCountService.start()` inserts one row per active variant in one unbounded transaction |
| The agreement is not the row it governs (41) | The lease nobody renews (39) | A lease is one `kind` of agreement, and it contributes the two fields the general shape missed: the rent, and a `LANDLORD` value in `PartyRoleName`, which today is exactly `SUPPLIER`, `MANUFACTURER`, `DISTRIBUTOR`, `RETAILER` (`parties.prisma:8-13`). Its lapse half goes to *The renewal nobody is watching* |
| The manager column that doesn't exist (43) | The chain HR actually needs (43) | The same person-to-person edge, demanded by a second set of consumers — leave, reviews, headcount — and adding the negative half: it may not be `AdminScope`, which answers what a person may administer, not who they report to |
| The union that outruns its parts (44) | Scope must gate the ceiling, not just widen it (44) | One rule with two clauses, not two rules: the grant must be scope-matched before its number is read, reusing `assertCanManageAtScope()`'s existing intersection (`scope.guard.ts:84`). Ruling 13 |
| Rank's own table, or a fused column (45) | The number nobody can group by (45) | The reportability argument for the same choice — grade headcount needs a `RankId` foreign key, since every report here groups on a real key (`GlReportsService`, `gl-reports.service.ts:38,95,192`) and none parses a name. Ruling 12 |

---

# Part 3 — The four cuts, and why

A cut lens is not a question anyone was wrong to ask. It is a question whose
answer never changes, or whose answer is work rather than scope. Carrying it in
a rule a reader walks on every feature costs attention and buys nothing.

**The trigger `AuditLog` doesn't have** (05). A real gap, and its answer is
identical on every feature forever — "still no trigger" — while the artifact it
demands is one migration, written once. That is work, not a question. Recorded
as prerequisite work under rulings 1 and 9, which both depend on it, and it
belongs on the migration list.

**Permission with no explanation** (31). Asks for guidance text keyed to a
permission so every surface renders the same string. The demand is already
governed by this repository's globalization rule: operator- and customer-facing
copy lives in translation files, one source per concern. What remains after
that rule is the choice of words, which is content work — it changes what a
screen says, never what a feature contains.

**Demo data has one persona** (31). Asks each feature to seed a sandbox dataset
per actor family. Worth doing once as an enablement project, but the answer is
always "add seed rows" and it never changes the shape of the feature being
scoped. The part that genuinely bites — a trainee's practice sale posting a real
journal entry at an unlaunched branch — is already owned by *The branch that
cannot trade tomorrow*, which demands a `Location` state every reader honours.

**The risk register with no register** (35). Asks where a risk entry lives, with
owner, likelihood, impact and next review date. Every honest answer on every
feature is "nowhere, there is no `Risk` model", because this is a request to
build a governance module, not a question that scopes anything else. It is a
feature proposal wearing a lens's clothes: kept as a proposal, not kept as a
lens.
