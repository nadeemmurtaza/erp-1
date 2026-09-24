# Cluster

Output of the `cluster` agent (Cluster phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Headline

### 1. The actor

**Rationale:** Answered first, because everything after it is a property of somebody. Three lenses: which table a new actor becomes, whether a non-User principal can be permission-checked at all, and what ends an access grant without a human remembering. Drawn from identity, roles, approval-delegation, workforce and the omnichannel/automation sets, so no single domain owns the group.

**Lenses:**

#### The actor with three tables

**Question:** For every new kind of actor or counterparty this feature touches, name which existing table it becomes — User (login, permission-checked), Party, Contact, TradingPartner, or one of the three key-hash principals — and, where one real party is two of them at once, the column that links the rows.

**Source File:** docs/erp-lenses/identity-actor-types/01-identity-actor-types.md

**Merge Note:** Absorbs 'One customer, two ledgers' (12-credit-receivables.md): the same missing link between Contact and TradingPartner, where the consequence is a buyer's exposure showing as two disagreeing balances. The canonical now asks for the link column for counterparties, not only for logins.

#### The principal with no permission key

**Question:** For every actor here that is not a User, name the PERMISSION_CATALOG keys it can be checked against, or name the code path that authenticates it instead of PermissionsGuard — and state what bounds what it may do and which rows it may read.

**Source File:** docs/erp-lenses/identity-actor-types/01-identity-actor-types.md

**Merge Note:** Absorbs 'The actor with no role' (02), 'The principal with no permission to check' (21, adds that JwtStrategy.validate is the only path into the resolver so a @RequirePermission on a partner route is either a blanket 403 or an accident), 'The machine caller's own scope' (32, adds that a minted machine credential carries an explicit PermissionKey subset and its issue is audited like a role grant), and 'The portal has no read scope' (19, adds the row half: getLiveStock() checks only partner.kind, so every CUSTOMER-kind partner reads the whole catalogue).

#### The grant that ends itself

**Question:** For every grant this feature creates — role assignment, permission override, admin scope, acting cover, a time-boxed auditor — name what ends it without a human remembering; and name every row keyed to that userId that must change in the same transaction the day the person is deactivated, including any decision still assigned to them.

**Source File:** docs/erp-lenses/roles-ranks-orgchart/02-roles-ranks-orgchart.md

**Merge Note:** Absorbs 'The access with no end date' (01, the externally-sourced time-boxed actor), 'Acting cover has no clock' (04, adds the startsAt/endsAt delegation row the resolver unions in only inside its window), 'The leaver keeps the keys' (06, adds that the deactivation transaction touches only User.isActive and RefreshToken), and 'The approval orphaned by a leaver' (04, adds that a pending decision must be reassigned in that same transaction).

### 2. The authority

**Rationale:** What bounds the act, in four directions: which rows and columns the actor may see, how much they may commit alone, which two capabilities must never sit in one grant, and who may change the rule itself. This is where the repo is weakest — a flat OR over 50 keys with no ceiling, no conflict matrix and no scope on Setting — so every lens here fires on nearly every feature.

**Lenses:**

#### Whose rows, and which columns

**Question:** For every row this feature writes, which entity does it name — organization, brand, branch node, Location, terminal? For every list, export, schedule and drill-down it adds, name the signed-in actor who must get back fewer rows and fewer columns than a super admin, and the exact rows and fields they must never see. Name the column that carries that scope, given AdminScope.branchNodeId points at Node and Node has no rows in a single-database deployment.

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

**Merge Note:** Canonical is WO-22's 'Name the owner, name the reader it refuses'. Absorbs WO-22's 'Whose rows?' (the export, schedule and drill-down must apply the same filter and mask as the screen), 'The default is a scope, not a filter' (22, the narrowing is the list's opening state, not an optional filter), 'Opt-in cost redaction' (10, the column half: cost-fields.ts strippers are opt-in and InventoryController.list() does not call them), and 'Branch means database, not location' (06, the fact that makes the answer negative today: branchNodeId is an FK into Node, which names a child deployment, not one of 100+ Locations).

#### The threshold nobody approves alone

**Question:** For each action here that commits money or stock at a value, name the amount bands, the role each band requires, the quorum on the top band, and the service method where the check runs before the row leaves its draft state — then the same four answers for the undo, which is never the same authority as the do.

**Source File:** docs/erp-lenses/approval-delegation/04-approval-delegation.md

**Merge Note:** Absorbs 'Rank is a ceiling, not a location' (02, AdminScopeLevel answers where, never how much), 'Five commitments, one key' (13, the five purchasing moments behind one purchasing.manage grant), the ceiling half of 'Compensation authority is a boolean, not a ceiling' (20), and the value-band, time-window and reverse-your-own clauses of WO-22's 'Who may unmake it, how large, how late, and whose'.

#### The toxic pair, caught at grant or at act

**Question:** Name the permission-key pair this feature makes toxic together, and state which single enforcement point exists for it — a refusal in RolesService.create/.update at role-save time, or a throw at act time comparing the actor to a stored id — and where in the diff it lives.

**Source File:** docs/erp-lenses/segregation-of-duties/03-segregation-of-duties.md

**Merge Note:** Merges 03's first two lenses, which are one question split in half. Absorbs 'Who counts the drawer they held' (03, the worked instance: closeShift never compares closedByUserId to openedByUserId) and 'The auditor's key is not a master key' (36, the same question where one side of the pair is audit.view and the other is the operational key over what it audits).

#### Authority and blast radius

**Question:** Which roles may change this rule, at which of the three scopes, does the change need a second signature, what is the worst value one of them can set before anything notices — and where is the audit row carrying the old value, the new value, the scope, the actor and the reason?

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

**Merge Note:** Absorbs 'The number the auditor cannot see' (11), which supplies the sharpest live instance of the missing audit row: product-admin.service.ts logs { changed: Object.keys(dto) } — field names with no values — while the old and new price exist only inside a fire-and-forget domain event.

### 3. The act in the world

**Rationale:** The write as a physical event. Three lenses that decide whether a fact may be refused at all, which of a hundred locations it happened at, and what staff do for the four hours the system is down. Placed before the money because in this codebase the stock moves and the posting rule follows.

**Lenses:**

#### Request or record — classify every write

**Question:** For each write this feature performs, is it a request the system may refuse, or a record of something that already happened in the physical world and therefore may never be refused? For every record, name the unconditional write path, the variance row a would-be refusal produces instead, the queue it lands in, who may clear it, and how the books stay balanced.

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

**Merge Note:** Absorbs 'A fact that already happened is never rejected' (WO-22 integrations — adds the inbound-message case and its one sanctioned exception: an authenticity failure is refused with no write, everything past the signature check is a fact) and 'The overshort that vanishes' (09 — cash has no StockVariance: zReport() computes overShortMinor and writes it nowhere).

#### The movement with no address

**Question:** For every stock or cash write this feature makes, name the locationId it carries and where that value comes from. If the answer is InventoryService.defaultLocationId(), name which one of the 100+ locations that silently is, and what the branch that actually moved the goods sees on its own shelf count.

**Source File:** docs/erp-lenses/fraud-insider-risk/24-fraud-insider-risk.md

**Merge Note:** Canonical is 24's 'The write-off with no address', widened from the admin adjust endpoint to every silent defaultLocationId() call site — the eight the ground brief lists, plus StockCount having no locationId and a goods receipt landing at MAIN.

#### Four hours down, the counter stays open

**Question:** This feature is unavailable for four hours in the middle of trading. Name every actor who was mid-task, what they do instead, the surface that ingests the work they did by hand, the permission that guards it, and the reconciliation that proves no fact was counted twice.

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

**Merge Note:** Kept intact. Its device-side complement, 'Which writes get the queue' (33), sits under it in the catalogue: that one asks which client actions the till itself protects against its own disconnection.

### 4. The money

**Rationale:** What the act does to the books, and the rule that computes the number. Five lenses: the posting rule, the dimensions on its lines, the period it lands in, the second legal entity, and whether the deciding function can be replayed without writing. Drawn from the GL, costing, treasury, tax, time and policy sets.

**Lenses:**

#### The unwritten posting rule

**Question:** Write the exact posting rule this feature triggers: the domain event, the Dr/Cr account codes — naming any account the thirteen-account chart does not have — and the findPostedEntry(source, sourceRef) idempotency key. Or state it never reaches the ledger and name the report that reconciles it instead. If the fact is not event-shaped, name the door it uses, because postEntry() has none.

**Source File:** docs/erp-lenses/money-integrity-gl/07-money-integrity-gl.md

**Merge Note:** Absorbs 'The liability with no account' (23, adds that the account itself may not exist in the thirteen-row chart), 'The ledger has no door for opening balances' (27, adds that postEntry()'s only callers are seven event handlers and year-end close, so a non-event fact has no entry point at all), and 'The register the ledger never sees' (37, capex and depreciation as a second instance of missing account plus missing rule).

#### Every column or none

**Question:** For every JournalLine this feature creates, name which of organizationId / retailBrandId / branchNodeId / costCentreId / counterpartyBrandId it sets and to what value, or declare the line intentionally undimensioned and name the report that may therefore blend it across brands.

**Source File:** docs/erp-lenses/money-integrity-gl/07-money-integrity-gl.md

**Merge Note:** Absorbs 'The ledger's five unfilled columns' (10, the same question over all five columns, adding that costCentreId has no backing model so it must be wired or removed) and 'One ledger line for every drawer and every bank' (09, adding that the dimension problem is not only on the line — account 1000 is one row for every drawer and every bank account).

#### The period that already moved

**Question:** State what happens when this feature posts a fact whose own date falls in a CLOSED or LOCKED FiscalPeriod: does it silently land in whatever period is open today, and which report surfaces the entries whose date sits outside their own period's range?

**Source File:** docs/erp-lenses/money-integrity-gl/07-money-integrity-gl.md

**Merge Note:** Absorbs the closed-period clause of WO-22's 'Who may unmake it, how large, how late, and whose', which contributes the fact that the repo already holds two opposite answers: reverseEntry() reroutes to today's open period, recordCashMovement() throws.

#### The second legal entity

**Question:** Name what breaks the day a second RetailBrand in a second country goes live: the field holding its tax label, registration number and currency; the counter key keeping its Invoice/JournalEntry series independent and gapless; and the column that lets its fiscal period close while the other brand's stays open.

**Source File:** docs/erp-lenses/tax-jurisdiction-invoice/08-tax-jurisdiction-invoice.md

**Merge Note:** Merges 08's 'One tax regime, many legal entities' with 'Number series, one legal entity at a time' (a shared counter reads to a tax authority as suppressed sales) and 'The calendar every brand shares' (30, FiscalPeriod has no brand column, so one brand's close locks every other brand's books). Distinct from the catalogue's 'The adoption test', which is about node collisions on merge, not legal-entity separation in one database.

#### Dry run before live

**Question:** Before this rule is switched on, can someone replay it over last month's real records and read the diff with nothing written? The function that decides the outcome takes its inputs as arguments and returns the outcome, with no prisma. write and no publish( in its body, and a second, read-only caller exists.

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

**Merge Note:** Kept intact, and sits in this group because the repo's worst instance of evaluation-inside-the-write-path is posting-rules.subscriber.ts picking account codes as it posts. See conflict 3 for how it coexists with the single-writer invariant.

### 5. The scale

**Rationale:** What the same code costs at three editions, a hundred branches and a hundred thousand rows — and what happens when one write arrives twice. Four lenses, each of which can only be answered before the first migration, because each is a column, an index or a boundary that cannot be retrofitted once a client is live.

**Lenses:**

#### Three silhouettes, and the day the tier above appears

**Question:** Draw this capability three times — one shop, forty-branch chain, group of brands. Which tier-bearing columns must be in its first migration while never rendering on the Solo screen, and what happens to every row it already wrote the day a second entity appears above it?

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

**Merge Note:** Absorbs 'The edition above and the day it appears' (WO-22 topology), which adds the nullable-scope trap: retailBrandId: { in: [...] } never matches NULL, so history written before the tier existed goes invisible the instant it is switched on, and the written meaning of null is part of the feature.

#### The absent collaborator

**Question:** List every module this capability reads from, writes to or emits toward that is off by default. For each: absent, what fact is still recorded, what is silently not recorded, what does the user see instead of the control — and is it reached through a domain event or extension point, or through a direct import in KNOWN_MODULE_COUPLINGS that fails at Nest boot rather than degrading?

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

**Merge Note:** Absorbs 'The refusal that isn't graceful' (28), which adds the distinction that decides the answer: an extension point no-ops when its module is off, a direct coupling fails module resolution at boot, so a client's 'just turn that module off' reaches production as a deploy that will not start.

#### The second copy of the write

**Question:** Name the two moments this write arrives twice — the retried HTTP call, the redelivered outbox event, the till replaying a queued sale whose first attempt timed out with no answer — and name the column, with its unique constraint, that makes the second arrival a no-op. Then name what the loser of a simultaneous write sees on screen.

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

**Merge Note:** Absorbs 'The tap that might have already landed' (33), which adds the arrival moment the original list missed — a device replaying its own write after a client-side timeout, through an outbox carrying no request-level key, into a placeFromPos() with no idempotency check.

#### The hundred-thousandth row

**Question:** State the row count this feature's largest table reaches at corporate edition, the SQL statements one page issues at that size, how many the database serves from an index — and for any figure a user can refresh, which of the columns its query filters and groups on is indexed today.

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

**Merge Note:** Absorbs 'The report that recomputes from scratch' (29), which adds the index half with a named instance: balancesAsOf() filters on JournalEntry.date, which has no index, across a near-total POSTED set, with no report cache anywhere.

### 6. The afterlife

**Rationale:** What happens to the fact once it exists: undoing part of it, explaining its numbers a year later, erasing the person from it, and finding it when it failed. Five lenses. This group is last because it is the one a narrow build always postpones, and the only one whose omissions cannot be repaired after the rows exist.

**Lenses:**

#### The reversal document, not the reversal flag

**Question:** For every forward fact this feature writes, name the reverse document that undoes it — its entity, its number series, its quantity or amount field, and its foreign key back to the specific original line — and show it can be issued for part of the original, more than once, until the original is exhausted.

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

**Merge Note:** Absorbs 'The credit note is a filed document, not a status flip' (08, where the reverse document is itself a filing it needs its own gapless series and must move output tax) and the ledger half of 'Compensation authority is a boolean, not a ceiling' (20, a partial Payment.refundAmount today still triggers a full reverseEntry()).

#### The undo fan-out

**Question:** Enumerate every side effect the forward path fires and, for each, state which of three it is: reverses automatically (name the method), needs a human (name the screen and the permission), or is deliberately irreversible (one sentence why).

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

**Merge Note:** Absorbs 'The void that outruns the refund' (24): changeStatus() reaches CANCELLED from three post-payment statuses without reading Payment.status or reversing the posted entry — an uncovered fan-out of exactly the shape this lens enumerates.

#### The version stamp

**Question:** When someone edits this rule next quarter, what happens to every record already created under the old one, and can anyone still explain the number on it from the record's own stored fields plus the policy version it names?

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

**Merge Note:** Kept intact. TaxRate's effectiveAt/endedAt is the only rule in the schema that already answers it; every other rule is read live from a flat Setting row behind a 30-second cache.

#### The erasure the ledger cannot obey

**Question:** When an erasure request reaches this person, name every table still holding their identifying data once the User row is gone — JournalLine.contactId under its immutability trigger, AuditLog.data, InboundEmail.bodyText, OutboxEvent.payload, any ReplicationRecord already pushed to a parent database — and give each a disposition: cascade, pseudonymise in place, or retain under a named legal basis.

**Source File:** docs/erp-lenses/privacy-retention-residency/25-privacy-retention-residency.md

**Merge Note:** Merges 25's 'The row the ledger will not let you touch' with 'The request the ledger cannot obey' (23, which contributes the per-table disposition table as the deliverable) and 'The payload that already left' (25, which contributes the copies outside the row: an OutboxEvent nothing deletes and a ReplicationRecord already in a parent database in another jurisdiction).

#### The failure path, and who is allowed to walk it

**Question:** When this feature's call or event fails for the last time, which durable store does it land in with its payload, which screen lists it, which permission opens that screen, which action replays it, and what makes replaying it twice safe?

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

**Merge Note:** Absorbs 'The operator's second door' (26), which names the concrete artifact: an ADMIN_NAV entry gated by a real PERMISSION_CATALOG key, because nav-registry.ts has no operations group and OutboxEvent, the replication tables and AuditLog have zero admin routes.

## Duplicates

### The actor with three tables (01-identity-actor-types.md)

**Absorbed:**

- One customer, two ledgers (12-credit-receivables.md) — same shape between Contact and TradingPartner; contributes the counterparty case and the unmeasurable credit exposure

### The principal with no permission key (01-identity-actor-types.md)

**Absorbed:**

- The actor with no role (02-roles-ranks-orgchart.md) — same question from the role side
- The principal with no permission to check (21-omnichannel-parity.md) — contributes that JwtStrategy.validate is the only path into the resolver
- The machine caller's own scope (32-automation-and-ai-surface.md) — contributes the explicit PermissionKey subset on a minted machine credential
- The portal has no read scope (19-channels-franchise-wholesale.md) — contributes the row half: kind is the only read scope a partner has

### The grant that ends itself (02-roles-ranks-orgchart.md)

**Absorbed:**

- The access with no end date (01-identity-actor-types.md) — the time-boxed external actor
- Acting cover has no clock (04-approval-delegation.md) — the startsAt/endsAt delegation row
- The leaver keeps the keys (06-workforce-shifts-jml.md) — the deactivation transaction's missing rows
- The approval orphaned by a leaver (04-approval-delegation.md) — reassigning a pending decision in that same transaction

### Whose rows, and which columns (WO-22: Name the owner, name the reader it refuses)

**Absorbed:**

- Whose rows? (WO-22 reporting) — exports, schedules and drill-downs apply the same filter and mask
- The default is a scope, not a filter (22-findability-at-scale.md) — the narrowing is the opening state, not an optional filter
- Opt-in cost redaction (10-costing-transfer-pricing.md) — the column mask, and the strippers no call site is forced to use
- Branch means database, not location (06-workforce-shifts-jml.md) — AdminScope.branchNodeId names a child deployment, not one of 100+ Locations

### The threshold nobody approves alone (04-approval-delegation.md)

**Absorbed:**

- Rank is a ceiling, not a location (02-roles-ranks-orgchart.md)
- Five commitments, one key (13-procurement-supplier-lifecycle.md)
- Compensation authority is a boolean, not a ceiling (20-service-cases-sla.md) — ceiling half only; its ledger half went to The reversal document
- Who may unmake it, how large, how late, and whose (WO-22) — value band, time window, reverse-your-own; its closed-period half went to The period that already moved

### The toxic pair, caught at grant or at act (03-segregation-of-duties.md)

**Absorbed:**

- Detected at grant or at act (03-segregation-of-duties.md) — the same question's second half
- Who counts the drawer they held (03-segregation-of-duties.md) — the worked instance on PosShift
- The auditor's key is not a master key (36-internal-audit-controls-testing.md) — the same pair where one side is audit.view

### Authority and blast radius (WO-22)

**Absorbed:**

- The number the auditor cannot see (11-pricing-discount-governance.md) — the audit row must carry old value, new value and actor, not a list of changed field names

### Request or record — classify every write (WO-22)

**Absorbed:**

- A fact that already happened is never rejected (WO-22 integrations) — the inbound-message case and the authenticity exception
- The overshort that vanishes (09-treasury-cash-reconciliation.md) — the missing cash variance row

### The unwritten posting rule (07-money-integrity-gl.md)

**Absorbed:**

- The liability with no account (23-loyalty-consent-data-rights.md) — the account may not exist in the thirteen-row chart
- The ledger has no door for opening balances (27-migration-cutover-restatement.md) — a fact that is not event-shaped has no entry point
- The register the ledger never sees (37-assets-facilities-maintenance.md) — capex and depreciation as the same gap

### Every column or none (07-money-integrity-gl.md)

**Absorbed:**

- The ledger's five unfilled columns (10-costing-transfer-pricing.md) — all five columns, and costCentreId has no backing model
- One ledger line for every drawer and every bank (09-treasury-cash-reconciliation.md) — account 1000 is one row for every drawer and bank account

### The period that already moved (07-money-integrity-gl.md)

**Absorbed:**

- Who may unmake it … (WO-22) — closed-period clause; the repo holds two opposite answers today

### The second legal entity (08-tax-jurisdiction-invoice.md)

**Absorbed:**

- Number series, one legal entity at a time (08-tax-jurisdiction-invoice.md)
- The calendar every brand shares (30-time-periods-backdating.md) — FiscalPeriod has no brand column

### Three silhouettes, and the day the tier above appears (WO-22)

**Absorbed:**

- The edition above and the day it appears (WO-22 topology) — the nullable-scope column that goes invisible when the tier is switched on

### The absent collaborator (WO-22)

**Absorbed:**

- The refusal that isn't graceful (28-extensibility-without-fork.md) — extension point no-ops versus direct coupling that fails at boot

### The second copy of the write (WO-22)

**Absorbed:**

- The tap that might have already landed (33-operator-hands.md) — a device replaying its own unconfirmed write

### The hundred-thousandth row (WO-22)

**Absorbed:**

- The report that recomputes from scratch (29-cost-to-serve.md) — the unindexed JournalEntry.date behind every trial balance

### The reversal document, not the reversal flag (WO-22)

**Absorbed:**

- The credit note is a filed document, not a status flip (08-tax-jurisdiction-invoice.md) — the reverse document as a tax filing with its own series
- Compensation authority is a boolean, not a ceiling (20-service-cases-sla.md), ledger half — a partial refund still triggers a full reverseEntry()

### The undo fan-out (WO-22)

**Absorbed:**

- The void that outruns the refund (24-fraud-insider-risk.md) — CANCELLED after payment posts, with no reversal

### The erasure the ledger cannot obey (25-privacy-retention-residency.md)

**Absorbed:**

- The request the ledger cannot obey (23-loyalty-consent-data-rights.md) — the per-table disposition table
- The payload that already left (25-privacy-retention-residency.md) — OutboxEvent and ReplicationRecord copies, possibly in another jurisdiction

### The failure path, and who is allowed to walk it (WO-22)

**Absorbed:**

- The operator's second door (26-day-two-operations.md) — an ADMIN_NAV entry gated by a real permission key

### The price that wins (11-pricing-discount-governance.md) — catalogue

**Absorbed:**

- One price, however many doors (19-channels-franchise-wholesale.md) — the resolution order must carry counterparty as well as location and channel

### The till has no floor (11-pricing-discount-governance.md) — catalogue

**Absorbed:**

- The price nobody can point to (24-fraud-insider-risk.md) — the same key, ceiling and preserved-original-price column

### Custody without ownership (19-channels-franchise-wholesale.md) — catalogue

**Absorbed:**

- The cloth that leaves the building (16-production-bom-subcontract.md) — subcontracted stock is the same question as consignment stock

### The handoff that has no signer (15-warehouse-logistics-fleet.md) — catalogue

**Absorbed:**

- Custody has no holder (37-assets-facilities-maintenance.md) — a carton and a card-handling device need the same row

### Shortage with no reason, no evidence (15-warehouse-logistics-fleet.md) — catalogue

**Absorbed:**

- The scrap that has no reason code (16-production-bom-subcontract.md)
- The claim's evidence pack, not just the claim (35-risk-insurance-continuity.md) — the claim record and the missing attachment model

### The branch that cannot trade tomorrow (35-risk-insurance-continuity.md) — catalogue

**Absorbed:**

- Going live has no state (31-enablement-onboarding.md) — the same missing Location state at the other end of a branch's life
- Downtime that outranks the sale (37-assets-facilities-maintenance.md) — the query listing which locations are degraded now

### Five doors, one hallway (28-extensibility-without-fork.md) — catalogue

**Absorbed:**

- The field with no home (28-extensibility-without-fork.md) — a subset of the same five doors

### The busiest minute, and the lock you hold through it (WO-22) — catalogue

**Absorbed:**

- The write that doesn't chunk (29-cost-to-serve.md) — supplies the instance: StockCountService.start() inserts one row per active variant in one unbounded transaction

## Conflicts

### Immutable evidence against the right to erasure. The privacy lenses demand a person's identifiers be removed from every table on request; journal_line_immutable and forbid_journal_entry_mutation() forbid touching a posted line forever, and the legal-hold lens demands a deletion be refused outright while a case is open.

**Sides:**

- The erasure the ledger cannot obey (25/23) and The retention clock with no dial (25)
- The hold that beats the delete button (05), the accounting immutability triggers, and the append-only audit trail

**Ruling:** The ledger wins; erasure is satisfied by pseudonymising the reference, not by touching the row. A posted fact carries a person two ways: a foreign key (JournalLine.contactId) and free text (AuditLog.data, InboundEmail.bodyText/fromName/fromAddress, OutboxEvent.payload). The key stays and resolves to a tombstone — the person row is replaced by an erased-subject row, so the ledger stays balanced, attributable and unedited. The free text is what gets destroyed, because the ledger's integrity does not depend on it. A legal hold outranks both: while a hold is open even that destruction stops, the request is answered with a dated refusal naming the hold, and the refusal is itself written to the audit trail; the clock resumes at release. When both bite, the engineer ships a per-table disposition with exactly three values — cascade, pseudonymise in place, retain under a named legal basis — and no erasure path may issue an UPDATE against a table protected by an immutability trigger.

### A branch that must keep trading offline against an approval that must happen before the act. One set of lenses says a fact that already happened is never refused; another says a document does not leave draft until its band's approver signs, an order is refused on credit hold, and a PO is refused against an unapproved supplier.

**Sides:**

- Request or record — classify every write (WO-22), Four hours down, the counter stays open (WO-22), Which writes get the queue (33)
- The threshold nobody approves alone (04), The status nobody checks (12), A boolean is not a lifecycle (13)

**Ruling:** The classification decides, and it is fixed at design time, not at runtime. A REQUEST may be blocked by an approval that has not happened; a RECORD may never be. It follows that no approval gate may sit on a path a disconnected branch has to complete — if one does, either the classification was wrong or the gate is in the wrong place. Where a feature genuinely needs both, the answer is bounded offline authority, never deferred approval: a stated ceiling the device may act within while disconnected, the act queued as a fact, and anything above the ceiling recorded as a variance a named permission clears afterwards — the approval then reviews a fact rather than gating one. When both bite, the engineer writes the ceiling in the PR as a number; 'it will sync and then be approved' is not a design, because either it commits at the till or it refuses at the till, and the PR must say which.

### Dry run against the single writer. Simulation requires the deciding function to be pure and callable a second time over history; the repo's strongest invariants are that AccountingService.postEntry() is the only ledger writer and InventoryService.applyMovement() the only quantity writer, and today posting-rules.subscriber.ts selects account codes inside the same method that posts.

**Sides:**

- Dry run before live (WO-22)
- The unwritten posting rule (07) and the single-writer invariants it rests on

**Ruling:** Dry run wins on the decision; the single writer wins on the write. They conflict only because today they share one function. Every rule splits into decide(inputs) -> outcome, pure, and apply(outcome, tx), which remains the one writer: simulation calls decide only, production calls decide then apply. Concretely, a feature adding a posting rule puts account selection and amounts in a pure function the subscriber calls, and the subscriber keeps the only postEntry() call in the system. When both bite, a dry run that needs to call the writer 'with rollback' is not a dry run — an open transaction held across a thirty-day replay is an outage, and the reviewer rejects it.

### A scope column on every row against making the product look small. The scale lenses require the tier-bearing column in the first migration; the seven laws require a first-time user to perceive a small product, and the same lens set fails any screen that renders a brand picker when there is one entity.

**Sides:**

- Whose rows, and which columns (WO-22/22/10/06) and Three silhouettes (WO-22)
- CLAUDE.md law 3, plus the no-speculative-functionality rule behind The field with no home (28)

**Ruling:** Schema is not UI, and the conflict only exists if the column implies a control. The column ships in the first migration, NOT NULL, defaulted to this deployment's own entity — the MAIN Location trick — so Solo rows are correctly attributed and no nullable-scope invisibility trap is created. The control ships only when a second row exists: picker, chip row and drill-down render on count(entities) > 1, never on a flag or an edition check. When both bite, note that the compromise position — a nullable scope column with no written meaning — fails both lenses at once, which is exactly the failure to watch for.

### More dimensions on every fact against what the feature costs at a hundred locations. One set of lenses demands the fact carry its brand, branch, location and cost centre; another shows that applyMovement() already pays an in-transaction SUM across every location a variant is stocked at, on every unit sold.

**Sides:**

- Every column or none (07/10/09), The movement with no address (24), the per-location reorder point (14) and per-location timezone (30)
- The cost that multiplies by location (29) and The hundred-thousandth row (WO-22/29)

**Ruling:** Dimensions on the fact are mandatory; synchronous aggregates over the dimension are not, and must be earned. Write the column; do not write the rollup. The thing to remove from applyMovement() is the cross-location SUM, not the locationId. A feature may add a scope column freely and needs no argument to do so; a feature may not add a second synchronous cross-location aggregate without stating, as a number, what it reads at a hundred locations. When both bite, the denormalised total becomes a maintained counter or a read-time query, never a recompute inside the write transaction.

### Closing the leaver's shift against never fabricating a count. The joiner-mover-leaver lens wants the deactivation transaction to force-close any open PosShift and post the closing CashMovement a normal close would; the request-or-record lens says a physical fact is never manufactured by a system action.

**Sides:**

- The grant that ends itself (02/06/04)
- Request or record — classify every write (WO-22)

**Ruling:** Deactivation removes authority synchronously and never closes a fact synchronously. In the same transaction: revoke refresh tokens, delete UserRoleAssignment and AdminScope rows, reassign or escalate every pending decision. Not in that transaction: the drawer. The shift moves to a named abandoned state that requires a second person holding the cash-count permission to close it against a physical count, and its over/short becomes a variance row owned by that branch's manager. Force-closing to a computed figure writes a count nobody performed, which is worse than an open shift because it looks settled. When both bite, the leaver's authority is gone within the transaction and the leaver's cash is a queue item with a named owner by the end of the shift.

### Lists that open scoped against figures that must reconcile. Scoping means two people legitimately see different totals for the same tile, which is exactly what the drill-down lens exists to prevent.

**Sides:**

- Whose rows, and which columns (WO-22/22)
- Click the number (WO-22) and the consolidation/elimination lens

**Ruling:** Scope wins over comparability, and the surface pays for it by saying so on its face. Every scoped figure renders its scope in the same element as the number — '3 of 11 branches' — and a figure that cannot state its own scope may not be rendered. The unscoped group total is not a default view; it lives behind a key that names it. When both bite, the drill-down from a scoped tile lands on the same scoped list, so the two agree by construction because they are one predicate.

### Branch-created master data must travel up for approval, but replication.registry.ts rejects POLICY/UP pairings by construction and a Product is policy.

**Sides:**

- The propose-up path that never opens (18)
- The replication registry's FACT-up / POLICY-down rule

**Ruling:** The registry is not relaxed. A branch-created product does not travel up as a Product; it travels up as a proposal, which is a fact the branch genuinely originated, carrying the proposed attributes. The brand's acceptance creates the Product at brand tier, which replicates DOWN as policy like every other product, and the branch's proposal row is resolved to accepted, rejected or merged with the resulting id recorded on it. When both bite: if a feature cannot express its upward flow as a fact, it does not have an upward flow — it has a request for a second, contradictory replication direction, and that is refused in DECISIONS.md rather than special-cased in the registry.

### Evidence-class audit against never blocking the sale. Several lenses treat audit rows as evidence someone will be held to; AuditService.record() is fire-and-forget by design, so a dead write is a silent evidence gap, and making it throw would let an audit-table problem stop a sale.

**Sides:**

- Authority and blast radius (WO-22/11), Who read it, not just who wrote it (05), The control has no name, only the fact does (36)
- AuditService's stated design: failures are logged, never thrown

**Ruling:** Two classes, declared per call site. Operational audit stays best-effort and never blocks the business — a status change, a login, a list export. Evidence-class audit is written inside the same transaction as the act and its failure fails the act: the old and new value of a money or permission change, a refusal caused by a legal hold, an approval above a threshold, a read of a record behind a critical-sensitivity key. The class is named where the call is made, not inferred later, and evidence-class audit presupposes the AuditLog immutability migration named in the cut list. When both bite: if an act cannot afford to fail on its audit write, it is not evidence-class, and the PR says so in one sentence instead of claiming a trail it does not have.

### A rule that differs by brand wants to be a Setting, but Setting is one global key/value row with no brand or branch column, while the authority lens requires a BRANCH override to beat a BRAND default to beat an ORG default.

**Sides:**

- Five doors, one hallway (28) — a per-deployment yes/no becomes a SettingKey, never an inline brand check
- Authority and blast radius (WO-22) and Setting's own shape in core.prisma

**Ruling:** A rule that must differ by brand does not become a Setting today. It becomes a real column on the entity that already owns brand-level policy — BrandPolicy — or the request is declined. Scoping Setting is a platform change with its own cache-invalidation problem, and a feature that needs it either does that change inside its own scope or picks another door. Forbidden outright is faking it: a composite key like brand.<id>.cod_fee is a scope column in disguise, no query can filter on it, and the 30-second per-process cache makes it worse. When both bite, name the door in the PR; if the honest answer is that none of the five fit, that is a platform work item, not a clever key string.

## Cuts

- The trigger AuditLog doesn't have (05-audit-evidence-hold.md) — a real gap, but its answer is identical on every feature forever ('still no trigger') and the artifact it demands is one migration written once. It is work, not a question. Recorded as prerequisite work under conflict 9 (evidence-class audit depends on it) and belongs on the migration list, not in a rule a reader carries into every feature.
- Permission with no explanation (31-enablement-onboarding.md) — asks for guidance text keyed to a permission so every surface renders the same string. The demand is already governed by the repository's own globalization rule: customer- and operator-facing copy lives in translation files, one source per concern. What remains after that rule is the choice of words, which is content work; it changes what a screen says, never what a feature contains.
- Demo data has one persona (31-enablement-onboarding.md) — asks each feature to seed a sandbox dataset per actor family. Worth doing once as an enablement project, but the answer is always 'add seed rows' and it never changes the shape of the feature being scoped. The part that genuinely bites — a trainee's practice sale posting a real journal entry at an unlaunched branch — is already owned by 'The branch that cannot trade tomorrow', which demands a Location state every reader honours.
- The risk register with no register (35-risk-insurance-continuity.md) — asks where a risk entry lives, with owner, likelihood, impact and next review date. Every honest answer on every feature is 'nowhere, there is no Risk model', because this is a request to build a governance module, not a question that scopes anything else. It is a feature proposal wearing a lens's clothes; kept as a proposal in its own file, not kept as a lens.

## Catalogue Only

### Audience is a capability, not an address

**Reason:** Fires on every feature that sends a message, but its artifact (permission + scope as the audience expression) is notification-layer machinery; belongs beside the notification lenses rather than in the headline rule.

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

### Delivery is a fact, not a hope

**Reason:** Strong lens, single surface: it is answered once by building a Delivery row, a suppression list and a provider webhook, then inherited by every later send.

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

### The recipient's daily total

**Reason:** Alarm fatigue is real but the lens fires only on features that notify; its consent-matrix half overlaps 23's consent lens.

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

### Which tier owns the credential

**Reason:** Fires on external endpoints only. Distinct from the headline principal lens (who may act) — this is who owns the secret and what happens when it is absent.

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

### Click the number

**Reason:** Reporting-surface lens; its scope-statement demand is carried into conflict 7, which rules how it coexists with scoped lists.

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

### The file outlives the app

**Reason:** Export-specific. Fires on every CSV but only on CSVs; the provenance block it demands is built once as a shared export contract.

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

### The other end, and what nets it out

**Reason:** Fires only on cross-entity flows, which are rare per feature and already gated by Organization.allowInterBrandTransfers.

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

### The adoption test

**Reason:** Node-collision and merge safety. Kept distinct from the headline 'second legal entity' lens: that one is separation inside one database, this one is two nodes generating the same code offline.

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

### The weaker writer

**Reason:** Bulk-path lens; the row-outcome vocabulary it demands applies only where a loop exists.

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

### Row 4,312's authority

**Reason:** Per-row authority inside a bulk run. The headline 'Whose rows, and which columns' carries the principle; this keeps the loop-specific done test.

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

### The 14:02 undo

**Reason:** Bulk-run reversal. The headline 'undo fan-out' carries the enumeration; this keeps the before-image and re-upload demands specific to a run.

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

### The busiest minute, and the lock you hold through it

**Reason:** Lock duration and outbox drain under one large invocation; narrower than the headline row-count lens and answered per bulk path. Absorbs 'The write that doesn't chunk' (29).

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

### The switch, its scope, and who may throw it

**Reason:** Runtime kill switch per behaviour; overlaps the headline authority lens on permission and audit, and the absent-collaborator lens on off-state rendering.

**Source File:** docs/implementation/WO-22-lens-workflow-results.md

### Who may mint a role, and what a hundred of them costs

**Reason:** Role inheritance and duplicate grant lists; fires when roles are created, not when features are.

**Source File:** docs/erp-lenses/roles-ranks-orgchart/02-roles-ranks-orgchart.md

### Who read it, not just who wrote it

**Reason:** Read-access logging for high and critical sensitivity keys; scoped by conflict 9's evidence-class ruling and by its own cost (one row per actor-entity-day, not per request).

**Source File:** docs/erp-lenses/audit-evidence-hold/05-audit-evidence-hold.md

### The hold that beats the delete button

**Reason:** Fires on delete, anonymise and period-close paths only — but it is the winning side of conflict 1 and must be read with it.

**Source File:** docs/erp-lenses/audit-evidence-hold/05-audit-evidence-hold.md

### The column with no producer

**Reason:** costCentreId exists with no model, no event and no roster field behind it; a specific instance of the headline dimension lens, kept for the labour-cost case.

**Source File:** docs/erp-lenses/workforce-shifts-jml/06-workforce-shifts-jml.md

### Tax point is not the GL date

**Reason:** Fires on taxable documents only; distinct from the headline period lens, which is about which period a posting lands in rather than when tax became due.

**Source File:** docs/erp-lenses/tax-jurisdiction-invoice/08-tax-jurisdiction-invoice.md

### Reconciliation with nothing to reconcile against

**Reason:** Bank statement lines and the matched-payment column; treasury-specific and unbuilt end to end.

**Source File:** docs/erp-lenses/treasury-cash-reconciliation/09-treasury-cash-reconciliation.md

### Transfer price fixed at cost

**Reason:** Inter-brand markup and the unreached SettlementMode.INTERNAL_PL; fires only where two brands trade.

**Source File:** docs/erp-lenses/costing-transfer-pricing/10-costing-transfer-pricing.md

### The price that wins

**Reason:** Seven copy-pasted resolutions of priceOverride ?? basePrice. High leverage in retail, but the duplication itself is already forbidden by the globalization rule; kept for the location/channel/counterparty dimensions it adds. Absorbs 'One price, however many doors' (19).

**Source File:** docs/erp-lenses/pricing-discount-governance/11-pricing-discount-governance.md

### The till has no floor

**Reason:** A key distinct from pos.operate, a ceiling, and a column preserving the replaced price. Absorbs 'The price nobody can point to' (24).

**Source File:** docs/erp-lenses/pricing-discount-governance/11-pricing-discount-governance.md

### The receipt that doesn't find its bill

**Reason:** Settlement never reaches the aging pool because the AR credit line carries no contactId; receivables-specific.

**Source File:** docs/erp-lenses/credit-receivables/12-credit-receivables.md

### The status nobody checks

**Reason:** ContactStatus.BLOCKED is a label nothing reads at order placement; fires on order paths and is one side of conflict 2.

**Source File:** docs/erp-lenses/credit-receivables/12-credit-receivables.md

### The bill nobody checked

**Reason:** Three-way match between bill, PO and goods receipt; procurement-specific.

**Source File:** docs/erp-lenses/procurement-supplier-lifecycle/13-procurement-supplier-lifecycle.md

### A boolean is not a lifecycle

**Reason:** Supplier states and compliance documents with expiry; procurement-specific and one side of conflict 2.

**Source File:** docs/erp-lenses/procurement-supplier-lifecycle/13-procurement-supplier-lifecycle.md

### The reorder point has no address

**Reason:** One global reorderPoint compared against a deployment-wide SUM; planning-specific but the sharpest instance of an aggregate erasing location.

**Source File:** docs/erp-lenses/planning-replenishment/14-planning-replenishment.md

### Not enough to go around

**Reason:** Allocation of one receipt across competing locations; no table, function or event does this anywhere today.

**Source File:** docs/erp-lenses/planning-replenishment/14-planning-replenishment.md

### A forecast is not a commitment

**Reason:** DRAFT versus SENT, and lead time as a distribution rather than a scalar; planning-specific.

**Source File:** docs/erp-lenses/planning-replenishment/14-planning-replenishment.md

### Bins are not built, locations are the floor

**Reason:** Location is the finest storage grain; fires on picking and warehouse features only.

**Source File:** docs/erp-lenses/warehouse-logistics-fleet/15-warehouse-logistics-fleet.md

### The handoff that has no signer

**Reason:** Who physically held this, and whose signature or photograph is attached. Absorbs 'Custody has no holder' (37) — a carton and a card-handling device need the same row.

**Source File:** docs/erp-lenses/warehouse-logistics-fleet/15-warehouse-logistics-fleet.md

### Shortage with no reason, no evidence

**Reason:** Every short receipt is coded WRITE_OFF with nowhere to attach proof. Absorbs 'The scrap that has no reason code' (16) and 'The claim's evidence pack' (35).

**Source File:** docs/erp-lenses/warehouse-logistics-fleet/15-warehouse-logistics-fleet.md

### Carried, not just in stock

**Reason:** Ranging distinct from quantity; merchandising-specific but the cause of false stockout alerts at every location that never carried the SKU.

**Source File:** docs/erp-lenses/merchandising-assortment/17-merchandising-assortment.md

### No such thing as a store grade

**Reason:** No location grade, cluster or grouping model; merchandising-specific.

**Source File:** docs/erp-lenses/merchandising-assortment/17-merchandising-assortment.md

### The new store's first delivery

**Reason:** A store-opening pack as a named artifact; fires once per location, and its default-location half is carried by the headline 'movement with no address'.

**Source File:** docs/erp-lenses/merchandising-assortment/17-merchandising-assortment.md

### The propose-up path that never opens

**Reason:** Branch-created products with no ownership field and no upward path; catalogue-specific, and the subject of conflict 8.

**Source File:** docs/erp-lenses/master-data-taxonomy/18-master-data-taxonomy.md

### The exact-string gate

**Reason:** Import dedup is case-sensitive single-locale equality; fires on bulk catalogue loads.

**Source File:** docs/erp-lenses/master-data-taxonomy/18-master-data-taxonomy.md

### One column, one unit, forever

**Reason:** fabricMeters carries its unit in the column name; a real multi-sector gap, but it fires only when a second vertical or unit appears.

**Source File:** docs/erp-lenses/master-data-taxonomy/18-master-data-taxonomy.md

### Custody without ownership

**Reason:** Stock we own sitting where we do not. Absorbs 'The cloth that leaves the building' (16); fires on franchise, consignment and subcontract features.

**Source File:** docs/erp-lenses/channels-franchise-wholesale/19-channels-franchise-wholesale.md

### The royalty has no revenue to read

**Reason:** Percentage-of-sales settlement with no fact to read and no mode that returns it; franchise-specific.

**Source File:** docs/erp-lenses/channels-franchise-wholesale/19-channels-franchise-wholesale.md

### The complaint that isn't a record

**Reason:** A ServiceCase with status, owner, due-by and an FK to the order or transfer; service-specific and entirely unbuilt.

**Source File:** docs/erp-lenses/service-cases-sla/20-service-cases-sla.md

### One case ID, or five unrelated tables

**Reason:** One identifier threading Interaction, InboundEmail, Payment, Order and AuditLog; a linkage question that follows the case model above.

**Source File:** docs/erp-lenses/service-cases-sla/20-service-cases-sla.md

### The gate checked once, not per action

**Reason:** POS authorizes at terminal login and never again; overlaps the headline principal lens, kept for the per-surface re-check demand.

**Source File:** docs/erp-lenses/omnichannel-parity/21-omnichannel-parity.md

### The registry only one surface has

**Reason:** Only admin has a greppable reachability table; high leverage for omnichannel work but answered once by building the registries.

**Source File:** docs/erp-lenses/omnichannel-parity/21-omnichannel-parity.md

### The view nobody can name back

**Reason:** No SavedView model; fires on list screens and is a single shared primitive once built.

**Source File:** docs/erp-lenses/findability-at-scale/22-findability-at-scale.md

### The selection that outlives the page

**Reason:** Select-all across 8,400 rows as a stored filter rather than an id list; fires on bulk actions over paginated lists.

**Source File:** docs/erp-lenses/findability-at-scale/22-findability-at-scale.md

### The 21st row

**Reason:** One search caps silently at 20, another never caps; neither returns a match count. Findability-specific and fixable per surface.

**Source File:** docs/erp-lenses/findability-at-scale/22-findability-at-scale.md

### Consent is a matrix, not a switch

**Reason:** Channel-by-purpose consent against one marketingEmailOptOut boolean; fires on communication features.

**Source File:** docs/erp-lenses/loyalty-consent-data-rights/23-loyalty-consent-data-rights.md

### The retention clock with no dial

**Reason:** Per-class retention periods stored as data; the counterpart to the headline erasure lens and a constraint on it under conflict 1.

**Source File:** docs/erp-lenses/privacy-retention-residency/25-privacy-retention-residency.md

### The number that pages, and the number that doesn't

**Reason:** A metric with a threshold and a non-DBA screen; day-two work that follows the headline failure-path lens.

**Source File:** docs/erp-lenses/day-two-operations/26-day-two-operations.md

### The stale clock nobody reads

**Reason:** lastSeenAt is written everywhere and compared nowhere; narrow but concrete, and cheap to answer.

**Source File:** docs/erp-lenses/day-two-operations/26-day-two-operations.md

### The crosswalk that doesn't exist

**Reason:** No legacyId or sourceSystem column anywhere; fires only on migrations, where it fires hard.

**Source File:** docs/erp-lenses/migration-cutover-restatement/27-migration-cutover-restatement.md

### A correction is indistinguishable from a refund

**Reason:** A reversal needs a classification so a restatement can be told from a return; migration- and audit-specific.

**Source File:** docs/erp-lenses/migration-cutover-restatement/27-migration-cutover-restatement.md

### Five doors, one hallway

**Reason:** Which mechanism owns a client-specific ask, and why the other four are wrong. Absorbs 'The field with no home' (28); subject of conflict 10.

**Source File:** docs/erp-lenses/extensibility-without-fork/28-extensibility-without-fork.md

### The cost that multiplies by location

**Reason:** applyMovement()'s in-transaction SUM across every location a variant is stocked at; the concrete instance behind conflict 5's ruling.

**Source File:** docs/erp-lenses/cost-to-serve/29-cost-to-serve.md

### One clock, a hundred branches

**Reason:** No per-Location timezone anywhere; fires on any day-bucketing feature but is answered once by one column and its call sites.

**Source File:** docs/erp-lenses/time-periods-backdating/30-time-periods-backdating.md

### The day with no name

**Reason:** Nothing sits between a PosShift and a calendar month; fires on day-close features.

**Source File:** docs/erp-lenses/time-periods-backdating/30-time-periods-backdating.md

### The landing page assumes two roles

**Reason:** landingFor() is a binary on analytics.view; fires whenever a role is added, which is often, but the fix is one function.

**Source File:** docs/erp-lenses/enablement-onboarding/31-enablement-onboarding.md

### Quota has no owner

**Reason:** One IP-based 300/60s bucket shared by every partner and every shopper; fires on partner and bulk endpoints.

**Source File:** docs/erp-lenses/automation-and-ai-surface/32-automation-and-ai-surface.md

### Narrate, never post

**Reason:** A boundary stated before the code exists; kept because it is cheap and pre-emptive, catalogued because there is no AI integration anywhere to apply it to yet.

**Source File:** docs/erp-lenses/automation-and-ai-surface/32-automation-and-ai-surface.md

### The barcode that already decided

**Reason:** An exact scan and a half-typed guess cost the same two taps; POS-specific and measurable in taps.

**Source File:** docs/erp-lenses/operator-hands/33-operator-hands.md

### Which writes get the queue

**Reason:** Only the sale is wrapped in the device outbox; the client-side complement to the headline four-hours-down lens.

**Source File:** docs/erp-lenses/operator-hands/33-operator-hands.md

### Every unit, not the whole SKU

**Reason:** No lot or batch identity, so a recall can only name a SKU; fires on traceability features and would be a schema-wide change.

**Source File:** docs/erp-lenses/provenance-esg-statutory/34-provenance-esg-statutory.md

### The claim, not the supplier

**Reason:** Origin belongs to a shipment, not a standing Supplier field; narrow but generalizes to any claim made about goods.

**Source File:** docs/erp-lenses/provenance-esg-statutory/34-provenance-esg-statutory.md

### The regulator's own boxes

**Reason:** An account-to-external-line mapping that survives a chart change; fires on statutory filings only.

**Source File:** docs/erp-lenses/provenance-esg-statutory/34-provenance-esg-statutory.md

### The insured value nobody can total

**Reason:** One global weighted average is the only basis available per location; narrow, but it names the valuation-basis question any value figure must answer.

**Source File:** docs/erp-lenses/risk-insurance-continuity/35-risk-insurance-continuity.md

### The branch that cannot trade tomorrow

**Reason:** One flip must stop receipts, transfers and shift opens at once. Absorbs 'Going live has no state' (31) and 'Downtime that outranks the sale' (37) — one missing Location state machine asked at both ends of a branch's life.

**Source File:** docs/erp-lenses/risk-insurance-continuity/35-risk-insurance-continuity.md

### The control has no name, only the fact does

**Reason:** A Control row that AuditLog entries point back to; governance-specific and only meaningful once an audit committee exists.

**Source File:** docs/erp-lenses/internal-audit-controls-testing/36-internal-audit-controls-testing.md

### Testing is a record, not a query

**Reason:** A ControlTest row with sample, result and remediation due date; follows the Control model above.

**Source File:** docs/erp-lenses/internal-audit-controls-testing/36-internal-audit-controls-testing.md

