# Gap innovation

Output of the `gap:innovation` agent (Gaps phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Angle

Enterprise-suite comparison (SAP, Oracle Retail, Dynamics 365, NetSuite, Shopify Plus, Lightspeed, Odoo): what those systems force that this catalogue does not, and what a genuinely better system should force that none of them do — judged on efficiency/innovation and on keeping the product feeling small at Org scale, not on feature parity.

## Verdict

Audit written to docs/erp-lenses/_meta/_gap-innovation.md. Checked and found already covered (named the covering lens): per-brand transactional multi-currency and tax label (08 "The second legal entity"), intercompany elimination (WO-22 "The other end, and what nets it out" + 10 "Transfer price fixed at cost"), rule impact-preview (WO-22 "Dry run before live"), approval reassignment on a leaver and delegation expiry (04 "The approval orphaned by a leaver" / "Acting cover has no clock"), notification audience/zero-holder escalation (WO-22 "Audience is a capability, not an address"), findability/saved-views/capped results at 10k+ products (22, all three lenses), cost-field redaction and ledger dimension columns (10's other two lenses). None of these were re-flagged. Five real gaps survived, ranked by severity, none restating an existing lens under a new name.

## Gaps

### Group currency translation for consolidated reporting

**Why:** 08's own lens forces a second RetailBrand to carry its own functional currency, and ConsolidationService already nets JournalLine rows across brands — but no lens names the group presentation currency, the translation method (spot vs. average rate per statement), the rate source/effective date, or the equity account absorbing the cumulative translation adjustment. Every major suite (SAP, Oracle, Dynamics, NetSuite) refuses to let a second-currency entity go live without this configured first. Without it, the day a UAE brand in AED sits beside a PKR brand — 08's own worked example — groupProfitAndLoss() silently sums two currencies as one, producing a wrong number with nothing to catch it.

**Severity:** blocking

### Financial close as a managed process, not a status flip

**Why:** 07's 'The period that already moved' covers what happens to a fact posted after close; 36's control-testing lens forces an attestation record. Neither asks what must be true — reconciliations done, sign-offs collected across 100+ locations — before FiscalPeriodsService.lockPeriod() is allowed to run at all. Every suite I know (SAP Financial Closing cockpit, Oracle close manager, NetSuite/Dynamics close checklists) gates the close transition on a task list, not a permission check. Without it, one accounting.close holder can lock a period with branches' cash counts unreconciled and intercompany pairs unmatched, and the period reports as final to auditors with no record anyone checked.

**Severity:** blocking

### Landed cost apportionment and its timing

**Why:** allocateLandedCost is real code, cited in 14 only as evidence for a different question (physical-unit allocation across locations). No lens asks its apportionment basis (value/weight/volume/units) or, the normal case, what happens when the freight/duty bill arrives after goods receipt has already moved stock and a sale has already posted COGS from it — does a later SupplierBill restate costPrice, and through which posting rule. Oracle Retail and SAP MM both force a dedicated landed-cost/cost-adjustment flow for exactly this reason. Without it, per-SKU margin (which 10 demands be visible) rests on an apportionment nobody chose, and a late freight bill either never touches already-consumed cost or is applied forward-only, misstating margin on everything sold in between.

**Severity:** significant

### The approval that stalls without a leaver

**Why:** 04 forces reassignment when isActive flips false, and forces a delegation window to expire — but nothing forces a time-based escalation for a pending step assigned to a still-active approver who simply isn't acting (on leave with no delegate set, wrong timezone, one missed email). SAP Business Workflow, Dynamics approvals and Oracle EBS's approval engine all ship a reminder-then-escalate timer independent of the leaver condition, because that is the common failure mode, not the rare one. Without it, a transfer or PO sits PENDING_APPROVAL against a healthy, correctly-scoped approver indefinitely, invisible to every other lens's remedy because neither deactivation nor an explicit delegation window is true.

**Severity:** significant

### One search surface across every object type

**Why:** 22 forces search and saved views within one entity type at 10k+ rows; it never asks for a single permission-aware query reaching any object type (order, variant, Location, role, pending approval, journal entry, case) ranked by what the actor actually touches. SAP's transaction codes, Oracle/Dynamics' per-module menu trees, and even NetSuite/Odoo's per-record-type search boxes all get this wrong, and it gets worse as module count grows — the opposite of CLAUDE.md's prime rule that the product feel small. Without it, a hundred individually-correct screens (each passing 22's own lenses) sum to exactly the landfill CLAUDE.md warns against: a product only someone who already knows its org chart can navigate, which is the one outcome the prime rule exists to prevent.

**Severity:** minor

