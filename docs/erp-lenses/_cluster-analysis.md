# Consolidation: how 146 lenses became 24

Two bodies of work fed this pass. The thirty lenses of the WO-22 run
(`docs/implementation/WO-22-lens-workflow-results.md`), first draft, never
grounded against the repository. And the 116 lenses in the numbered files of
this folder, each grounded against `00-uagent.md` and each put through an
adversarial hardening pass that recorded what it killed and what it corrected.

146 lenses is not a rule. It is a document nobody finishes, and a rule nobody
finishes governs nothing. This file records how they were reduced to 24
headline lenses in six groups, what each survivor absorbed, where two lenses
genuinely pull against each other and which one wins, and what was cut.

Everything not headline is in the catalogue at the end. Nothing was deleted
except the four entries in the cut list, and each of those says why.

The ranking rule was leverage: damage its absence causes, times how often it
fires. A lens that fires on every feature beats one that fires on three, even
when the three are expensive. Where one domain would have taken over a group,
the narrowest member of it went to the catalogue instead.

---

## The six groups, and the order they are in

The groups are ordered the way an engineer walks a feature, not the way the
domains were numbered.

**1. The actor** — who is doing this, which table they are, and what ends
their access. Answered first because everything after it is a property of
somebody. Three lenses.

**2. The authority** — what bounds the act: which rows they may see, how much
they may approve alone, which two capabilities must never sit in one grant,
and who may change the rule itself. Four lenses.

**3. The act in the world** — the write as a physical event: whether it may
be refused at all, which of a hundred locations it happened at, and what the
staff do for the four hours the system is down. Three lenses.

**4. The money** — what the act does to the books: the posting rule, the
dimensions on its lines, the period it lands in, the second legal entity, and
whether the rule that computes the number can be run without writing. Five
lenses.

**5. The scale** — what it costs at three editions, a hundred branches and a
hundred thousand rows, and what happens when the same write arrives twice.
Four lenses.

**6. The afterlife** — undoing it, explaining it a year later, erasing the
person from it, and finding it when it failed. Five lenses.

### Group 1 — The actor

| Lens | Question |
|---|---|
| The actor with three tables | For every new kind of actor or counterparty this feature touches, name which existing table it becomes — `User`, `Party`, `Contact`, `TradingPartner`, or one of the three key-hash principals — and, where one real party is two of them at once, the column that links the rows. |
| The principal with no permission key | For every actor here that is not a `User`, name the `PERMISSION_CATALOG` keys it can be checked against, or name the code path that authenticates it instead of `PermissionsGuard` — and state what bounds what it may do and which rows it may read. |
| The grant that ends itself | For every grant this feature creates — role assignment, permission override, admin scope, acting cover, a time-boxed auditor — name what ends it without a human remembering; and name every row keyed to that `userId` that must change in the same transaction the day the person is deactivated, including any decision still assigned to them. |

### Group 2 — The authority

| Lens | Question |
|---|---|
| Whose rows, and which columns | For every row this feature writes, which entity does it name — organization, brand, branch node, `Location`, terminal? For every list, export, schedule and drill-down it adds, name the signed-in actor who must get back fewer rows and fewer columns than a super admin, and the exact rows and fields they must never see. Name the column that carries that scope, given `AdminScope.branchNodeId` points at `Node` and `Node` has no rows in a single-database deployment. |
| The threshold nobody approves alone | For each action here that commits money or stock at a value, name the amount bands, the role each band requires, the quorum on the top band, and the service method where the check runs before the row leaves its draft state — then the same four answers for the undo, which is never the same authority as the do. |
| The toxic pair, caught at grant or at act | Name the permission-key pair this feature makes toxic together, and state which single enforcement point exists for it — a refusal in `RolesService.create`/`.update` at role-save time, or a throw at act time comparing the actor to a stored id — and where in the diff it lives. |
| Authority and blast radius | Which roles may change this rule, at which of the three scopes, does the change need a second signature, what is the worst value one of them can set before anything notices — and where is the audit row carrying the old value, the new value, the scope, the actor and the reason? |

### Group 3 — The act in the world

| Lens | Question |
|---|---|
| Request or record — classify every write | For each write this feature performs, is it a request the system may refuse, or a record of something that already happened in the physical world and therefore may never be refused? For every record, name the unconditional write path, the variance row a would-be refusal produces instead, the queue it lands in, who may clear it, and how the books stay balanced. |
| The movement with no address | For every stock or cash write this feature makes, name the `locationId` it carries and where that value comes from. If the answer is `InventoryService.defaultLocationId()`, name which one of the 100+ locations that silently is, and what the branch that actually moved the goods sees on its own shelf count. |
| Four hours down, the counter stays open | This feature is unavailable for four hours in the middle of trading. Name every actor who was mid-task, what they do instead, the surface that ingests the work they did by hand, the permission that guards it, and the reconciliation that proves no fact was counted twice. |

### Group 4 — The money

| Lens | Question |
|---|---|
| The unwritten posting rule | Write the exact posting rule this feature triggers: the domain event, the Dr/Cr account codes — naming any account the thirteen-account chart does not have — and the `findPostedEntry(source, sourceRef)` idempotency key. Or state it never reaches the ledger and name the report that reconciles it instead. If the fact is not event-shaped, name the door it uses, because `postEntry()` has none. |
| Every column or none | For every `JournalLine` this feature creates, name which of `organizationId` / `retailBrandId` / `branchNodeId` / `costCentreId` / `counterpartyBrandId` it sets and to what value, or declare the line intentionally undimensioned and name the report that may therefore blend it across brands. |
| The period that already moved | State what happens when this feature posts a fact whose own date falls in a CLOSED or LOCKED `FiscalPeriod`: does it silently land in whatever period is open today, and which report surfaces the entries whose `date` sits outside their own period's range? |
| The second legal entity | Name what breaks the day a second `RetailBrand` in a second country goes live: the field holding its tax label, registration number and currency; the counter key keeping its `Invoice`/`JournalEntry` series independent and gapless; and the column that lets its fiscal period close while the other brand's stays open. |
| Dry run before live | Before this rule is switched on, can someone replay it over last month's real records and read the diff with nothing written? The function that decides the outcome takes its inputs as arguments and returns the outcome, with no `prisma.` write and no `publish(` in its body, and a second, read-only caller exists. |

### Group 5 — The scale

| Lens | Question |
|---|---|
| Three silhouettes, and the day the tier above appears | Draw this capability three times — one shop, forty-branch chain, group of brands. Which tier-bearing columns must be in its first migration while never rendering on the Solo screen, and what happens to every row it already wrote the day a second entity appears above it? |
| The absent collaborator | List every module this capability reads from, writes to or emits toward that is off by default. For each: absent, what fact is still recorded, what is silently not recorded, what does the user see instead of the control — and is it reached through a domain event or extension point, or through a direct import in `KNOWN_MODULE_COUPLINGS` that fails at Nest boot rather than degrading? |
| The second copy of the write | Name the two moments this write arrives twice — the retried HTTP call, the redelivered outbox event, the till replaying a queued sale whose first attempt timed out with no answer — and name the column, with its unique constraint, that makes the second arrival a no-op. Then name what the loser of a simultaneous write sees on screen. |
| The hundred-thousandth row | State the row count this feature's largest table reaches at corporate edition, the SQL statements one page issues at that size, how many the database serves from an index — and for any figure a user can refresh, which of the columns its query filters and groups on is indexed today. |

### Group 6 — The afterlife

| Lens | Question |
|---|---|
| The reversal document, not the reversal flag | For every forward fact this feature writes, name the reverse document that undoes it — its entity, its number series, its quantity or amount field, and its foreign key back to the specific original line — and show it can be issued for part of the original, more than once, until the original is exhausted. |
| The undo fan-out | Enumerate every side effect the forward path fires and, for each, state which of three it is: reverses automatically (name the method), needs a human (name the screen and the permission), or is deliberately irreversible (one sentence why). |
| The version stamp | When someone edits this rule next quarter, what happens to every record already created under the old one, and can anyone still explain the number on it from the record's own stored fields plus the policy version it names? |
| The erasure the ledger cannot obey | When an erasure request reaches this person, name every table still holding their identifying data once the `User` row is gone — `JournalLine.contactId` under its immutability trigger, `AuditLog.data`, `InboundEmail.bodyText`, `OutboxEvent.payload`, any `ReplicationRecord` already pushed to a parent database — and give each a disposition: cascade, pseudonymise in place, or retain under a named legal basis. |
| The failure path, and who is allowed to walk it | When this feature's call or event fails for the last time, which durable store does it land in with its payload, which screen lists it, which permission opens that screen, which action replays it, and what makes replaying it twice safe? |

---

## The duplicate map

Canonical wording first, then what it absorbed and what each absorbed lens
contributed that the canonical now has to carry. A lens listed here is not
gone; its demand survives inside the canonical.

### Into headline lenses

**The actor with three tables** (`01-identity-actor-types.md`)
- *One customer, two ledgers* (`12-credit-receivables.md`) — the same shape
  one table over: `Contact` backs `Order`, `TradingPartner` backs `Invoice`,
  no key between them, so one buyer's exposure is two disagreeing balances.
  The canonical now asks for the link column for counterparties, not only for
  logins.

**The principal with no permission key** (`01-identity-actor-types.md`)
- *The actor with no role* (`02-roles-ranks-orgchart.md`) — same question from
  the role side.
- *The principal with no permission to check* (`21-omnichannel-parity.md`) —
  adds that `JwtStrategy.validate` is the only path into the resolver, so a
  `@RequirePermission` on a partner-reachable route is either a blanket 403 or
  an accident.
- *The machine caller's own scope* (`32-automation-and-ai-surface.md`) — adds
  that a newly minted machine credential must carry an explicit subset of
  `PermissionKey`, and that issuing it is audited like a role grant.
- *The portal has no read scope* (`19-channels-franchise-wholesale.md`) — adds
  the row half: `getLiveStock()` checks only `partner.kind`, so every
  CUSTOMER-kind partner reads the whole catalogue. This is why the canonical
  asks "what it may do **and which rows it may read**."

**The grant that ends itself** (`02-roles-ranks-orgchart.md`)
- *The access with no end date* (`01-identity-actor-types.md`) — the
  externally-sourced, time-boxed actor (auditor, tax agent, seasonal
  subcontractor).
- *Acting cover has no clock* (`04-approval-delegation.md`) — adds the
  delegation shape: a row with `startsAt`/`endsAt` that
  `PermissionsResolverService.resolveForUser()` unions in only inside its
  window.
- *The leaver keeps the keys* (`06-workforce-shifts-jml.md`) — adds the
  departure half: the deactivation transaction touches `User.isActive` and
  `RefreshToken` and nothing else.
- *The approval orphaned by a leaver* (`04-approval-delegation.md`) — adds
  that a pending decision assigned to the leaver must be reassigned in that
  same transaction, which is why the canonical names "any decision still
  assigned to them."

**Whose rows, and which columns** (`WO-22`, "Name the owner, name the reader
it refuses")
- *Whose rows?* (`WO-22`, reporting) — adds that the export, the scheduled
  send and the drill-down must apply the same row filter and column mask the
  screen applied, and that a scheduled report has no viewer at all today.
- *The default is a scope, not a filter* (`22-findability-at-scale.md`) — adds
  that the narrowing must be the list's opening state, computed from the
  actor, not an optional filter the operator must know to apply.
- *Opt-in cost redaction* (`10-costing-transfer-pricing.md`) — adds the column
  half with a concrete leak: `cost-fields.ts` strippers are opt-in per call
  site and `InventoryController.list()` does not call them.
- *Branch means database, not location* (`06-workforce-shifts-jml.md`) — adds
  the fact that makes the question answerable-in-the-negative today:
  `AdminScope.branchNodeId` is a foreign key into `Node`, which names a
  separate child deployment, so in a single-database Org tier there is no id
  that names one of the 100+ `Location` rows.

**The threshold nobody approves alone** (`04-approval-delegation.md`)
- *Rank is a ceiling, not a location* (`02-roles-ranks-orgchart.md`) — adds
  that `AdminScopeLevel` answers where, never how much, and that using scope
  as a stand-in for rank is the trap.
- *Five commitments, one key* (`13-procurement-supplier-lifecycle.md`) — adds
  the five concrete purchasing moments behind one `purchasing.manage` grant.
- *Compensation authority is a boolean, not a ceiling*
  (`20-service-cases-sla.md`) — the ceiling half; its ledger half went to *The
  reversal document*.
- *Who may unmake it, how large, how late, and whose* (`WO-22`) — the
  value-band, time-window and may-you-reverse-your-own clauses; its
  closed-period clause went to *The period that already moved*.

**The toxic pair, caught at grant or at act** (`03-segregation-of-duties.md`)
- *Detected at grant or at act* (`03-segregation-of-duties.md`) — the two
  files' first and second lenses are one question split in half; the canonical
  is the pair plus the enforcement point.
- *Who counts the drawer they held* (`03-segregation-of-duties.md`) — the
  worked instance: `closeShift` never compares `closedByUserId` to
  `openedByUserId`.
- *The auditor's key is not a master key*
  (`36-internal-audit-controls-testing.md`) — the same question where one side
  of the pair is `audit.view` and the other is the operational key over what
  it audits.

**Authority and blast radius** (`WO-22`, configurable policy)
- *The number the auditor cannot see* (`11-pricing-discount-governance.md`) —
  adds the sharpest instance of the missing audit row:
  `product-admin.service.ts` logs `{ changed: Object.keys(dto) }`, field names
  with no values, while the old and new price exist only inside a
  fire-and-forget domain event.

**Request or record — classify every write** (`WO-22`, resilience)
- *A fact that already happened is never rejected* (`WO-22`, integrations) —
  adds the inbound-message case and its one sanctioned exception: an
  authenticity failure is refused with no write; everything past the signature
  check is a fact.
- *The overshort that vanishes* (`09-treasury-cash-reconciliation.md`) — adds
  the missing variance row for cash: `zReport()` computes `overShortMinor` and
  writes it nowhere, while `StockVariance` already has the shape to copy.

**The unwritten posting rule** (`07-money-integrity-gl.md`)
- *The liability with no account* (`23-loyalty-consent-data-rights.md`) — adds
  that the account may not exist: the chart has thirteen rows and none for a
  points liability.
- *The ledger has no door for opening balances*
  (`27-migration-cutover-restatement.md`) — adds that `postEntry()`'s only
  callers are seven event handlers and year-end close, so a fact that is not
  event-shaped has no door at all.
- *The register the ledger never sees*
  (`37-assets-facilities-maintenance.md`) — adds capex and depreciation as a
  second instance of the same missing account plus missing rule.

**Every column or none** (`07-money-integrity-gl.md`)
- *The ledger's five unfilled columns* (`10-costing-transfer-pricing.md`) —
  the same question over all five columns; adds that `costCentreId` has no
  backing model, so it must be wired or removed.
- *One ledger line for every drawer and every bank*
  (`09-treasury-cash-reconciliation.md`) — adds that the dimension problem is
  not only on the line: account `1000` is one row for every drawer and every
  bank account in the deployment.

**The period that already moved** (`07-money-integrity-gl.md`)
- *Who may unmake it …* (`WO-22`) — its closed-period clause, and the fact
  that the repo already holds two opposite answers: `reverseEntry()` reroutes
  to today's open period, `recordCashMovement()` throws.

**The second legal entity** (`08-tax-jurisdiction-invoice.md`)
- *Number series, one legal entity at a time*
  (`08-tax-jurisdiction-invoice.md`) — merged up into the same lens; a shared
  counter reads to a tax authority as suppressed sales.
- *The calendar every brand shares* (`30-time-periods-backdating.md`) — adds
  the fiscal calendar: `FiscalPeriod` has no brand column, so one brand's
  close locks every other brand's books.

**Three silhouettes, and the day the tier above appears** (`WO-22`)
- *The edition above and the day it appears* (`WO-22`, topology) — adds the
  nullable-scope trap: `retailBrandId: { in: [...] }` never matches NULL, so
  history written before the tier existed goes invisible the instant it is
  switched on, and the written meaning of null is part of the feature.

**The absent collaborator** (`WO-22`)
- *The refusal that isn't graceful* (`28-extensibility-without-fork.md`) —
  adds the distinction that decides the answer: an extension point no-ops, a
  direct import in `KNOWN_MODULE_COUPLINGS` fails at boot.

**The second copy of the write** (`WO-22`)
- *The tap that might have already landed* (`33-operator-hands.md`) — adds the
  arrival moment the original list missed: a device replaying its own write
  after a client-side timeout, through an outbox that carries no
  request-level key and into a `placeFromPos()` with no idempotency check.

**The hundred-thousandth row** (`WO-22`)
- *The report that recomputes from scratch* (`29-cost-to-serve.md`) — adds the
  index half with a named instance: `balancesAsOf()` filters on
  `JournalEntry.date`, which has no index, across a near-total POSTED set.

**The reversal document, not the reversal flag** (`WO-22`)
- *The credit note is a filed document, not a status flip*
  (`08-tax-jurisdiction-invoice.md`) — adds that where the reverse document is
  itself a filing it needs its own gapless series and must move output tax,
  not merely reverse a ledger entry.
- *Compensation authority …* (`20-service-cases-sla.md`), ledger half — adds
  the live defect: a partial `Payment.refundAmount` still triggers a full
  `reverseEntry()`.

**The undo fan-out** (`WO-22`)
- *The void that outruns the refund* (`24-fraud-insider-risk.md`) — adds the
  uncovered transition: `changeStatus()` reaches CANCELLED from three
  post-payment statuses without reading `Payment.status` or reversing
  anything.

**The erasure the ledger cannot obey** (`25-privacy-retention-residency.md`)
- *The request the ledger cannot obey* (`23-loyalty-consent-data-rights.md`) —
  the same question; contributes the per-table disposition table as the
  deliverable.
- *The payload that already left* (`25-privacy-retention-residency.md`) — adds
  the copies outside the row: `OutboxEvent.payload` that nothing deletes, and
  `ReplicationRecord.payload` already pushed to a parent database in another
  jurisdiction.

**The failure path, and who is allowed to walk it** (`WO-22`)
- *The operator's second door* (`26-day-two-operations.md`) — adds the
  concrete artifact: an `ADMIN_NAV` entry gated by a real `PERMISSION_CATALOG`
  key, because `nav-registry.ts` has no operations group and `OutboxEvent`,
  the replication tables and `AuditLog` have zero admin routes.

### Into catalogue lenses

These merges happened one level down; they matter because they stop the
catalogue itself becoming a second landfill.

- **The price that wins** (`11`) absorbs *One price, however many doors*
  (`19`) — the resolution order must carry channel **and counterparty**, not
  only location.
- **The till has no floor** (`11`) absorbs *The price nobody can point to*
  (`24`) — same demand: a key distinct from `pos.operate`, a ceiling, and a
  column preserving the price it replaced.
- **Custody without ownership** (`19`) absorbs *The cloth that leaves the
  building* (`16`) — consignment stock and subcontracted cloth are one
  question: which row says we own it and someone else holds it.
- **The handoff that has no signer** (`15`) absorbs *Custody has no holder*
  (`37`) — a carton and a card-handling device need the same row: who
  physically held this, and what happens when they leave.
- **Shortage with no reason, no evidence** (`15`) absorbs *The scrap that has
  no reason code* (`16`) and *The claim's evidence pack* (`35`) — three losses
  with one undifferentiated `WRITE_OFF` between them and nowhere to attach a
  photograph.
- **The branch that cannot trade tomorrow** (`35`) absorbs *Going live has no
  state* (`31`) and *Downtime that outranks the sale* (`37`) — one missing
  `Location` state machine, asked at both ends of a branch's life, plus the
  query that lists which locations are degraded now.
- **Five doors, one hallway** (`28`) absorbs *The field with no home* (`28`) —
  the second is a subset of the first's five doors.
- **The busiest minute, and the lock you hold through it** (`WO-22`) absorbs
  *The write that doesn't chunk* (`29`) — same question, and `29` supplies the
  instance: `StockCountService.start()` inserts one row per active variant in
  one transaction with no location scope.

---

## The conflicts

Ten places where two lenses genuinely pull against each other, or against a
rule the repository already enforces. Each states both sides as their own
authors would, then rules. "Balance them" is not a ruling; each of these names
which side wins, when the other applies, and what the engineer does when both
bite at once.

### 1. Immutable evidence against the right to erasure

**One side.** *The erasure the ledger cannot obey* and the retention clock
lens demand that a person's identifiers be removed on request, from every
table, including `AuditLog.data` and `InboundEmail.bodyText`.

**The other.** `journal_line_immutable` and `forbid_journal_entry_mutation()`
forbid UPDATE and DELETE on a posted line forever; *The hold that beats the
delete button* demands that an open legal hold refuse a deletion outright; the
audit trail is evidence precisely because it cannot be revised after the fact.

**Ruling.** The ledger wins, and erasure is satisfied by pseudonymising the
reference rather than touching the row. A posted fact carries a person in
exactly two ways: a foreign key (`JournalLine.contactId`) and free text
(`AuditLog.data`, `InboundEmail.bodyText`/`fromName`/`fromAddress`,
`OutboxEvent.payload`). The key stays and resolves to a tombstone — the person
row is replaced by an erased-subject row so the ledger stays balanced,
attributable and unedited. The free text is what gets destroyed, because the
ledger's integrity does not depend on it. A legal hold outranks both: while a
hold is open even the free-text destruction stops, the request is answered
with a dated refusal naming the hold, and that refusal is itself written to
the audit trail. The clock resumes at release. What the engineer does when
both bite: ship a per-table disposition with exactly three values — cascade,
pseudonymise in place, retain under a named legal basis — and no erasure path
may issue an UPDATE against a table protected by an immutability trigger.

### 2. The branch that must act offline against approval before the act

**One side.** *Request or record*, *Four hours down, the counter stays open*
and *Which writes get the queue* say a fact that already happened is never
refused, and a branch with no uplink keeps trading.

**The other.** *The threshold nobody approves alone* says a document does not
leave draft until the band's approver has signed; *The status nobody checks*
says an order is refused when the customer is on credit hold; *A boolean is
not a lifecycle* says a PO is refused against an unapproved supplier.

**Ruling.** The classification decides, and it is fixed at design time. A
REQUEST may be blocked by an approval that has not happened; a RECORD may
never be. It follows that no approval gate may sit on a path a disconnected
branch has to complete — if it does, the classification was wrong or the gate
is in the wrong place. Where a feature genuinely needs both, the answer is
bounded offline authority, not deferred approval: a stated ceiling the device
may act within while disconnected (the shape the gift-card offline burn cap
already implies), the act queued as a fact, and anything above the ceiling
recorded as a variance that a named permission clears afterwards. The approval
then reviews a fact, it does not gate one. What the engineer does: write the
ceiling in the PR as a number. "It will sync and then be approved" is not a
design — either it commits at the till or it refuses at the till, and the PR
says which.

### 3. Dry run against the single writer

**One side.** *Dry run before live* requires the function that decides an
outcome to be pure: inputs as arguments, outcome returned, no `prisma.` write
and no `publish(` in its body, plus a second read-only caller that replays it
over history.

**The other.** The repository's strongest invariants are single-writer ones:
`AccountingService.postEntry()` is the only ledger writer,
`InventoryService.applyMovement()` the only quantity writer, and
`posting-rules.subscriber.ts` selects account codes inside the same method
that posts.

**Ruling.** Dry run wins on the decision; the single writer wins on the write.
They are not the same seam and the conflict only exists because today they are
in the same function. Every rule splits into `decide(inputs) -> outcome`, pure,
and `apply(outcome, tx)`, which is still the one writer. Simulation calls
`decide` only. Production calls `decide` then `apply`. Concretely: a feature
adding a posting rule puts account selection and amounts in a pure function
the subscriber calls, and the subscriber keeps the only `postEntry()` call in
the system. What the engineer does when both bite: a dry run that needs to
call the writer "with rollback" is not a dry run — an open transaction held
across a thirty-day replay is an outage, and the reviewer rejects it.

### 4. A scope column on every row against making the product look small

**One side.** *Whose rows, and which columns* and *Three silhouettes* demand
the tier-bearing column exist in the first migration, because added later it
leaves every existing row NULL and invisible.

**The other.** CLAUDE.md's third law says a first-time user must perceive a
small, obvious product, and the same lens set fails any screen that renders a
brand picker or an org drill-down when there is one entity. The repo's own
rule against speculative functionality points the same way.

**Ruling.** Schema is not UI, and the two lenses are only in conflict if the
column implies a control. The column ships in the first migration, NOT NULL,
defaulted to this deployment's own entity — the `MAIN` Location trick — so
Solo rows are correctly attributed and no nullable-scope invisibility trap is
ever created. The control ships only when a second row exists: the picker, the
chip row and the drill-down render on `count(entities) > 1`, never on a flag.
What the engineer does when both bite: a nullable scope column with no written
meaning fails both lenses at once, which is the actual failure mode to watch
for — it satisfies neither side while appearing to compromise between them.

### 5. More dimensions on every fact against what the feature costs

**One side.** *Every column or none*, *The movement with no address*, the
per-location reorder point and the per-location timezone all say the fact must
carry its dimension.

**The other.** *The cost that multiplies by location* and *The
hundred-thousandth row* say every dimension is an index, a wider row and a
wider aggregate, and that `applyMovement()` already pays an in-transaction SUM
over every location a variant is stocked at, on every unit sold.

**Ruling.** Dimensions on the fact are mandatory; synchronous aggregates over
the dimension are not, and must be earned. Write the column; do not write the
rollup. The thing to remove from `applyMovement()` is the cross-location SUM,
not the `locationId`. A feature may add a scope column freely and needs no
permission to do so. A feature may not add a second synchronous cross-location
aggregate without stating, as a number, what it reads at a hundred locations.
What the engineer does when both bite: the denormalised total becomes a
maintained counter or a read-time query, never a recompute inside the write
transaction.

### 6. Closing the leaver's shift against never fabricating a count

**One side.** *The grant that ends itself* demands the deactivation
transaction force-close any open `PosShift` the leaver holds, posting the same
closing `CashMovement` a normal `closeShift()` would — otherwise that
terminal's reconciled cash is permanently wrong.

**The other.** *Request or record* says a physical fact is never manufactured
by a system action, and the Z-report's over/short is only meaningful if a
person counted the drawer.

**Ruling.** Deactivation removes authority synchronously and never closes a
fact synchronously. In the same transaction: revoke refresh tokens, delete
`UserRoleAssignment` and `AdminScope` rows, reassign or escalate every pending
decision. Not in that transaction: the drawer. The shift moves to a named
state — abandoned — which requires a second person holding the cash-count
permission to close it against a physical count, and its over/short becomes a
variance row owned by that branch's manager. Force-closing to a computed
figure would write a count nobody performed, which is worse than an open
shift because it looks settled. What the engineer does when both bite: the
leaver's authority is gone within the transaction, the leaver's cash is a
queue item with an owner by the end of the shift.

### 7. Lists that open scoped against figures that must reconcile

**One side.** *Whose rows, and which columns* says a list opens narrowed to
the actor's own scope, unasked.

**The other.** *Click the number* says a figure's rows must add back up to it
and that two surfaces reporting the same fact must declare which is
authoritative — and scoping means two people legitimately see different totals
for the same tile.

**Ruling.** Scope wins over comparability, and the surface pays for it by
saying so on its face. Every scoped figure renders its scope in the same
element as the number — "3 of 11 branches" — and a figure that cannot state
its own scope may not be rendered at all. The unscoped group total is not a
default view; it lives behind a key that names it, and a board pack quoting a
number without its scope line is the failure this ruling exists to prevent.
What the engineer does when both bite: the drill-down from a scoped tile lands
on the same scoped list, and the two agree by construction because they are
one predicate.

### 8. Branch-created master data against the replication direction rule

**One side.** *The propose-up path that never opens* says
`BrandPolicy.allowBranchProductCreation` switches on a capability with nowhere
to record its result, and asks for the mechanism that carries a branch-created
product up to the brand.

**The other.** `replication.registry.ts` rejects FACT/DOWN and POLICY/UP
pairings by construction. A `Product` is policy. A policy row may not travel
up.

**Ruling.** The registry is not relaxed. A branch-created product does not
travel up as a `Product`; it travels up as a proposal, which is a fact — a
row the branch genuinely originated, carrying the proposed attributes — and
the brand's acceptance creates the `Product` at brand tier, which then
replicates DOWN as policy like every other product. The branch's own row is
resolved to accepted, rejected or merged, and the id it becomes is recorded on
it. What the engineer does when both bite: if a feature cannot express its
upward flow as a fact, it does not have an upward flow; it has a request for a
second, contradictory replication direction, and that is refused in
`DECISIONS.md` rather than special-cased in the registry.

### 9. Evidence-class audit against never blocking the sale

**One side.** *Authority and blast radius*, the control-and-testing lenses and
the read-logging lens all treat audit rows as evidence someone will be held
to.

**The other.** `AuditService.record()` is fire-and-forget by design — its own
comment says failures are logged and never thrown — so a dead write is a
silent evidence gap, and making it throw would let an audit-table problem stop
a sale.

**Ruling.** Two classes, named per call site. Operational audit stays
best-effort and never blocks the business: a status change, a login, a list
export. Evidence-class audit is written inside the same transaction as the act
it records, and its failure fails the act: the old and new value of a money or
permission change, a refusal caused by a legal hold, an approval above a
threshold, a read of a record behind a critical-sensitivity key. The class is
declared where the call is made, not inferred later. What the engineer does
when both bite: if an act cannot afford to fail on its audit write, it is not
evidence-class, and the PR says so in one sentence rather than claiming an
evidence trail it does not have.

### 10. A rule that differs by brand against the store that has no scope

**One side.** *Five doors, one hallway* says a per-deployment yes/no becomes a
`SettingKey` read with a shipped fallback, never an inline brand check.

**The other.** That same file's own grounding says `Setting` is one global
`{key, value}` row with no `retailBrandId` or `branchNodeId`, and *Authority
and blast radius* requires a rule to resolve BRANCH override → BRAND default →
ORG default.

**Ruling.** A rule that must differ by brand does not become a `Setting`
today. It becomes a real column on the entity that already owns brand-level
policy — `BrandPolicy` — or the request is declined. Scoping `Setting` is a
platform change with its own cache-invalidation problem, and a feature that
needs it either does that change as part of its own scope or picks another
door. The one thing forbidden outright is faking it: a composite key like
`brand.<id>.cod_fee` is a scope column in disguise, no query can filter on it,
and the 30-second per-process cache makes it worse. What the engineer does
when both bite: name the door in the PR, and if the honest answer is "none of
the five fit," that is a platform work item, not a clever key string.

---

## The cut list

Four lenses survived their own hardening pass and still do not earn a place
anywhere. They are recorded here rather than deleted silently, because the
reason matters more than the removal.

**The trigger `AuditLog` doesn't have** (`05-audit-evidence-hold.md`). A real
and correct gap: `AuditLog` is a plain table protected by a comment while
`JournalLine` has a database trigger. But as a lens its answer is identical on
every feature forever — "still no trigger" — and the artifact it demands is
one migration, written once, by whoever does it. It is work, not a question.
It is named as prerequisite work in conflict 9, where evidence-class audit
depends on it, and it belongs on the migration list rather than in a rule a
reader has to hold in their head on every feature.

**Permission with no explanation** (`31-enablement-onboarding.md`). Asks for
guidance text keyed to a permission so every surface renders the same string.
The demand is already governed: customer-facing and operator-facing copy lives
in translation files, one source per concern, by the repository's own
globalization rule. What is left after that rule is applied is the choice of
words, which is content work. It changes what a screen says, never what a
feature contains.

**Demo data has one persona** (`31-enablement-onboarding.md`). Asks each
feature to seed a sandbox dataset for the actor families that will use it.
Real, and worth doing once as an enablement project, but it does not change
the shape of the feature being scoped — the answer is always "add seed rows,"
and the part that genuinely bites, a trainee's practice sale posting a real
journal entry at an unlaunched branch, is owned by *The branch that cannot
trade tomorrow*, which already demands a `Location` state every reader
honours.

**The risk register with no register** (`35-risk-insurance-continuity.md`).
Asks where a risk entry lives, with an owner, a likelihood, an impact and a
next review date. Every honest answer is "nowhere, there is no `Risk` model,"
on every feature, because this is a request to build a governance module, not
a question that scopes anything else. It is a feature proposal wearing a
lens's clothes. Kept as a proposal in `35-risk-insurance-continuity.md`; not
kept as a lens.

---

## The catalogue

Everything below stays, one level down from CLAUDE.md, reachable when the
domain it belongs to is the domain being built. The headline lens each one
sits under is named where there is one, so a reader who arrives from the
headline knows what they are getting.

**Actors and access** — *Who may mint a role, and what a hundred of them
costs* (02, role inheritance); *Who read it, not just who wrote it* (05, read
logging); *The hold that beats the delete button* (05, legal hold — central to
conflict 1); *The column with no producer* (06, `costCentreId` has no event,
no rule and no roster field behind it); *The landing page assumes two roles*
(31); *The gate checked once, not per action* (21); *The registry only one
surface has* (21).

**Money and documents** — *Tax point is not the GL date* (08); *Reconciliation
with nothing to reconcile against* (09, bank statement lines); *Transfer price
fixed at cost* (10); *The price that wins* (11, absorbing 19's per-partner
price); *The till has no floor* (11, absorbing 24's override record); *The
receipt that doesn't find its bill* (12); *The status nobody checks* (12,
credit hold); *The bill nobody checked* (13, three-way match); *A boolean is
not a lifecycle* (13, supplier states and expiring documents); *The royalty
has no revenue to read* (19); *The other end, and what nets it out* (WO-22,
intercompany elimination); *A correction is indistinguishable from a refund*
(27, restatement classification); *The crosswalk that doesn't exist* (27,
legacy ids); *The regulator's own boxes* (34, account-to-filing mapping);
*Click the number* (WO-22); *The file outlives the app* (WO-22).

**Stock and the floor** — *The reorder point has no address* (14); *Not enough
to go around* (14, allocation of scarce supply); *A forecast is not a
commitment* (14, lead-time distribution); *Bins are not built, locations are
the floor* (15); *The handoff that has no signer* (15, absorbing 37's device
custody); *Shortage with no reason, no evidence* (15, absorbing 16's scrap and
35's claim pack); *Carried, not just in stock* (17, ranging); *No such thing as
a store grade* (17); *The new store's first delivery* (17); *Custody without
ownership* (19, absorbing 16's subcontracted cloth); *Every unit, not the whole
SKU* (34, lot traceability); *The claim, not the supplier* (34, per-shipment
origin); *The insured value nobody can total* (35); *The branch that cannot
trade tomorrow* (35, absorbing 31's go-live state and 37's downtime query);
*The cost that multiplies by location* (29).

**Master data and findability** — *The propose-up path that never opens* (18 —
see conflict 8); *The exact-string gate* (18, near-duplicate products); *One
column, one unit, forever* (18, unit of measure); *The view nobody can name
back* (22, saved views); *The selection that outlives the page* (22); *The 21st
row* (22, capped versus uncapped search).

**Customers and consent** — *Consent is a matrix, not a switch* (23); *The
complaint that isn't a record* (20, `ServiceCase`); *One case ID, or five
unrelated tables* (20); *The retention clock with no dial* (25); *Audience is a
capability, not an address* (WO-22); *Delivery is a fact, not a hope* (WO-22);
*The recipient's daily total* (WO-22).

**Platform and day two** — *Five doors, one hallway* (28, absorbing *The field
with no home*); *Which tier owns the credential* (WO-22); *The switch, its
scope, and who may throw it* (WO-22); *The number that pages, and the number
that doesn't* (26); *The stale clock nobody reads* (26); *Quota has no owner*
(32); *Narrate, never post* (32); *The control has no name, only the fact does*
(36); *Testing is a record, not a query* (36); *One clock, a hundred branches*
(30, per-location timezone); *The day with no name* (30, business day); *The
adoption test* (WO-22, node-safe uniqueness); *The weaker writer* (WO-22);
*Row 4,312's authority* (WO-22); *The 14:02 undo* (WO-22); *The busiest
minute, and the lock you hold through it* (WO-22, absorbing 29's unchunked
write); *The barcode that already decided* (33); *Which writes get the queue*
(33).
