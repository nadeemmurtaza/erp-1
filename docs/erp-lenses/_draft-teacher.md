Candidate draft, not the adopted rule. Stance: the worked examples carry the
weight — each group opens with one real case from this repository, and its
lenses fall out of that case rather than standing above it.

---

## Feature scope: build the whole capability, not one slice of it

The owner's own standing instruction, stated directly and repeated because it
was under-applied: naming a feature is not a request for the narrowest
technical thing those words could mean. Building "a cart" is not done at
add/remove line items — a cart nobody can check out with was never a complete
feature, only a fragment presented as one.

### The shop-scale five, in the owner's own words

> Cart depends on saved addresses, shipping methods, payment methods, voucher
> and discount application — the customer cannot complete a purchase without
> them. The merchant side needs an abandoned-cart tracker, stage-of-abandonment
> visibility, transactional email to bring the customer back. After a sale
> completes, the customer can return it — so a return-item portal and a
> written return policy are part of the same feature, not later work. Real
> payment and delivery-partner integrations are part of it, not a status enum
> standing in for one. Vouchers imply voucher creation and management, not
> only redemption at checkout.

Five lenses generalize that example. They are what makes a feature whole at
one shop, they cost minutes, and they set the shape — run them first:

1. **The transaction, start to finish.** What does the actor need, end to end,
   to complete the real job? A feature that cannot carry one real transaction
   to completion is not complete, whatever fraction of it is finished.
2. **The other side of the same transaction.** Every customer-facing
   capability has an operator-facing twin: cart's is the abandoned-cart
   tracker, an order's the fulfilment queue, a return's the refund approval.
3. **What happens after "done."** Returns, cancellations, disputes and refunds
   are checkout's own back half, not later add-ons; a feature that only runs
   forward is half a feature.
4. **The integrations a real business needs, not a demo.** A payment method is
   a gateway; a shipping method is a delivery partner with rate, label and
   tracking. If it cannot go live without a piece, that piece is in scope now.
5. **The policy layer that governs it.** Vouchers imply management, not only
   redemption; discounts imply a rules engine, not a hardcoded percentage; a
   return flow implies a written policy the flow actually enforces.

### The same feature when the shop is a group

The five say nothing about which of a hundred kinds of actor may act, whose
rows they see, which of a hundred locations the stock moved at, or what the
ledger does about it. Six groups answer that, each opening on a real case here.

**1. The actor.** A franchisee's manager signs into a till and also buys stock
from the brand: three rows, one person. `User` has no link to `Party`, and
`TradingPartner` authenticates by key hash, never reaching `PermissionsGuard`.

- **The actor with three tables** — name which table each new actor or
  counterparty becomes (`User`, `Party`, `Contact`, `TradingPartner`, a
  key-hash principal), and where one party is two of them, the linking column.
- **The principal with no permission key** — for every non-`User` actor, name
  the `PERMISSION_CATALOG` keys it is checked against, or the path that
  authenticates it instead, and what bounds the rows it may read.
- **The grant that ends itself** — name what ends each grant without a human
  remembering, and every row keyed to that `userId`, a pending decision
  included, that the deactivation transaction must change in one commit.

**2. The authority.** `OrdersAdminController` carries one class-level
`@RequirePermission('orders.manage')`, so the key that lets a junior edit a
staff note also pushes a DELIVERED order to RETURNED — any value, any branch.

- **Whose rows, and which columns** — which entity does each row name, and
  which signed-in actor must get back fewer rows and fewer columns than a
  super admin, on the list, the export, the schedule and the drill-down alike?
- **The threshold nobody approves alone** — name the amount bands, the role
  each needs, the quorum on the top one, and the method that checks before the
  row leaves draft; then the same four for the undo, never the same authority.
- **The toxic pair, caught at grant or at act** — name the permission-key pair
  this feature makes toxic together, and the one enforcement point: a refusal
  in `RolesService.create/.update`, or a throw comparing actor to stored id.
- **Authority and blast radius** — which roles may change this rule, at which
  scope, with a second signature or not, what is the worst value one can set
  before anything notices, and where is the audit row with old and new?

**3. The act in the world.** The truck leaves Branch A at 09:40, the uplink
drops at 09:45, the goods reach Branch B at 14:00: the stock moved whether or
not the API agreed — and `adjust()` would post it to `defaultLocationId()`.

- **Request or record — classify every write** — is each write a request the
  system may refuse, or a record of what already happened and may never be?
  Every record names its unconditional path, its variance row, its clearer.
- **The movement with no address** — name the `locationId` on every stock or
  cash write and where it comes from; if it is `defaultLocationId()`, name
  which of the 100+ locations that silently is, and what that branch sees.
- **Four hours down, the counter stays open** — name every actor mid-task,
  what they do instead, the surface that ingests the work they did by hand,
  the permission guarding it, and the reconciliation proving nothing doubled.

**4. The money.** A December sale is refunded in March. `reverseEntry()` dates
the reversal `now` and resolves the period from it, so the credit lands in
March; `FiscalPeriod` has no brand column to close one brand at a time.

- **The unwritten posting rule** — write it out: the domain event, the Dr/Cr
  codes, naming any the thirteen-account chart lacks, and the
  `findPostedEntry(source, sourceRef)` key — or the report that reconciles it.
- **Every column or none** — for every `JournalLine`, name which of
  `organizationId` / `retailBrandId` / `branchNodeId` / `costCentreId` /
  `counterpartyBrandId` it sets, or declare it undimensioned and name the
  report that may therefore blend it across brands.
- **The period that already moved** — what happens when the fact's own date
  falls in a CLOSED or LOCKED `FiscalPeriod`, and which report surfaces the
  entries whose date sits outside their own period's range?
- **The second legal entity** — name what breaks when a second `RetailBrand`
  in a second country goes live: the field holding its tax label and currency,
  the counter key keeping its series gapless, the column that closes it alone.
- **Dry run before live** — can someone replay this rule over last month's
  real records and read the diff with nothing written? The deciding function
  takes its inputs as arguments, with no `prisma.` write and no `publish(`.

**5. The scale.** Draw the stock adjustment screen three times: Solo is
quantity, reason, save, with `locationId` resolving to MAIN and never rendered;
the chain adds a Location column; the group posts a shrinkage journal.

- **Three silhouettes, and the day the tier above appears** — which
  tier-bearing columns must be in the first migration while never rendering on
  the Solo screen, and what happens to rows written before the tier existed?
- **The absent collaborator** — for each module this reads, writes or emits
  toward that is off by default: what is still recorded, what silently is not,
  and does it no-op through an extension point or fail Nest boot outright?
- **The second copy of the write** — name the two moments this write arrives
  twice, and the column, with its unique constraint, that makes the second a
  no-op; then what the loser of a simultaneous write sees on screen.
- **The hundred-thousandth row** — state the row count the largest table
  reaches at Org, the statements one page issues at that size, how many the
  database serves from an index, and which column behind a refreshable figure.

**6. The afterlife.** `PaymentsService.refund()` takes a partial amount;
`onPaymentRefunded()` ignores it and reverses the receipt and the sale in full,
so a token goodwill refund erases the whole sale from the ledger.

- **The reversal document, not the reversal flag** — name the reverse document
  for every forward fact: entity, number series, amount field, FK to the
  original line — and show it issues for part, repeatedly, until exhausted.
- **The undo fan-out** — enumerate every side effect the forward path fires
  and mark each: reverses automatically (name the method), needs a human (name
  the screen and permission), or is deliberately irreversible (one why).
- **The version stamp** — when this rule is edited next quarter, what happens
  to records already created under the old one, and can the number on one
  still be explained from its own stored fields plus the version it names?
- **The erasure the ledger cannot obey** — name every table still holding a
  person's identifying data once the `User` row is gone —
  `JournalLine.contactId`, `AuditLog.data`, `OutboxEvent.payload`, a pushed
  `ReplicationRecord` — and give each cascade, pseudonymise, or retain.
- **The failure path, and who is allowed to walk it** — when the call or event
  fails for the last time, which durable store holds it, which screen lists
  it, which permission opens that screen, and what makes a second replay safe?

### The scoping pass, and how it fails a PR

Run the five, then the six groups in order, and write the answers into the
plan ("Plan before build" below) under `### Scope lenses` — one line per lens,
carrying the answer or `n/a` plus the reason it does not apply here. That
block is the deliverable of the pass, reviewed before code exists, not after.

A reviewer fails the PR, naming the offending line, on any of these:

- a lens with no line, or a line with neither an answer nor an `n/a`
- an `n/a` whose stated reason the diff contradicts
- an answer the code does not carry — a scope column the plan promised and the
  migration does not have
- a write the plan never classified REQUEST or RECORD
- a permission key named in the plan that reaches no `ROLE_PERMISSION_SEED`
  grant, only a `Permission` row
- a scope column shipped nullable with no written meaning for null

### The boundary, stated plainly

None of this reaches a bug fix, a one-line change, or a request already narrow
and complete on its own terms — *Change minimization* and *No speculative
functionality* below govern those, and a lens run on a typo is scope creep
wearing a checklist. All of it reaches a named feature or capability, every
group, every time. Something the named feature cannot work as a real
capability without is **required**, not speculative, however far it reaches: a
discount-code field with no voucher management behind it is not a smaller
version of the feature, it is a broken one. Anything the pass surfaces that is
a separable capability on its own — a full CRM, a loyalty programme — is
named, planned and sequenced as its own work order, never silently stubbed.

The full catalogue — every lens above plus the seventy narrower ones behind
them, each with its question, worked example and done test — is
[`docs/erp-lenses/_index.md`](docs/erp-lenses/_index.md). Where two lenses
pull against each other the ruling is already written:
[`docs/erp-lenses/_canonical-decisions.md`](docs/erp-lenses/_canonical-decisions.md)
settles the ledger against the right to erasure, the offline till against the
approval gate, and dry run against the single writer.
