# Where two lenses pull against each other

Ten places where running the whole lens set produces two demands that cannot
both be satisfied as stated. None of these is a mistake in a lens. Each is a
real trade-off this repository has already half-made, usually by accident, and
each one an engineer will meet inside a single PR.

This file is the argument. It states each side as its own advocate would, names
the file and line where the collision actually sits today, and says what the
engineer sees when they hit it. It deliberately does not decide anything: the
decisions are in [`_canonical-decisions.md`](_canonical-decisions.md), numbered
to match the sections here, and that is the file to cite in review. Read this
one when a ruling looks wrong, or when a new conflict needs writing up in the
same shape.

A note on what counts. Two lenses asking for expensive things is not a
conflict — that is just work. A conflict is where satisfying one lens as
written makes the other unsatisfiable, so the engineer has to know which
yields. Where a lens and an existing repository invariant collide, that counts
too, and three of the ten are of that kind.

---

## 1. Immutable evidence against the right to erasure

**The pull.** The privacy lenses require that a person's identifying data be
removed from every table on request, per table, with a stated disposition. The
accounting triggers forbid touching a posted line, ever. The legal-hold lens
requires that a deletion be refused outright while a case is open. All three
are correct, and all three fire on the same row.

**For erasure.** *The erasure the ledger cannot obey* (25/23) and *The
retention clock with no dial* (25) are not asking for a favour. A data-subject
request has a statutory clock, and the answer "our ledger is append-only" is
not a defence anyone accepts. The lens asks for a per-table disposition
precisely because the honest answer differs per table: an `InboundEmail` body
has no integrity value and should be destroyed; a `JournalLine` reference does.
Refusing to write the table down is how a deletion request becomes an
engineering emergency with a deadline attached.

**For immutability.** *The hold that beats the delete button* (05), the
accounting triggers and the append-only audit trail exist because a ledger
nobody can edit is the only ledger worth having. `forbid_journal_line_mutation()`
and `forbid_journal_entry_mutation()`
(`migrations/20260917070552_add_accounting_ledger/migration.sql:221,237`) are
the strongest invariants in the schema. An erasure path that issues an `UPDATE` against a protected table does
not "partially succeed" — it raises, mid-transaction, in production, on a path
whose whole purpose was to be reliable.

**Where it collides here.** A person reachable four ways at once:
`JournalLine.contactId` (`accounting.prisma:189`, a bare scalar under the
immutability trigger); `AuditLog.data`, a free-form `Json?`
(`core.prisma:226`), which is a plain mutable table protected by a comment and
nothing else; `InboundEmail.bodyText`, `fromName` and `fromAddress`
(`crm.prisma:147-151`); and `OutboxEvent.payload` (`core.prisma:364`) plus any
`ReplicationRecord.payload` (`replication.prisma:62`) already pushed to a
parent node, possibly in another jurisdiction — there is no country or region
column on `Location`, `Node` or `RetailBrand` to filter that by. Nothing purges
any of them, and there is no `LegalHold` model for a hold to attach to.

**What the engineer sees.** They build the erasure endpoint, cascade what
cascades, and then reach the ledger. Nulling `contactId` raises. Leaving it
fails the privacy lens. Deleting the `JournalLine` is not on the table. They
then discover the same identifiers in two JSON payloads, one of which has
already left the building. There is no rule in the repository that tells them
which of these is allowed to lose, so they pick one, and the next engineer
picks the other.

---

## 2. A branch that must keep trading offline against an approval before the act

**The pull.** One set of lenses says a fact that already happened in the
physical world is never refused. Another says a document does not leave draft
until its band's approver signs. A disconnected till is where both are true at
once.

**For the unconditional write.** *Request or record — classify every write*
(WO-22), *Four hours down, the counter stays open* (WO-22) and *Which writes
get the queue* (33) are about a property of reality: the customer has left with
the goods. A system that refuses to record that has not prevented anything, it
has only stopped knowing. Refusing a record is how a shop ends up with a
notebook behind the counter that never gets typed in.

**For the gate.** *The threshold nobody approves alone* (04), *The status
nobody checks* (12) and *A boolean is not a lifecycle* (13) are about
exposure. An approval that happens after the commitment is not an approval, it
is a report. If a £40,000 purchase order can be raised and acted on before
anyone with the authority sees it, the band was decoration.

**Where it collides here.** `apps/pos` wraps only the sale flow in its device
outbox — returns, refunds, cash movements and shift open/close have no queued
path, per the domain 33 findings. `PosSaleRequest` and `placeFromPos()` carry
no client-generated idempotency key, so a write whose first attempt timed out
ambiguously has nothing to deduplicate on. On the gate side there is no
`Approval` or `ApprovalStep` model and no amount-band table anywhere;
`payments.approve` is one boolean, and `ContactStatus.BLOCKED`
(`crm.prisma:13`) is a label no order-placement path reads.

**What the engineer sees.** They are adding a feature a branch can perform
offline that also commits money above a threshold. They write "the till queues
it and it gets approved when the connection returns", which reads as a design
and is not one: either it committed at the till or it refused at the till, and
the PR has not said which. Meanwhile the approval screen, when it finally
loads, is approving something that already happened.

---

## 3. Dry run against the single writer

**The pull.** Simulation needs the deciding function to be pure and callable
over history. The repository's strongest structural invariants are that there
is exactly one writer per fact. Today those are the same function.

**For dry run.** *Dry run before live* (WO-22) exists because a policy switch
thrown blind is an outage with an audience. Being able to replay last month's
real records through a new rule and read the diff is the difference between
"we think this posts correctly" and knowing. That requires
`decide(inputs) -> outcome` with no write in it.

**For the single writer.** *The unwritten posting rule* (07) rests on
`AccountingService.postEntry()` being the only path into the ledger — the
service's own header says so, and names the seven `PostingRulesSubscriber`
handlers and `closeFiscalYear()` as its only callers. `InventoryService.move()`
(`inventory.service.ts:198`) is the same guarantee for quantity, delegating to
a private `applyMovement()`. Two writers means two places to get an invariant
wrong, and the second one is always the one nobody tested.

**Where it collides here.** `posting-rules.subscriber.ts` selects account codes
inside the same method that posts them. There is no way to ask it what it
*would* post. Worse, the tempting workaround is available:
`postEntry()` accepts an optional transaction client, so a reviewer will be
offered a "dry run with rollback" that opens a transaction, replays thirty days
and rolls back.

**What the engineer sees.** They are asked for a preview of a new posting rule.
The only code that knows which accounts to hit is inside the writer. Extracting
it is a refactor of the module they were not asked to touch; not extracting it
means either shipping no preview or shipping one that holds a transaction open
across a thirty-day replay, which is an outage wearing a feature's name.

---

## 4. A scope column on every row against making the product look small

**The pull.** The scale lenses require the tier-bearing column in the first
migration. The seven laws require a first-time user to perceive a small
product — and the same lens set fails a screen that renders a brand picker when
there is one brand.

**For the column.** *Whose rows, and which columns* (WO-22/22/10/06) and *Three
silhouettes* (WO-22) are about a cost that only ever goes up. R14 promises that
Solo → Chain → Organization is adding nodes above an existing one, never a
migration; that promise is only keepable if the Solo database already has the
right shape. A scope column added later is a backfill against live rows whose
correct value nobody recorded at the time.

**For the calm screen.** CLAUDE.md law 3 — it should feel like there are only a
few features — and the no-speculative-functionality rule behind *The field with
no home* (28) are equally load-bearing. RETAIL-ERP.md R14's first constraint is
explicit: every tier concept must be invisible in Solo. No brand picker, no
node, no sync screen, no scope selector. A column nothing reads also looks,
from a code review's point of view, exactly like speculative functionality.

**Where it collides here.** The repository already contains the shape of the
answer and the shape of the trap side by side. `Location` has a single `MAIN`
row every deployment carries and no user has ever seen — R14 names it as the
precedent that works. And `scopeFilterFor()` (`core/auth/scope.guard.ts:124`)
returns `{ retailBrandId: { in: [...] } }`, which in Postgres never matches
`NULL`: history written while the column was nullable and unset goes invisible
the instant a brand tier is switched on.

**What the engineer sees.** A reviewer asks why a `retailBrandId` is in a
migration for a client with one brand, and whether the picker is coming. The
engineer's honest answer is "the column now, the picker maybe never", which
sounds like a hedge. The compromise everyone reaches for — ship it nullable,
decide later — is the one option that fails both lenses at once.

---

## 5. More dimensions on every fact against what the feature costs at scale

**The pull.** One set of lenses demands that every fact carry its brand,
branch, location and cost centre. Another shows that the per-location writes
already in place are the most expensive thing in the sale path.

**For the dimensions.** *Every column or none* (07/10/09), *The movement with
no address* (24), *The reorder point has no address* (14) and *One clock, a
hundred branches* (30) are all one argument: a fact with no place is a fact no
branch can reconcile. `InventoryService.defaultLocationId()`
(`inventory.service.ts:166`) resolving silently to `MAIN` is not a default, it
is a wrong answer recorded confidently.

**For the cost.** *The cost that multiplies by location* (29) and *The
hundred-thousandth row* (WO-22/29) are measuring, not speculating.
`applyMovement()` finishes every single-unit movement with
`UPDATE "ProductVariant" SET stock = (SELECT SUM(quantity) FROM
"VariantLocationStock" WHERE "variantId" = ...)`, inside the transaction. The
cost of selling one unit is tied to how many locations stock that SKU, not to
the size of the movement. Adding dimensions to a path like that, without
saying what it then reads, is how a chain's checkout gets slower every time it
opens a branch.

**Where it collides here.** The same transaction, in the same method. And on
the read side, `balancesAsOf()` (`gl-reports.service.ts:37`) recomputes every
trial balance from raw `JournalLine` rows with no report cache anywhere: it
groups on `accountId` and filters through the relation on `JournalEntry.status`
and `JournalEntry.date`. `JournalEntry` is indexed on `periodId`,
`[source, sourceRef]` and `status` — not on `date`.

**What the engineer sees.** They add a `locationId` to a write, which is
cheap and right. Then they add the figure somebody actually asked for — stock
by location, cost by branch — and the only way to compute it with the models
available is another aggregate over the same dimension, in the same
transaction, because that is the pattern already there to copy.

---

## 6. Closing the leaver's shift against never fabricating a count

**The pull.** The joiner-mover-leaver lens wants a deactivation to leave
nothing dangling, including an open till. The request-or-record lens says a
physical fact is never manufactured by a system action.

**For closing it.** *The grant that ends itself* (02/06/04) is about the gap
between a person leaving and their authority leaving. Today deactivation
touches `User.isActive` — `jwt.strategy.ts:35` refuses the login — and nothing
else: no `UserRoleAssignment` or `AdminScope` row is removed, no pending
decision is reassigned, and an open `PosShift` stays open with a departed
cashier's id on it. An open shift is not a neutral state; it is a drawer
nobody is accountable for.

**For not closing it.** *Request or record — classify every write* (WO-22) says
the cash in the drawer is a physical fact, and closing a shift means writing a
closing count. Nobody counted it. `PosShift.closingCashMinor`
(`pos.prisma:74`) is documented as the cashier's own physical count, compared
against the running total for the Z-report's over/short. A computed figure
written into that column is a count that did not happen, and it looks
identical to one that did.

**Where it collides here.** `closeShift(shiftId, closedByUserId,
closingCashMinor)` (`pos-shifts.service.ts:72`) takes the figure as an
argument and asks nothing about who is supplying it — it does not even compare
`closedByUserId` to `openedByUserId`. `zReport()` computes `overShortMinor`
and persists it nowhere; there is no `CashVariance` model, unlike
`StockVariance`. And `PosShift` has no relation to `User` at all, only bare
`openedByUserId`/`closedByUserId` scalars, so "every row keyed to that userId"
does not reach it by a foreign key.

**What the engineer sees.** They are writing the deactivation transaction.
Leaving the shift open leaves a hole the JML lens names. Closing it means
inventing a number. There is no third state in the schema, and no queue for a
drawer somebody else has to count.

---

## 7. Lists that open scoped against figures that must reconcile

**The pull.** Scoping means two people legitimately see different totals for
the same tile. Reconciliation means a number and the list behind it must agree.

**For scoping.** *Whose rows, and which columns* (WO-22/22) and *The default is
a scope, not a filter* (22) are about the opening state of a screen. A branch
manager whose first page is every branch's rows has been handed a filtering
job, and the narrowing has to be the scope, not an optional control they might
forget.

**For comparability.** *Click the number* (WO-22) and the consolidation lens
exist because a figure a reader cannot reproduce is a figure they stop
trusting. Two managers quoting different revenue for the same month, both
correct, is worse than either being wrong: nobody can tell which it is without
knowing a scope neither number states.

**Where it collides here.** The pieces exist and disagree in shape.
`scopeFilterFor()` narrows by `retailBrandId` only; `AdminScope.branchNodeId`
(`organization.prisma:111`) is a foreign key into `Node`, which names a child
deployment, not one of the 100+ `Location` rows a floor manager actually works
in. `SettingsAdminService.listAuditLog()` calls no scope filter at all, so
`audit.view` is deployment-wide. And nothing anywhere renders a figure's own
scope beside the figure.

**What the engineer sees.** They scope the list correctly, and the dashboard
tile above it now disagrees with the group total the owner remembers. Either
they unscope the tile, and the branch manager sees rows they should not, or
they leave it scoped, and two screens in one product state different facts with
no visible reason.

---

## 8. Master data that must travel up against a registry that forbids it

**The pull.** A branch that may create products needs those products reviewed
by the brand. The replication registry refuses, by construction, to carry a
policy row upward — and a `Product` is policy.

**For the upward path.** *The propose-up path that never opens* (18) starts
from a switch that already exists: `BrandPolicy.allowBranchProductCreation`
(`organization.prisma:70`). If a branch may create a product, something has to
happen to it. Today `Product` has no `scopeLevel` and no `originNodeId`, so
nothing records that a row is a branch's proposal rather than the brand's
catalogue, and there is no mechanism to send it up.

**For the registry.** `replication.registry.ts:29-33` rejects a `FACT` that
flows `DOWN` and a `POLICY` that flows `UP`, and raises at registration time
with R2 quoted. That is not an oversight to work around; it is the invariant
that keeps a chain's data flow legible. Two directions for one entity class is
how a replication layer becomes unreasonable about conflicts.

**Where it collides here.** Only two producers are registered today —
`catalog/product-replication.listener.ts` and
`orders/order-replication.listener.ts` — so the registry's rule has not yet had
to bend. The moment a branch-created product needs brand approval, it does.

**What the engineer sees.** They register the descriptor, the registry throws
at boot with R2 in the message, and the shortest path forward is an exception
in the registry for this one entity. That exception is invisible six months
later, and it is the thing the next conflict about replication direction will
cite as precedent.

---

## 9. Evidence-class audit against never blocking the sale

**The pull.** Several lenses treat an audit row as evidence someone will be
held to. `AuditService.record()` is fire-and-forget by design. Both positions
are deliberate.

**For evidence.** *Authority and blast radius* (WO-22/11), *Who read it, not
just who wrote it* (05) and *The control has no name, only the fact does* (36)
all assume the trail can be relied on. A price change with no recorded old
value is not auditable, and `product-admin.service.ts:287` logs
`data: { changed: Object.keys(dto) }` — field names, no values — while the old
and new price exist only inside a fire-and-forget domain event. A write that may
silently not happen is not evidence; it is a hope with a table.

**For never blocking.** `AuditService.record()` catches and logs its own
failure rather than throwing, and that is the right default for most call
sites. Making every audit write transactional means an audit-table problem can
stop a sale — the audit trail becoming a single point of failure for the
business it was meant to observe.

**Where it collides here.** `AuditService.record()`'s `catch` swallows the
error. There is no DB-level immutability on `AuditLog` either: only
`JournalLine` and `JournalEntry` have triggers, so the table an auditor would
read is mutable, and `AuditLog.data` has no schema — two call sites logging the
"same" action can shape it differently with nothing to stop them.

**What the engineer sees.** They are adding the audit row for a permission
change. Best-effort means the one row a regulator would ask for is the row that
can be missing. Transactional means they have quietly made the audit table able
to fail a login. Nothing in the repository tells them which class this call is,
so they use the default and write "audited" in the PR description.

---

## 10. A rule that differs by brand against `Setting`'s actual shape

**The pull.** The extensibility lens says a per-deployment rule becomes a
`Setting` key rather than an inline conditional. The authority lens says a
BRANCH override must beat a BRAND default which beats an ORG default.
`Setting` cannot express a scope at all.

**For the setting.** *Five doors, one hallway* (28) is the rule that stops a
client-specific ask from becoming an `if` in a shared module. Naming the door —
sector pack, extension point, `Setting` key, shared schema field, or a written
refusal — is what keeps one codebase serving many clients. `Setting` is the
door that costs nothing to open.

**For the scope.** *Authority and blast radius* (WO-22) asks which roles may
change a rule *at which of the three scopes*, and the answer has to be a real
one. `Setting` is `key String @id` plus `value Json` (`core.prisma:153-158`) —
one global row per key, no brand column, no branch column, no owner — read
through a 30-second per-process cache (`CACHE_TTL_MS = 30_000`,
`settings.service.ts:6`). There is nowhere in it for a scope to live.

**Where it collides here.** `BrandPolicy` (`organization.prisma:70`) already
exists and already holds brand-level policy — `allowBranchProductCreation`,
`allowBranchLocalPurchasing`, `allowInterBranchTransfers` — as real columns. So
the repository has two doors for brand-level rules, one of which cannot
actually carry a brand. And the tempting third option is worse than either: a
composite key like `brand.<id>.cod_fee` is a scope column in disguise that no
query can filter on, made worse by a per-process cache.

**What the engineer sees.** The feature needs one number that differs per
brand. `Setting` is the sanctioned door and takes an afternoon. Scoping
`Setting` properly is a platform change with its own cache-invalidation
problem. The composite key works today, on this client, with one brand, and
nothing in review catches it.
