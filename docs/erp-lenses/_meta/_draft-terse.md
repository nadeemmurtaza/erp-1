Candidate draft for CLAUDE.md's "Feature scope" section, not the adopted rule.
Stance: minimum text, maximum bite — one name, one question a PR can quote.

---

## Feature scope: build the whole capability, not one slice of it

The owner's own standing instruction: naming a feature is not a request for
the narrowest technical thing those words could mean. A cart nobody can check
out with was never a complete feature, only a fragment presented as one.

The catalogue — every lens with its repository evidence, worked example and
done test — is [`docs/erp-lenses/_meta/_index.md`](docs/erp-lenses/_meta/_index.md). The
rulings for where two lenses pull against each other are in
[`_canonical-decisions.md`](docs/erp-lenses/_meta/_canonical-decisions.md).

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

1. **The transaction, start to finish.** What does the actor need, end to end,
   to complete the real job? A feature that cannot carry one real transaction
   to completion is not complete, whatever fraction of it is finished.
2. **The other side of the same transaction.** Every customer-facing capability
   has an operator-facing twin: cart's is the abandoned-cart tracker, an
   order's is the fulfilment queue, a return's is refund approval.
3. **What happens after "done."** Returns, cancellations, disputes and refunds
   are checkout's own back half, not later add-ons.
4. **The integrations a real business needs, not a demo.** A payment method is
   a gateway; a shipping method is rate, label and tracking. If the feature
   cannot go live without a piece, that piece is part of it.
5. **The policy layer that governs it.** Vouchers imply management, not only
   redemption; a return flow implies a written policy the flow enforces.

Those five scope a feature for one shop with one till. The six groups below
are what the **same feature** needs when the shop is a group: one
Organization, several brands, 100+ locations across timezones, 100+ kinds of
actor, 100+ roles, every department a corporate runs. One codebase, three
editions — a lens that makes sense for only one edition is not a lens.

### 1. The actor — everything after this is a property of somebody

- **The actor with three tables.** For every new actor or counterparty, name
  which table it becomes — `User`, `Party`, `Contact`, `TradingPartner`, a
  key-hash principal — and, where one party is two at once, the column
  linking the rows.
- **The principal with no permission key.** For every actor that is not a
  `User`, name the `PERMISSION_CATALOG` keys it is checked against, or the path
  that authenticates it instead of `PermissionsGuard`, and which rows it reads.
- **The grant that ends itself.** For every grant — role, override, admin
  scope, acting cover, time-boxed auditor — what ends it without a human
  remembering, and every row keyed to that `userId` the deactivation
  transaction must change, pending decisions included.

### 2. The authority — what bounds the act

- **Whose rows, and which columns.** Which entity does each row name — org,
  brand, node, `Location`, terminal? For every list, export, schedule and
  drill-down, name the actor who must get back fewer rows and fewer columns,
  and the exact rows and fields they must never see.
- **The threshold nobody approves alone.** For each act committing money or
  stock at a value: the amount bands, the role per band, the quorum on the top
  band, the method checking before the row leaves draft — then the same four
  for the undo, which is never the same authority as the do.
- **The toxic pair, caught at grant or at act.** Name the permission-key pair
  this makes toxic together and the single enforcement point — a refusal in
  `RolesService.create`/`.update`, or a throw at act time comparing the actor
  to a stored id — and where in the diff it lives.
- **Authority and blast radius.** Who may change this rule, at which scope,
  with whose second signature, the worst value one of them can set before
  anything notices — and the audit row carrying old value, new value, actor
  and reason. A list of changed field names is not that row.

### 3. The act in the world — the write as a physical event

- **Request or record — classify every write.** Is each write a request the
  system may refuse, or a record of what already happened and may therefore
  never be refused? For every record: the unconditional write path, the
  variance row a refusal would have been, its queue, and who clears it.
- **The movement with no address.** Name the `locationId` on every stock or
  cash write and where it comes from. If the answer is
  `InventoryService.defaultLocationId()`, name which of the 100+ locations it
  silently is, and what the branch that moved the goods sees on its shelf.
- **Four hours down, the counter stays open.** Four hours unavailable mid-
  trading: who was mid-task, what they do instead, the surface that ingests
  their paper, its permission, and the reconciliation proving no double count.

### 4. The money — what the act does to the books

- **The unwritten posting rule.** Write it out: the domain event, the Dr/Cr
  account codes — naming any the thirteen-account chart lacks — and the
  `findPostedEntry(source, sourceRef)` key. Or name the report that reconciles
  it instead, because it never reaches the ledger.
- **Every column or none.** For every `JournalLine`, which of
  `organizationId` / `retailBrandId` / `branchNodeId` / `costCentreId` /
  `counterpartyBrandId` it sets and to what — or declare it undimensioned and
  name the report that may therefore blend it across brands.
- **The period that already moved.** What happens when a fact whose own date
  falls in a `CLOSED` or `LOCKED` `FiscalPeriod` posts, and which report lists
  entries whose date sits outside their own period's range?
- **The second legal entity.** What breaks the day a second `RetailBrand` in a
  second country goes live: the field holding its tax label, registration
  number and currency; the counter key keeping its series gapless; the column
  letting its period close while the other brand's stays open.
- **Dry run before live.** Can someone replay this rule over last month's real
  records and read the diff with nothing written? The deciding function takes
  inputs and returns the outcome, with no `prisma.` write and no `publish(` in
  its body, and a second read-only caller exists.

### 5. The scale — what the same code costs at three editions

- **Three silhouettes, and the day the tier above appears.** Draw it as one
  shop, a forty-branch chain, a group of brands: which tier-bearing columns are
  in the first migration while never rendering on the Solo screen, and what
  happens to rows already written the day a tier appears above them.
- **The absent collaborator.** Every module this reads from, writes to or
  emits toward that is off by default: absent, what is still recorded, what is
  not, what the user sees instead — and whether it degrades through an event,
  or fails Nest boot through a direct coupling.
- **The second copy of the write.** The two moments this write arrives
  twice — retried call, redelivered outbox event, a till replaying a sale
  that timed out — and the column, with its unique constraint, that makes
  the second arrival a no-op.
- **The hundred-thousandth row.** The row count the largest table reaches at
  corporate edition, the statements one page issues at that size, how many are
  served from an index — and whether the columns any refreshable figure
  filters and groups on are indexed today.

### 6. The afterlife — what a narrow build always postpones

- **The reversal document, not the reversal flag.** Name the reverse document:
  entity, number series, quantity or amount field, and the foreign key to the
  specific original line — issuable for part of the original, more than once,
  until the original is exhausted.
- **The undo fan-out.** Enumerate every side effect the forward path fires,
  each marked one of three: reverses automatically (name the method), needs a
  human (name the screen and the permission), or deliberately irreversible
  (one sentence why).
- **The version stamp.** When this rule is edited next quarter, what happens
  to records already created under the old one, and can the number on one be
  explained from its own stored fields plus the policy version it names?
- **The erasure the ledger cannot obey.** Name every table still holding the
  person once the `User` row is gone — `JournalLine.contactId`,
  `AuditLog.data`, `InboundEmail.bodyText`, `OutboxEvent.payload`, a pushed
  `ReplicationRecord` — each given cascade, pseudonymise, or a named basis.
- **The failure path, and who is allowed to walk it.** On the last failure:
  the durable store it lands in with its payload, the screen listing it, the
  permission opening that screen, the action replaying it, and what makes a
  second replay safe.

### The scoping pass, and the artifact it produces

Before the first line of a named feature, the written plan gains one section:

```markdown
## Scope map
<lens name> — <answer, or `n/a — one clause why`>     (29 lines, in order)
```

An answer names an artifact: a column, a table, a permission key, a service
method, a screen, a number. Two things the map may not leave open:

- What the feature cannot be a real capability without is in scope **now**.
  What is separably larger — a CRM, a loyalty programme, payment
  orchestration — is named and sequenced as its own work order, surfaced to
  the owner, never silently stubbed and never silently skipped.
- What ships is reachable: the UI to perform it, a nav entry so it is found by
  clicking, and every permission seeded through to a real grant a live user
  holds.

A reviewer fails the PR when there is no scope map; when a line is blank,
"TBD", "handled", or any answer naming no artifact; when an `n/a` carries no
reason; or when the diff contradicts a line of it. Where two lenses pull
opposite ways, citing the ruling in `_canonical-decisions.md` is an answer;
deciding it privately inside a PR is not.

### The boundary, stated plainly

A one-line fix, a bug, or a request already narrow and complete on its own
terms gets **none** of this; *Change minimization* and *No speculative
functionality* below still govern those. A named feature or capability gets
**all** of it. The test is unchanged: something the named feature cannot work
as a real capability without is required, not speculative, however far it
reaches — a discount-code field on checkout with no voucher management behind
it is not a smaller version of the feature, it is a broken one.
