# Gap audit: the enterprise-suite angle

**Angle:** I have used or reviewed SAP, Oracle Retail, Dynamics 365, NetSuite,
Shopify Plus, Lightspeed and Odoo, and I know both what they force a builder
to answer and what they get wrong in forcing it — mostly by making the
answer cost a configuration project, a consultant, or a screen nobody who
isn't a power user can find. The brief is efficiency and innovation, not
parity: name what a genuinely better system would force, specifically what
keeps this product feeling small (per `CLAUDE.md`'s "Interface architecture")
while it does what those suites do.

I read `_index.md` and `_claude-md-feature-scope.md` in full, then read the
domain files a candidate gap pointed at — `07`, `08`, `10`, `13`, `14`, `04`,
`20`, `21`, `22`, `36` — and the relevant sections of
`docs/implementation/WO-22-lens-workflow-results.md`, before writing anything
down as missing.

## What I checked and found already covered

- **Transactional multi-currency and the second legal entity.** SAP/Oracle
  force a subsidiary's own functional currency, tax label and number series.
  This catalogue already forces exactly that — *One tax regime, many legal
  entities* / *The second legal entity* (`08`) — and correctly diagnoses that
  `debitMinor`/`creditMinor` are base-currency-only today.
- **Intercompany elimination.** SAP/Oracle force a matched pair and a netting
  rule for inter-entity trade. Covered by *The other end, and what nets it
  out* (WO-22, absorbed from R17) against `ConsolidationService`, and by
  *Transfer price fixed at cost* (`10`) for the markup side of the same fact.
- **Rule impact-preview before activation.** The thing SAP's transport system
  and Dynamics' Power Automate both get partly right (a sandbox run) is
  covered here, harder than either — *Dry run before live* (WO-22) demands a
  pure, side-effect-free decision function with a second read-only caller
  replaying history, for *any* rule, not just pricing.
- **Approval reassignment on a leaver, and delegation with a clock.**
  Covered by *The approval orphaned by a leaver* and *Acting cover has no
  clock* (`04`) — the leaver and the temporary-cover cases are both forced.
- **Notification audience and escalation at zero holders.** Covered by
  *Audience is a capability, not an address* (WO-22) — a permission-scoped
  audience with a stated zero-holder escalation.
- **Findability at 10k+ products, saved views, and the capped result set.**
  Covered by `22` in full — the three lenses there are exactly the search
  and list-scale questions SAP's cryptic transaction-code search and
  Oracle's advanced-find both handle badly.
- **Cost-field redaction and the ledger's unfilled dimension columns.**
  Covered by `10`'s other two lenses — margin visibility by role, and which
  posting rule actually fills each `JournalLine` scope column.

Each of these is a real question this catalogue already forces at least as
hard as the suites I know. I did not list them as gaps.

## The gaps

### 1. Group currency translation for consolidated reporting (blocking)

**Missing question:** Once a second `RetailBrand` has its own functional
currency (which `08`'s own lens requires the builder to add), name the
group's presentation currency, the translation method for each statement —
period-end spot rate for the balance sheet, period-average for the P&L, or a
single stated method — the rate source and its effective date, and the
equity account that absorbs the resulting cumulative translation adjustment
so the consolidated balance sheet still balances.

**What none of SAP, Oracle Retail, Dynamics or NetSuite let you skip:** all
four refuse to let a second-currency subsidiary go live without a functional
currency, a group currency and a translation method configured first — it is
one of the few places these suites are *right* to force a wizard. This
catalogue does the opposite: it forces per-brand currency (`08`) and forces
elimination between brands (`10`, WO-22's netting lens) but never asks how
the two combine once they disagree in currency. `ConsolidationService` nets
`JournalLine` rows directly — it has no rate to translate through, and
nothing in `07`, `08` or `10` names one.

**What gets built wrong without it:** the day a UAE brand goes live in AED
next to a Pakistani brand in PKR — the exact worked example `08` itself
proposes — `ConsolidationService.groupProfitAndLoss()` sums the two brands'
minor-unit integers as if they were the same currency. The group P&L is not
missing a feature; it is silently wrong by whatever the PKR/AED rate is, and
nothing in the code or the tests can tell, because summing two currencies
without translating produces a number, just the wrong one, with no error to
catch it.

### 2. Financial close as a managed process, not a status flip (blocking)

**Missing question:** Name the table holding a close task — a bank
reconciliation, a per-location cash-count sign-off, an intercompany-out-of-
balance check, a fixed-asset roll-forward — its owner, its due date and its
completion evidence, and the rule that refuses `FiscalPeriodsService.
lockPeriod()` until every task for that period and every one of its 100+
locations is marked done.

**What SAP, Oracle, NetSuite and Dynamics all force that this catalogue
does not:** every one of them ships a close-task or close-checklist module
(SAP's Financial Closing cockpit, Oracle's close manager, NetSuite's period
close checklist, Dynamics' close workspace) precisely because "the period is
closed" is a claim about work having happened, not a boolean a person with
the right key can set at any moment. `07`'s *The period that already moved*
asks what happens to a fact posted after close — a real and correctly-scoped
question — but no lens anywhere asks what must be true *before* `lockPeriod()`
is allowed to run at all. `36`'s control-testing lens forces an attestation
*record*, not a *precondition* on the close transition itself; its own text
calls `lockPeriod()` "a one-way close, not a tester attestation," and stops
there rather than asking what should gate it.

**What gets built wrong without it:** at one shop, "close the month" is one
person glancing at the till tape — the gap costs nothing there, which is
exactly why it is never discovered before Org scale. At 100+ locations
across timezones, `lockPeriod()` today is checked only by
`accounting.close` — whoever holds that key can lock a period with three
branches' cash counts unreconciled, an intercompany pair still unmatched,
and no record that anyone checked. The period then reports as closed and
final to the group's own auditors while carrying known-open reconciling
items nobody was ever asked to close.

### 3. Landed cost apportionment and its timing (significant)

**Missing question:** Name the apportionment basis `allocateLandedCost`
uses to spread a shipment's freight and duty across the PO lines it landed
with — by value, weight, volume or unit count — and name what happens when
the freight or duty bill arrives, as it normally does, after the goods
receipt has already moved stock and a sale has already posted COGS from it:
does a later `SupplierBill` restate `ProductVariant.costPrice`, and if so,
through which posting rule.

**What Oracle Retail and SAP MM force that this catalogue does not:** both
ship a dedicated landed-cost object precisely because the apportionment
basis changes gross margin per SKU, and because the freight bill is almost
always a *separate*, *later* document from the goods receipt — a cost
adjustment / invoice-matching-for-landed-cost flow exists in both suites for
exactly that reason. `allocateLandedCost` is real code in this repository —
cited in `14` as evidence for a different question (physical-unit
allocation across locations, correctly distinguished there) — but no lens
asks what basis it uses or what a late landed-cost bill does to a
weighted-average `costPrice` that a sale has already consumed.

**What gets built wrong without it:** two brands importing the same SKU on
the same vessel get an apportionment basis nobody chose and can't name, so
per-brand margin (which `10`'s own lens demands be visible) is computed
from a landed cost that was never a deliberate policy. Worse, a freight
bill landing three weeks after receipt — the normal case, not the edge
case — either silently fails to touch `costPrice` at all, so COGS already
posted on the earlier, lower cost stays wrong forever with no restating
entry, or it is applied forward-only and misstates the margin on every unit
sold in between.

### 4. The approval that stalls without a leaver (significant)

**Missing question:** For a pending approval step assigned to a user who is
still active — not deactivated, not on a delegation record — name the
elapsed-time threshold after which it auto-escalates to the next holder of
the same permission at a wider scope, the field that records the escalation
happened, and who is notified that it did.

**What SAP Business Workflow, Dynamics' approval flows and Oracle EBS's
approval-management engine all force that this catalogue does not:** every
one of them ships a reminder-then-escalate timer on a pending step,
independent of whether the assignee ever leaves the company, because most
stalled approvals are not leavers — they are someone on leave with no
delegation set up, someone who missed one email, or a queue nobody is
checking on a public holiday. `04`'s *The approval orphaned by a leaver*
reassigns only when `isActive` flips to false; *Acting cover has no clock*
forces delegation to expire but does not force one to exist in the first
place; *The threshold nobody approves alone* forces the band and the quorum
but not what happens when the quorum's members simply do not act. None of
the three asks about elapsed time on an otherwise-healthy approval.

**What gets built wrong without it:** a purchase order or an inter-branch
transfer sits `PENDING_APPROVAL` against a fully active, correctly-scoped
approver who is simply not looking — a manager on leave with no delegate
named, a regional approver in a different timezone — and the transaction
stalls with no error, no alert and no query surfacing it, because every
existing lens's remedy triggers on deactivation or on an explicit delegation
window, and neither condition is true. At 100+ branches, this is the normal
failure mode, not the rare one, and it is invisible to every reconciliation
this catalogue's other lenses already force.

### 5. One search surface across every object type (moderate — the "feels small" test)

**Missing question:** Name the single query, its permission-aware row
filter, and the ranking rule (recency, frequency, exact-match precedence)
behind one search box that reaches any object type — an order, a variant, a
`Location`, a role, a pending approval, a journal entry, a case — rather
than requiring the operator to already know which of the catalogue's 30-plus
domains and screens holds it.

**What every enterprise suite I know gets wrong, and what a better one
should force instead:** SAP's answer is a transaction code memorized by
role; Oracle Retail and Dynamics answer with a menu tree several levels
deep, different per module; NetSuite and Odoo each ship a search box, but
scoped per record type, so the operator still has to know which type to
search first. All of them make "the product looks big" — `CLAUDE.md`'s own
failure test — worse as more modules ship, because navigation depth grows
with the feature count. This catalogue's `22` forces search *within* one
entity type at 10k+ rows and forces a saved view to survive; it never asks
for the one thing that would keep a hundred-plus screens feeling like "a
few features" per the prime rule — a single door into all of them, ranked
by what this actor actually touches.

**What gets built wrong without it:** every module ships its own list
screen and its own filter bar, each internally correct per `22`'s lenses,
and the sum is exactly the landfill `CLAUDE.md`'s "Interface architecture"
section warns against — not one page with too much on it, but a hundred
calm pages that only someone who already knows the org chart of the
software can find their way between. A first-time user at Org edition
correctly perceives a large product, which is the one outcome the prime
rule exists to prevent, and no lens in groups 1 through 6 catches it because
each of the hundred screens passes its own review alone.

## Result

Five gaps, not the empty list — the enterprise-suite angle surfaces real
absences here, concentrated exactly where the catalogue's own scope claims
group-scale completeness (money, approval, procurement) or where it stops
one layer short of the interface law it states elsewhere (search). Ranked
above by severity; none restates an existing lens under a new name, and each
names the artifact a built feature would be missing without it.
