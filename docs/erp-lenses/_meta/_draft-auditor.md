Candidate draft, not the adopted rule. Stance: this section is a pass/fail
instrument — each lens names an artifact a review can fail a PR for missing.

---

## Feature scope: build the whole capability, not one slice of it

The owner's own standing instruction, stated directly and repeated because it
was under-applied: naming a feature is not a request for the narrowest
technical thing those words could mean. Building "a cart" is not done at
add/remove line items — a cart nobody can check out with was never a
complete feature, only a fragment presented as one. This section is the
method for finding the rest of it, before calling anything done.

It is written to be failed against. Each lens names an artifact the plan must
contain and the diff must hold — a rule that cannot fail a review is decor.

### The shop-scale five

The original lenses, kept because they are right, in the owner's own words:

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
   to complete the real job? One that cannot carry a real transaction to
   completion is not complete, whatever fraction of it is finished.
2. **The other side of the same transaction.** Every customer-facing
   capability has an operator-facing twin — reporting, exception handling,
   intervention. Cart's twin is the abandoned-cart tracker.
3. **What happens after "done."** Returns, cancellations, disputes and refunds
   are checkout's own back half. A feature that only runs forward is half one.
4. **The integrations a real business needs, not a demo.** If the feature
   cannot go live in front of a real customer without a piece existing, that
   piece is in scope — a real gateway, not a status enum standing in for one.
5. **The policy layer that governs it.** Vouchers imply management, discounts
   imply a rules engine, a return flow implies a written policy it enforces.

Those five are the shop, and they are not sufficient. Asked of a corporate
group — several brands, 100+ locations, 100+ kinds of actor, every department
a group runs — they leave out everything below: not a second product and not
an edition, but what the same feature must carry for all three to work.

### The group-scale twenty-four

Six groups, ordered so each answers what the next assumes. One question, one
artifact; the worked example and the failure mode live in the catalogue.

**1. The actor** — everything after this group is a property of somebody.

- **The actor with three tables.** For every new actor or counterparty, name
  which table it becomes — `User`, `Party`, `Contact`, `TradingPartner`, a
  key-hash principal — and the column linking rows when it is two at once.
- **The principal with no permission key.** For every actor that is not a
  `User`, name the `PERMISSION_CATALOG` keys it is checked against, or the
  path authenticating it instead of `PermissionsGuard`, and the rows it reads.
- **The grant that ends itself.** Name what ends every grant this feature
  creates without a human remembering, and every row keyed to that `userId`
  changing in the deactivation transaction — a pending decision included.

**2. The authority** — which rows, how much, which pairs, who may change it.

- **Whose rows, and which columns.** For every list, export, schedule and
  drill-down, name the actor who gets back fewer rows and fewer columns than a
  super admin, the fields they never see, and the column carrying that scope.
- **The threshold nobody approves alone.** For each act committing money or
  stock, name the amount bands, the role per band, the quorum on the top band,
  and the method where the check runs — then the same four for the undo.
- **The toxic pair, caught at grant or at act.** Name the permission-key pair
  this feature makes toxic together and its single enforcement point: a
  refusal in `RolesService` at role-save time, or a throw at act time
  comparing the actor to a stored id.
- **Authority and blast radius.** Which roles may change this rule, at which
  scope, with a second signature or not; the worst value one may set before
  anything notices; and where the audit row carrying old value, new value,
  actor and reason is written.

**3. The act in the world** — the write as a physical event, before the books.

- **Request or record.** Classify every write: a request the system may
  refuse, or a record of what already happened and may never be refused. For a
  record, name the unconditional path and the variance row a refusal produces.
- **The movement with no address.** For every stock or cash write, name the
  `locationId` it carries and where that value comes from; if the answer is
  `defaultLocationId()`, name which of the 100+ locations that silently is.
- **Four hours down, the counter stays open.** Unavailable for four hours
  mid-trading: name every actor mid-task, what they do instead, the surface
  ingesting their paper work, its permission, and the reconciliation proving
  no fact was counted twice.

**4. The money** — what the act does to the books, and the rule computing it.

- **The unwritten posting rule.** Write the rule this feature triggers: the
  domain event, the Dr/Cr codes — naming any account the thirteen-account
  chart lacks — and the idempotency key; or name the report reconciling it.
- **Every column or none.** For every `JournalLine` this creates, name which
  of the five dimension columns it sets and to what, or declare the line
  undimensioned and name the report that may blend it across brands.
- **The period that already moved.** State what happens when this posts a fact
  dated inside a CLOSED or LOCKED `FiscalPeriod`, and name the report
  surfacing entries whose date sits outside their own period's range.
- **The second legal entity.** Name what breaks the day a second brand in a
  second country goes live: the field holding its tax label and currency, the
  counter key keeping its number series gapless, and the column letting its
  period close while the other brand's stays open.
- **Dry run before live.** Can someone replay this rule over last month's real
  records and read the diff with nothing written? The deciding function takes
  its inputs as arguments and holds no `prisma.` write and no `publish(`.

**5. The scale** — what this code costs at three editions and 100 branches.

- **Three silhouettes, and the day the tier above appears.** Draw it as one
  shop, a forty-branch chain, a group of brands. Which tier-bearing columns
  are in the first migration while never rendering on the Solo screen, and
  what is the written meaning of null in them?
- **The absent collaborator.** List every module this reads from, writes to or
  emits toward that is off by default; for each, what is still recorded, what
  replaces the control on screen, and whether absence no-ops through an
  extension point or fails Nest boot through a direct import.
- **The second copy of the write.** Name the two moments this write arrives
  twice — a retried call, a redelivered outbox event, a till replaying a sale
  that timed out — and the column, with its unique constraint, making the
  second arrival a no-op.
- **The hundred-thousandth row.** State the row count this feature's largest
  table reaches at corporate edition, the statements one page issues at that
  size, how many are served from an index, and which columns a refreshable
  figure filters and groups on are indexed today.

**6. The afterlife** — undoing it, explaining it later, erasing a person.

- **The reversal document, not the reversal flag.** Name the reverse document
  undoing each forward fact — entity, number series, amount field, foreign key
  to the original line — and show it issues for part of the original, more
  than once, until the original is exhausted.
- **The undo fan-out.** Enumerate every side effect the forward path fires and
  mark each: reverses automatically (name the method), needs a human (name the
  screen and permission), or deliberately irreversible (one sentence why).
- **The version stamp.** When someone edits this rule next quarter, what
  happens to records already created under the old one, and can the number on
  one still be explained from its own fields plus the policy version it names?
- **The erasure the ledger cannot obey.** Name every table still holding an
  erased person's identifiers once the `User` row is gone, and give each one a
  disposition — cascade, pseudonymise in place, or retain under a legal basis.
- **The failure path, and who is allowed to walk it.** When this feature's
  call or event fails for the last time, which durable store holds it, which
  screen lists it, which permission opens it, which action replays it, and
  what makes replaying it twice safe?

### The scoping pass, and how a reviewer fails it

Before code is written for a named feature, the engineer produces a **scope
map** in the work order or PR description — a written artifact, not a private
reading — in four parts:

1. **The map.** The shop-scale five, in prose. Three paragraphs is enough;
   this part says what the feature is for.
2. **The lens rows.** One row per group-scale lens: the lens, the artifact it
   demands, and where that artifact lands — a migration, a service method, a
   permission key, a screen, or a named work order.
3. **Not applicable, with the sentence that makes it true.** "This feature
   writes no money fact" is a reason. "N/A" is not, and silence is not.
4. **Sequenced out.** A separable capability the map surfaced — a CRM, a
   loyalty programme, a risk register — named as its own numbered work order,
   never silently stubbed and never silently skipped.

The review fails on any one of five findings: a lens with no row; a row naming
no artifact; an artifact named in the map and absent from the diff; a "does
not apply" carrying no reason; a conflict resolved against a recorded ruling
with no new ruling written. An otherwise correct diff still fails on them.

### The boundary, stated plainly

**A one-line fix runs no lenses; a named feature or capability runs all of
them.** Nothing sits in between: *Change minimization* and *No speculative
functionality* below still govern a bug fix, a copy change, or a request
already narrow and complete on its own terms. What the named feature cannot
work as a real capability without is **required**, not speculative, however
far it reaches. A discount field with no voucher management is not a smaller
version of the feature; a scope column left out because this client has one
brand is not a simpler schema, only a migration run later under deadline.

Detail one level down. Every lens with its worked example, done test and
failure mode — including the surface-specific ones held back above — is in
[`docs/erp-lenses/_meta/_index.md`](docs/erp-lenses/_meta/_index.md); where two pull
against each other, the ruling is already written and cited by number in
[`docs/erp-lenses/_meta/_canonical-decisions.md`](docs/erp-lenses/_meta/_canonical-decisions.md).
