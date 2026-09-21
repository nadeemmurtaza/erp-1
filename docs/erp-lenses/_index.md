# The lens catalogue

A lens is one question asked of a named feature before it is built, whose
answer must name an artifact in this repository — a column, a table, a
permission key, a service method, a screen, or a number. A question whose
answer could be "yes, handled" is not a lens.

This folder holds 146 of them. Twenty-four are the rule, quoted in full in
CLAUDE.md's "Feature scope: build the whole capability, not one slice of it".
The rest are here, each in a numbered domain file with its repository
evidence, its worked example, its done test, and the hardening record of what
an adversarial pass killed or corrected in it.

## How to run the pass

1. Read the five shop-scale lenses in CLAUDE.md — the transaction end to end,
   the operator's twin, what happens after "done", the real integrations, the
   policy layer. They cost minutes and they set the shape.
2. Walk the twenty-four group-scale lenses in order. Group 1 first, because
   everything after it is a property of somebody; group 6 last, because it is
   the one a narrow build always postpones.
3. Write one line per lens into the plan. `### Scope lenses` is a heading
   inside the "Plan before build" template in CLAUDE.md, beside
   `### Out of Scope` — the scope map is part of the plan, not a separate
   document, and it is reviewed before code exists.
4. Where the feature reaches a surface with its own narrower lens — a bulk
   import, a notification, a CSV export, a POS screen, a list at 10k+
   products — run that one too, from the table below.
5. Where two lenses pull opposite ways, cite the numbered ruling in
   [`_canonical-decisions.md`](_canonical-decisions.md). The argument each
   ruling settles is stated fairly, at length, in
   [`_conflicts.md`](_conflicts.md). Deciding a conflict privately inside a
   PR is not an answer; neither is discovering it in review.

The pass produces exactly one artifact: the `### Scope lenses` block. An
answer names an artifact. An `n/a` names a reason — "this feature writes no
money fact" is a reason, "N/A" is not, and silence is not. A reviewer fails
the PR on a missing line, an unnamed artifact, a reasonless `n/a`, or a diff
that contradicts a line of it.

## How to read the table

- **Group** is one of the six headline groups, or `catalogue` for a lens kept
  for the surface it fires on, or `→ <lens>` for a question absorbed into a
  canonical one, or `cut` with its reason in `_canonical-decisions.md`.
  Absorbed rows are in the table because someone will remember the old name.
- **File** is the numeric prefix of the domain file in this folder —
  `docs/erp-lenses/07-*.md` for `07` — or `WO-22` for
  [`docs/implementation/WO-22-lens-workflow-results.md`](../implementation/WO-22-lens-workflow-results.md),
  the first, ungrounded run whose thirty lenses this pass absorbed.
- **Bites** is the editions the question has a non-trivial answer at: **S**olo
  one shop, **C**hain multi-branch retailer, **O**rganization group of brands
  (`RETAIL-ERP.md` R14). A `·` means the answer is forced at that edition —
  one location, one brand — not that the lens is optional there. The column
  it demands still ships in the first migration; see ruling 4.

## The catalogue

| Lens | Asks | File | Group | Bites |
|---|---|---|---|---|
| **The actor with three tables** | Which table each new actor or counterparty becomes, and the column linking the rows when one party is two of them | 01 | 1 actor | S C O |
| **The principal with no permission key** | For a non-`User` actor: which `PERMISSION_CATALOG` keys it is checked against, or which path authenticates it instead | 01 | 1 actor | S C O |
| **The grant that ends itself** | What ends each grant without a human remembering, and every row keyed to that `userId` the deactivation transaction changes | 02 | 1 actor | S C O |
| **Whose rows, and which columns** | Which actor gets back fewer rows and fewer columns, on the list, the export, the schedule and the drill-down alike | WO-22 | 2 authority | S C O |
| **The threshold nobody approves alone** | Amount bands, the role and rank per band, the quorum on top, the method that checks before draft — then the same for the undo | 04 | 2 authority | S C O |
| **The toxic pair, caught at grant or at act** | The permission-key pair this makes toxic together, and the single place it is refused | 03 | 2 authority | S C O |
| **Authority and blast radius** | Who may change this rule, at which scope, the worst value they can set, and the audit row holding old and new | WO-22 | 2 authority | S C O |
| **Request or record — classify every write** | Is each write refusable, or a record of something that already happened and may never be refused | WO-22 | 3 act | S C O |
| **The movement with no address** | The `locationId` on every stock or cash write, and where the value comes from | 24 | 3 act | · C O |
| **Four hours down, the counter stays open** | Who was mid-task, what they do on paper, the surface that ingests it, and the reconciliation proving no double count | WO-22 | 3 act | S C O |
| **The unwritten posting rule** | The domain event, the Dr/Cr codes, the `findPostedEntry(source, sourceRef)` key — or the report that reconciles it instead | 07 | 4 money | S C O |
| **Every column or none** | Which of `JournalLine`'s five dimension columns this sets, or which report may therefore blend it | 07 | 4 money | S C O |
| **The period that already moved** | What happens to a fact dated inside a `CLOSED` or `LOCKED` `FiscalPeriod` | 07 | 4 money | S C O |
| **The second legal entity** | The tax label, the gapless per-brand series, and the column that closes one brand's period alone | 08 | 4 money | · · O |
| **Dry run before live** | Can the rule replay over last month's records with nothing written — is the deciding function pure | WO-22 | 4 money | S C O |
| **Three silhouettes, and the day the tier above appears** | Which tier-bearing columns ship in the first migration and never render on the Solo screen | WO-22 | 5 scale | S C O |
| **The absent collaborator** | Each module this needs that is off by default: what is recorded, what is not, and whether absence degrades or fails boot | WO-22 | 5 scale | S C O |
| **The second copy of the write** | The two moments it arrives twice, and the unique constraint making the second a no-op | WO-22 | 5 scale | S C O |
| **The hundred-thousandth row** | Row count at Organization edition, statements per page, how many come from an index | WO-22 | 5 scale | · C O |
| **The reversal document, not the reversal flag** | The reverse document's entity, series, amount field and FK to the original line — partial and repeatable | WO-22 | 6 afterlife | S C O |
| **The undo fan-out** | Every side effect the forward path fires, each marked automatic, human, or deliberately irreversible | WO-22 | 6 afterlife | S C O |
| **The version stamp** | What happens to records written under the old rule, and whether their number can still be explained | WO-22 | 6 afterlife | S C O |
| **The erasure the ledger cannot obey** | Every table still holding the person after the `User` row is gone, each with a disposition | 25 | 6 afterlife | S C O |
| **The failure path, and who is allowed to walk it** | The durable store, the screen, the permission, the replay action, and what makes a second replay safe | WO-22 | 6 afterlife | S C O |
| Audience is a capability, not an address | The permission key and scope that decide who receives a message, and what happens at zero holders and at two hundred | WO-22 | catalogue | S C O |
| Delivery is a fact, not a hope | The one query answering: sent, to which address, accepted, bounced, suppressed | WO-22 | catalogue | S C O |
| The recipient's daily total | How many messages this adds to the busiest recipient's day, which digest, which may wake them | WO-22 | catalogue | · C O |
| Which tier owns the credential | Which tier holds an external endpoint's secret, and what happens when it is absent | WO-22 | catalogue | S C O |
| Click the number | What a figure drills into, and whether the drill-down reproduces the figure exactly | WO-22 | catalogue | S C O |
| The file outlives the app | The provenance block on an export: who, when, which filter, which scope | WO-22 | catalogue | S C O |
| The other end, and what nets it out | For a cross-entity flow, the matching opposite entry and what eliminates the pair | WO-22 | catalogue | · · O |
| The adoption test | Two nodes generating the same code offline, and what makes a merge safe | WO-22 | catalogue | · C O |
| The weaker writer | Per-row outcome vocabulary for a bulk loop — accepted, rejected, skipped, and why | WO-22 | catalogue | S C O |
| Row 4,312's authority | Whether authority is checked per row inside a bulk run or once at the top | WO-22 | catalogue | S C O |
| The 14:02 undo | The before-image a bulk run stores, and how it is re-uploaded to undo | WO-22 | catalogue | S C O |
| The busiest minute, and the lock you hold through it | Lock duration and outbox drain under one large invocation; absorbs "The write that doesn't chunk" | WO-22 | catalogue | · C O |
| The switch, its scope, and who may throw it | A runtime kill switch per behaviour, its scope, its permission, its audit row | WO-22 | catalogue | S C O |
| Who may mint a role, and what a hundred of them costs | Whether a new role extends a base or is a fresh grant list, and who may create one | 02 | catalogue | S C O |
| Who read it, not just who wrote it | The row a read of a high-sensitivity record creates, distinct from `AuditLog`'s write-only actions | 05 | catalogue | S C O |
| The hold that beats the delete button | Which path checks an active legal hold before a delete, anonymise or period close (ruling 1) | 05 | catalogue | S C O |
| The column with no producer | `JournalLine.costCentreId` exists with no model, event or roster field behind it | 06 | catalogue | S C O |
| Tax point is not the GL date | The field holding when output tax became due, stored apart from `JournalEntry.date` | 08 | catalogue | S C O |
| Reconciliation with nothing to reconcile against | The table a bank statement line lands in, and the matched-payment column | 09 | catalogue | S C O |
| Transfer price fixed at cost | The inter-brand markup column, and the policy it is priced from | 10 | catalogue | · · O |
| The price that wins | The ordered list of price sources, carrying location, channel and counterparty; absorbs "One price, however many doors" | 11 | catalogue | S C O |
| The till has no floor | A key distinct from `pos.operate`, a ceiling, and the column preserving the replaced price; absorbs "The price nobody can point to" | 11 | catalogue | S C O |
| The receipt that doesn't find its bill | The field tying a payment to the receivable it settles | 12 | catalogue | S C O |
| The status nobody checks | The path that reads credit-hold state before an order is placed (ruling 2) | 12 | catalogue | S C O |
| The bill nobody checked | The three-way match between bill, PO and goods receipt, with its named tolerance | 13 | catalogue | S C O |
| A boolean is not a lifecycle | Supplier states beyond `isActive`, and compliance documents with expiry dates (ruling 2) | 13 | catalogue | S C O |
| The reorder point has no address | The per-location threshold, against one global `reorderPoint` compared to a deployment-wide SUM | 14 | catalogue | · C O |
| Not enough to go around | The rule allocating one short receipt across competing locations | 14 | catalogue | · C O |
| A forecast is not a commitment | The status separating a projection from a commitment, and lead time as a distribution | 14 | catalogue | S C O |
| Bins are not built, locations are the floor | What tells a picker which shelf, given `Location` is the finest storage grain | 15 | catalogue | · C O |
| The handoff that has no signer | Who physically held this, and whose signature or photograph is attached; absorbs "Custody has no holder" | 15 | catalogue | · C O |
| Shortage with no reason, no evidence | What distinguishes damage from theft from a miscount, and where the proof attaches; absorbs the scrap reason code and the claim's evidence pack | 15 | catalogue | S C O |
| Carried, not just in stock | Ranging — that a SKU is meant to be sold here — distinct from quantity | 17 | catalogue | · C O |
| No such thing as a store grade | The table mapping a location grade to the assortment it may carry | 17 | catalogue | · C O |
| The new store's first delivery | The store-opening pack as a named artifact, seeding day-one assortment | 17 | catalogue | · C O |
| The propose-up path that never opens | How a branch-created product travels up, given the registry refuses POLICY/UP (ruling 8) | 18 | catalogue | · C O |
| The exact-string gate | The match rule deciding new product versus new variant on a bulk load | 18 | catalogue | S C O |
| One column, one unit, forever | Where a second unit of measure lives, given `fabricMeters` carries its unit in the column name | 18 | catalogue | S C O |
| Custody without ownership | Stock we own sitting where we do not; absorbs "The cloth that leaves the building" | 19 | catalogue | · C O |
| The royalty has no revenue to read | Which fact a percentage-of-sales settlement reads, and which mode returns it | 19 | catalogue | · · O |
| The complaint that isn't a record | A case with status, owner, due-by and an FK to the order or transfer it concerns | 20 | catalogue | S C O |
| One case ID, or five unrelated tables | The one identifier threading `Interaction`, `InboundEmail`, `Payment`, `Order` and `AuditLog` | 20 | catalogue | S C O |
| The gate checked once, not per action | Whether each surface re-checks a specific permission at the act, or authorizes once at login | 21 | catalogue | S C O |
| The registry only one surface has | The greppable artifact proving a capability is reachable on each surface | 21 | catalogue | S C O |
| The view nobody can name back | The row storing a five-clause filter an operator will use again tomorrow | 22 | catalogue | S C O |
| The selection that outlives the page | What represents "select all" across 8,400 rows when the bulk action runs minutes later | 22 | catalogue | S C O |
| The 21st row | What the operator sees when their term matches row 21 of a silently capped search | 22 | catalogue | S C O |
| Consent is a matrix, not a switch | Channel by purpose, against one `marketingEmailOptOut` boolean | 23 | catalogue | S C O |
| The retention clock with no dial | The retention period per class, stored as data, and what deletes the row (ruling 1) | 25 | catalogue | S C O |
| The number that pages, and the number that doesn't | The metric, the threshold, and the screen a non-DBA reads it from | 26 | catalogue | S C O |
| The stale clock nobody reads | The code comparing a `lastSeenAt` to now and deciding "stale" | 26 | catalogue | · C O |
| The crosswalk that doesn't exist | The column holding a legacy system's own identifier, and what happens on a natural-key collision | 27 | catalogue | S C O |
| A correction is indistinguishable from a refund | What marks a correcting entry as a restatement rather than a business reversal | 27 | catalogue | S C O |
| Five doors, one hallway | Which of the five mechanisms owns a client-specific ask, and why the other four are wrong; absorbs "The field with no home" (ruling 10) | 28 | catalogue | S C O |
| The cost that multiplies by location | Every location a single-unit sale's transaction aggregates over (ruling 5) | 29 | catalogue | · C O |
| One clock, a hundred branches | The field holding one `Location`'s own timezone | 30 | catalogue | · C O |
| The day with no name | One location's business day as a closeable unit, between a `PosShift` and a `FiscalPeriod` | 30 | catalogue | S C O |
| The landing page assumes two roles | Where each defined role lands on a fresh login, and what it can click there | 31 | catalogue | S C O |
| Quota has no owner | The per-partner, per-key request and row ceiling above the global IP bucket | 32 | catalogue | S C O |
| Narrate, never post | The downstream write a model's output must never make unconfirmed | 32 | catalogue | S C O |
| The barcode that already decided | What an exact scan costs in taps versus a half-typed guess | 33 | catalogue | S C O |
| Which writes get the queue | Which till actions the device outbox protects against its own disconnection | 33 | catalogue | S C O |
| Every unit, not the whole SKU | The lot or batch identity a recall needs, against fungible `variantId`+`locationId` stock | 34 | catalogue | S C O |
| The claim, not the supplier | Whether an origin claim attaches to a shipment or to a standing `Supplier` field | 34 | catalogue | S C O |
| The regulator's own boxes | The account-to-external-line mapping that survives a chart change | 34 | catalogue | S C O |
| The insured value nobody can total | Today's query for the value of stock at risk at one `Location`, and its valuation basis | 35 | catalogue | · C O |
| The branch that cannot trade tomorrow | One flip stopping receipts, transfers and shift opens at once; absorbs "Going live has no state" and "Downtime that outranks the sale" | 35 | catalogue | · C O |
| The control has no name, only the fact does | The `Control` row that `AuditLog` entries point back to | 36 | catalogue | S C O |
| Testing is a record, not a query | The `ControlTest` row with sample, result and remediation due date | 36 | catalogue | S C O |
| The access with no end date | The externally-sourced, time-boxed actor | 01 | → The grant that ends itself | S C O |
| The credential with no permission key | The domain file's own name for it | 01 | → renamed The principal with no permission key | S C O |
| The actor with no role | The same question asked from the role side | 02 | → The principal with no permission key | S C O |
| Rank is a ceiling, not a location | `AdminScopeLevel` answers where, never how much | 02 | → The threshold nobody approves alone | S C O |
| The grant that never expires | The domain file's own name for it | 02 | → renamed The grant that ends itself | S C O |
| The conflict matrix has no home | The domain file's own name, merged with its own second half | 03 | → renamed The toxic pair, caught at grant or at act | S C O |
| Detected at grant or at act | The same question's enforcement-point half | 03 | → The toxic pair, caught at grant or at act | S C O |
| Who counts the drawer they held | The worked instance: `closeShift()` never compares `closedByUserId` to `openedByUserId` | 03 | → The toxic pair, caught at grant or at act | S C O |
| Acting cover has no clock | The `startsAt`/`endsAt` delegation row the resolver unions in only inside its window | 04 | → The grant that ends itself | S C O |
| The approval orphaned by a leaver | Reassigning a pending decision in the same transaction (ruling 6) | 04 | → The grant that ends itself | S C O |
| The trigger `AuditLog` doesn't have | A DB-level immutability trigger on the audit trail | 05 | cut — prerequisite work, not a question | S C O |
| The leaver keeps the keys | The deactivation transaction touches only `User.isActive` and `RefreshToken` (ruling 6) | 06 | → The grant that ends itself | S C O |
| Branch means database, not location | `AdminScope.branchNodeId` names a child deployment, not one of 100+ `Location` rows | 06 | → Whose rows, and which columns | · C O |
| One tax regime, many legal entities | The domain file's own name for it | 08 | → renamed The second legal entity | · · O |
| Number series, one legal entity at a time | A shared counter reads to a tax authority as suppressed sales | 08 | → The second legal entity | · · O |
| The credit note is a filed document, not a status flip | The reverse document is itself a filing, with its own series and output tax | 08 | → The reversal document, not the reversal flag | S C O |
| One ledger line for every drawer and every bank | Account 1000 is one row for every drawer and every bank account | 09 | → Every column or none | S C O |
| The overshort that vanishes | `zReport()` computes `overShortMinor` and writes it nowhere; cash has no `StockVariance` | 09 | → Request or record — classify every write | S C O |
| Opt-in cost redaction | The `cost-fields.ts` strippers no call site is forced to use | 10 | → Whose rows, and which columns | S C O |
| The ledger's five unfilled columns | The same question over all five, adding that `costCentreId` has no backing model | 10 | → Every column or none | S C O |
| The number the auditor cannot see | The audit row must carry old and new value, not a list of changed field names | 11 | → Authority and blast radius | S C O |
| One customer, two ledgers | The missing link between `Contact` and `TradingPartner`, and the unmeasurable exposure | 12 | → The actor with three tables | S C O |
| Five commitments, one key | Five purchasing moments behind one `purchasing.manage` grant | 13 | → The threshold nobody approves alone | S C O |
| The scrap that has no reason code | Over-consumption has no home distinct from shrinkage | 16 | → Shortage with no reason, no evidence | S C O |
| The cloth that leaves the building | Subcontracted stock is the same question as consignment stock | 16 | → Custody without ownership | · C O |
| The field with no home | A subset of the same five doors | 28 | → Five doors, one hallway | S C O |
| One price, however many doors | Resolution order must carry counterparty as well as location and channel | 19 | → The price that wins | · C O |
| The portal has no read scope | `getLiveStock()` checks only `partner.kind`, so every CUSTOMER-kind partner reads the whole catalogue | 19 | → The principal with no permission key | S C O |
| Compensation authority is a boolean, not a ceiling | Ceiling half here; its ledger half went to the reversal document | 20 | → The threshold nobody approves alone | S C O |
| The principal with no permission to check | `JwtStrategy.validate` is the only path into the resolver | 21 | → The principal with no permission key | S C O |
| The default is a scope, not a filter | The narrowing is the list's opening state, not an optional filter (ruling 7) | 22 | → Whose rows, and which columns | · C O |
| The liability with no account | The account itself may not exist in the thirteen-row chart | 23 | → The unwritten posting rule | S C O |
| The request the ledger cannot obey | Contributes the per-table disposition as the deliverable | 23 | → The erasure the ledger cannot obey | S C O |
| The void that outruns the refund | `changeStatus()` reaches CANCELLED from three post-payment statuses with no reversal | 24 | → The undo fan-out | S C O |
| The write-off with no address | The domain file's own name, widened past the admin `adjust()` endpoint | 24 | → renamed The movement with no address | · C O |
| The price nobody can point to | The same key, ceiling and preserved-original-price column | 24 | → The till has no floor | S C O |
| The row the ledger will not let you touch | The domain file's own name for it (ruling 1) | 25 | → renamed The erasure the ledger cannot obey | S C O |
| The payload that already left | `OutboxEvent` and `ReplicationRecord` copies, possibly in another jurisdiction | 25 | → The erasure the ledger cannot obey | S C O |
| The operator's second door | An `ADMIN_NAV` entry gated by a real `PERMISSION_CATALOG` key | 26 | → The failure path, and who is allowed to walk it | S C O |
| The ledger has no door for opening balances | `postEntry()`'s only callers are event handlers and year-end close | 27 | → The unwritten posting rule | S C O |
| The refusal that isn't graceful | An extension point no-ops; a direct coupling fails Nest boot | 28 | → The absent collaborator | S C O |
| The report that recomputes from scratch | `balancesAsOf()` filters on an unindexed `JournalEntry.date` | 29 | → The hundred-thousandth row | · C O |
| The write that doesn't chunk | `StockCountService.start()` inserts one row per active variant in one transaction | 29 | → The busiest minute, and the lock you hold through it | · C O |
| The calendar every brand shares | `FiscalPeriod` has no brand column, so one close locks every brand | 30 | → The second legal entity | · · O |
| Demo data has one persona | A sandbox dataset per actor family | 31 | cut — always "add seed rows" | S C O |
| Going live has no state | The missing `Location` state at the start of a branch's life | 31 | → The branch that cannot trade tomorrow | · C O |
| Permission with no explanation | Guidance text keyed to a permission | 31 | cut — governed by the translation-file rule | S C O |
| The machine caller's own scope | A minted machine credential carries an explicit `PermissionKey` subset | 32 | → The principal with no permission key | S C O |
| The tap that might have already landed | A device replaying its own unconfirmed write through a keyless outbox | 33 | → The second copy of the write | S C O |
| The claim's evidence pack, not just the claim | The claim record and the missing attachment model | 35 | → Shortage with no reason, no evidence | S C O |
| The risk register with no register | A `Risk` row with owner, likelihood, impact and review date | 35 | cut — a feature proposal, not a lens | S C O |
| The auditor's key is not a master key | The same pair where one side is `audit.view` | 36 | → The toxic pair, caught at grant or at act | S C O |
| Custody has no holder | A carton and a card-handling device need the same row | 37 | → The handoff that has no signer | · C O |
| Downtime that outranks the sale | The query listing which locations are degraded now | 37 | → The branch that cannot trade tomorrow | · C O |
| The register the ledger never sees | Capex and depreciation as a second instance of missing account plus missing rule | 37 | → The unwritten posting rule | S C O |
| Whose rows? | Exports, schedules and drill-downs apply the same filter and mask as the screen | WO-22 | → Whose rows, and which columns | S C O |
| Name the owner, name the reader it refuses | WO-22's own name for it | WO-22 | → renamed Whose rows, and which columns | S C O |
| The edition above and the day it appears | The nullable-scope trap: `{ in: [...] }` never matches NULL (ruling 4) | WO-22 | → Three silhouettes, and the day the tier above appears | S C O |
| Three silhouettes | WO-22's own name, extended with the tier-above clause | WO-22 | → renamed Three silhouettes, and the day the tier above appears | S C O |
| Who may unmake it, how large, how late, and whose | Value band, time window and reverse-your-own here; its closed-period half went to the period lens | WO-22 | → The threshold nobody approves alone | S C O |
| A fact that already happened is never rejected | The inbound-message case, and the one sanctioned exception: an authenticity failure | WO-22 | → Request or record — classify every write | S C O |

154 rows for 146 lenses: eight canonicals appear twice, once under the name
the rule uses and once under the name their own domain file still carries, so
that grepping either finds it. Of the 146 — 24 headline, 69 kept in the
catalogue for the surface they fire on, 49 absorbed into a canonical, 4 cut.

## The six groups, and what each is for

**1. The actor** — answered first, because everything after it is a property
of somebody. Three questions: which table a new actor becomes, whether a
non-`User` principal can be permission-checked at all, and what ends an
access grant without a human remembering. Drawn from the identity, roles,
delegation, workforce and automation domains, so no single one owns it.

**2. The authority** — what bounds the act, in four directions: which rows
and columns the actor may see, how much they may commit alone, which two
capabilities must never sit in one grant, and who may change the rule itself.
This is where the repository is weakest — a flat OR over the permission
catalogue with no ceiling, no conflict matrix, and no scope on `Setting` — so
every lens here fires on nearly every feature.

**3. The act in the world** — the write as a physical event. Whether a fact
may be refused at all, which of a hundred locations it happened at, and what
staff do for the four hours the system is down. Before the money, because in
this codebase the stock moves and the posting rule follows.

**4. The money** — what the act does to the books, and the rule that computes
the number. The posting rule, the dimensions on its lines, the period it
lands in, the second legal entity, and whether the deciding function can be
replayed without writing.

**5. The scale** — what the same code costs at three editions, a hundred
branches and a hundred thousand rows, and what happens when one write arrives
twice. Each of these can only be answered before the first migration, because
each is a column, an index or a boundary that cannot be retrofitted once a
client is live.

**6. The afterlife** — undoing part of a fact, explaining its numbers a year
later, erasing the person from it, and finding it when it failed. Last,
because it is the group a narrow build always postpones, and the only one
whose omissions cannot be repaired after the rows exist.

## What this repository does not model yet

Some lenses have no field to put their answer in. That is not a reason to
skip the question — it is the answer, and it names the migration the feature
owes. Gathered from the "Not modelled yet" section of every domain file:

**Identity and authority.** No link between `User` and `Party`. No
`Franchisee` model, role or `PartyRoleName` value. No shared principal type
across `TradingPartner`, `PosTerminal` and `Node` — three independent
key-hash patterns, none checked against `PERMISSION_CATALOG`. No `expiresAt`
or `grantedBy` on `RoleGrant`, `UserRoleAssignment`, `UserPermission` or
`AdminScope`. No rank, grade, seniority or approval-ceiling field anywhere,
and no `managerId`/`reportsTo` — there is no org chart of people, only
`RetailBrand.parentId` nesting brands. No `Role.parentId`, so no role
inheritance. No department or cost-centre model. No `conflictsWith` pairing
two permission keys as toxic. No maker-checker field on any model. No
`Approval`/`ApprovalStep` model and no amount-band table. No delegation
table. No `Location`-keyed admin scope for staff, distinct from
`AdminScope.branchNodeId`, which names a child deployment.

**Evidence and retention.** No `LegalHold` model and nothing a hold could
attach to. No DB-level immutability on `AuditLog` — only `JournalLine` and
`JournalEntry` have triggers. No read-access logging anywhere. No
before/after value capture; `AuditLog.data` is a free-form `Json?`. No
retention or expiry column on any table. No purge or anonymisation job for
`OutboxEvent.payload`, `ReplicationRecord.payload`, `AuditLog.data` or
`InboundEmail.bodyText`. No jurisdiction, country or region column on
`Location`, `Node` or `RetailBrand`. No consent or legal-basis model beyond
`User.marketingEmailOptOut`. No data-subject-request model or endpoint.

**Money.** No `CostCentre` model to back `JournalLine.costCentreId`. No draft
or unposted journal state and no maker-checker before `POSTED`. No
partial-refund model: `Payment.refundAmount` exists, and nothing sets it
below the full amount. No prior-period-adjustment account, no restatement
trail, and no constraint tying `JournalEntry.date` to its period's range. No
`FxRate` table and no period-end revaluation. No GRNI clearing account, and
no journal for production, payroll or shift close. No per-`RetailBrand` home
for tax label, registration number, currency or default tax classes — all
four are compile-time constants today. No `CreditNote`/`DebitNote` model. No
declared tax-point date. No brand-scoped number-series key. No brand or org
column on `FiscalPeriod`/`FiscalYear`. No `BankAccount`, `BankStatement` or
matched column on `Payment`. No `CashVariance` — a shift's over/short is
computed and discarded. No `Safe`/`BankDeposit`. No transfer-pricing markup,
and `SettlementMode.INTERNAL_PL` has no derivation. No per-location or
per-brand costing; `ProductVariant.costPrice` is one global weighted average.
No opening-balance or manual-journal entry point into `postEntry()`. No
legacy-identifier or crosswalk column. No reason code distinguishing a
restatement from a business reversal. No loyalty model and no points-liability
account. No Fixed Assets or Accumulated Depreciation account, and no `Asset`,
`Equipment`, `Maintenance`, `Downtime` or `Depreciation` model.

**Stock, place and time.** No bin, zone, aisle or shelf — `Location` is the
finest storage grain. No driver, vehicle or fleet model. No proof-of-delivery
artifact. No pick-list spanning documents. No damage/shortage sub-reason or
evidence field. No assortment or ranging table. No location grade, tier,
format or cluster. No seasonal range with a lifecycle. No store-opening
document. No planogram or shelf capacity. No per-location `reorderPoint`. No
allocation rule for scarce supply. No lead-time distribution, no seasonality,
no demand forecast distinct from a point stock figure. No subcontractor
location or party role. No scrap factor or scrap reason. No multi-level BOM,
routing or BOM versioning. No lot, batch or serial identity. No per-shipment
origin or certification field. No `UnitOfMeasure` model — a unit lives in a
column's name. No per-`Location` timezone. No `BusinessDay`/`DayClose` model.
No `Product.scopeLevel` or `originNodeId`, and no field-level provenance on
any catalogue model. No consignment custody type, per-partner price list or
percentage-of-sales settlement mode. No consignment-liability account. No
single switch stopping one `Location` from trading across inventory,
transfers and POS at once. No business-interruption or continuity model. No
insurance-claim or attachment model anywhere in the schema.

**Surfaces and operations.** No `ServiceCase`/`Complaint`/`Ticket` model, no
SLA policy, no `dueAt`, and no case identifier threading the tables a dispute
touches. No `SavedView` or `FilterPreset`, and no selection set surviving one
page load. No total-match-count contract on the findability-critical search
paths. No partner-portal surface: a franchisee has no model, login,
permission key or UI. No shared reachability registry outside admin. No
metafield or custom-field table. No per-brand or per-location module toggle —
`MODULES` is one process-wide variable. No runtime dependency check between
module entries. No admin screen for `OutboxEvent`, the replication tables or
`AuditLog`; `nav-registry.ts` has no operations group. No alerting or paging
integration, and no runbook referenced from code. No per-node breakdown on
the readiness endpoint. No report cache for the GL reports. No per-location
running stock counter. No identity-scoped quota — global IP throttling
exists, nothing per partner, device or key. No webhook model. No AI
integration, no "suggested" field, and no human-confirmation pattern. No
client-generated idempotency key in the POS write path, and no offline queue
outside the till's own sale flow. No rollout or go-live state on `Location`
or `Node`. No guidance-text field on a permission. No training-completion
record. No `Control`, `ControlTest` or attestation model, and `audit.view` is
deployment-wide with no scope filter. No `Risk` model. No
`Filing`/`ReportTemplate` model or account-to-external-line mapping.
