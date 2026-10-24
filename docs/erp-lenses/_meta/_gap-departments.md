# Gap audit: the org chart, department by department

**Angle.** Walk a large retail group's org chart A to Z and name every
department whose concerns are not represented by any lens in
`_index.md` or in the twenty-four-lens CLAUDE.md section
(`_claude-md-feature-scope.md`). For each real miss, state the question
the catalogue does not force and what gets built wrong without it.

**Method.** For every department on the supplied list, searched the
catalogue table in `_index.md` by name and by synonym, then opened the
numbered domain file that claims the closest ground before deciding
"covered" or "gap." A department is covered if some lens forces an
artifact its people would actually check for — not if the department's
*name* merely appears in a file title.

## Checked and found already covered

- **Finance / GL** — 07 (`money-integrity-gl`): the posting rule, the five
  journal-line dimensions, the closed period.
- **Treasury** — 09 (`treasury-cash-reconciliation`): bank statement
  matching, cash variance.
- **Tax** — 08 (`tax-jurisdiction-invoice`): tax point, per-brand series,
  second legal entity.
- **Legal (litigation hold / evidence)** — 05 (`audit-evidence-hold`): the
  hold that outranks a delete, read-access logging. (Contract lifecycle is
  a different concern — see Gap 4.)
- **Compliance / data rights** — 23, 25: consent as a matrix, retention
  clock, erasure disposition per table.
- **Internal audit** — 36 (`internal-audit-controls-testing`): the
  `Control` row, the `ControlTest` record.
- **Risk (fraud / insider)** — 24 (`fraud-insider-risk`). A broader
  enterprise-risk-register lens ("The risk register with no register",
  file 35) was considered and explicitly **cut** as "a feature proposal,
  not a lens" — a deliberate ruling, not an oversight, so it is not
  re-listed as a gap here.
- **HR (joiner-mover-leaver only)** — 06 (`workforce-shifts-jml`): the
  deactivation transaction, shift roster. Compensation and pay are a
  different concern — see Gap 1.
- **Procurement** — 13 (`procurement-supplier-lifecycle`): three-way
  match, supplier compliance-document expiry.
- **Planning** — 14 (`planning-replenishment`): reorder point, allocation
  of short receipts, forecast-vs-commitment.
- **Warehouse / Logistics / Fleet** — 15 (`warehouse-logistics-fleet`):
  bin/location grain, custody handoff, shortage evidence. No driver or
  vehicle model exists yet, but that absence is already named in the
  file's own "Not modelled yet" list under the fleet heading, so it is a
  known migration debt, not an unrepresented department.
- **Production** — 16 (`production-bom-subcontract`): scrap reason code,
  subcontracted custody.
- **Merchandising** — 17 (`merchandising-assortment`): ranging, store
  grade, store-opening pack.
- **Retail operations / Day-two** — 26 (`day-two-operations`): paging
  threshold, staleness clock.
- **E-commerce / Omnichannel** — 21 (`omnichannel-parity`): per-surface
  permission re-check, capability reachability registry.
- **Customer service** — 20 (`service-cases-sla`): the case identifier
  threading five tables.
- **Marketing (pricing/discount + loyalty)** — 11 and 23 cover discount
  governance and the consent matrix, which is where a retail ERP's
  marketing surface actually touches data integrity. Campaign budget and
  attribution are marketing-automation concerns outside what any lens
  here claims to scope, so not counted as a gap.
- **IT / Extensibility** — 28 (`extensibility-without-fork`): which of the
  five extension doors a client ask belongs behind.
- **Franchise / Wholesale** — 19 (`channels-franchise-wholesale`):
  royalty settlement, custody-without-ownership.
- **Investor / group reporting** — the consolidation question ("the
  matching opposite entry and what eliminates the pair," WO-22 row "The
  other end, and what nets it out") is exactly inter-brand elimination,
  which is the artifact a board-level consolidated statement needs. Paired
  with "The second legal entity" (08) for per-brand books, this is
  covered.

## Gaps

### 1. HR & Payroll — compensation, leave and the pay run itself (severity: blocking)

Lens 06 forces the *access* half of HR (grant lifecycle, shift roster) but
nothing forces the *compensation* half. The catalogue's own ground-truth
list even names the hole and then never converts it into a question:
`_index.md` line 293 states plainly "no journal for production, **payroll**
or shift close" — flagged as missing, never turned into a forcing lens the
way GL, tax and treasury each got one.

**The forced question:** at Org edition, with 100+ locations and 100+
distinct actor kinds (floor staff, tailors, subcontractors, drivers), what
table represents one person's pay rate or wage agreement, what table
represents a pay run as a *document* (period, gross, statutory
deductions, net, its own number series), and which Dr/Cr codes and
`findPostedEntry(source, sourceRef)` key does a posted pay run use — the
same shape "The unwritten posting rule" already demands for every other
money-moving event?

**What gets built wrong without it:** a "payroll" feature ships as a
shift-hours report with no compensation model behind it — no wage rate
per grade, no statutory-deduction table, no GL posting, no payslip
document, no way to reverse an overpayment through "The reversal document,
not the reversal flag." The first client with 2,000 hourly staff across
100 branches discovers there is no artifact to hold what they are owed.

### 2. Facilities & asset maintenance — no surviving lens of its own (severity: significant)

File 37 is titled "Assets, equipment and maintenance" and contains three
lenses, but the catalogue table shows every one of them absorbed into a
different domain's canonical lens: "Custody has no holder" → the handoff
lens (15), "Downtime that outranks the sale" → the branch-trading lens
(35), "The register the ledger never sees" → the generic posting lens
(07). Zero rows in the table carry File 37 as their home group. The
department that owns physical assets — leases, HVAC, POS hardware,
delivery vehicles, in-store fixtures — has a numbered file and no
question that is actually about *it*: what a piece of equipment or a
lease *is* as a row, when it needs service, and who is told.

**The forced question:** which table models one physical asset (owned or
leased) distinct from the inventory it holds — with an owner department,
a location, a service-due date — and what happens on screen when that
date passes with no completed `Maintenance` row?

**What gets built wrong without it:** a facilities module gets reduced to
"a downtime flag on `Location`," because that is the only artifact the
surviving lenses ask for. There is no equipment registry, so nothing can
be scheduled for service, insured individually (distinct from "the
insured value nobody can total," which prices *stock*, not a fixed
asset), or depreciated per-unit rather than as a single ledger line.

### 3. ESG — the file's own title is a promise the file does not keep (severity: significant)

File 34 is named `34-provenance-esg-statutory.md`. Its actual heading is
"Provenance, recall and statutory reporting," and its three lenses are lot
traceability, origin claims and the regulator's external-line mapping —
none of them a sustainability metric. Its own "Not modelled yet" section
lists lot/serial gaps, origin-field gaps and filing-template gaps, and
never once mentions energy, waste, emissions or any ESG figure. A grep for
"ESG" finds the filename and nothing else in the repository's own
material — which is exactly the trap: a reviewer skimming file numbers
would credit this department as scoped when no question forces its
number.

**The forced question:** which table holds a location's (or a shipment's,
or a product's) sustainability figure — energy drawn, waste generated,
distance freighted — and what report rolls it up to the Organization
level for a disclosure filing, the same way "The regulator's own boxes"
already does for tax-shaped external reports?

**What gets built wrong without it:** an ESG disclosure feature is built
as a static PDF filled in by hand each year, because there is no per-
location or per-shipment field to aggregate from — the origin-claim field
this file does have answers "where did this come from," not "what did
this cost the planet," and the two get conflated in review because they
share a file.

### 4. Legal — the agreement itself has no table (severity: significant)

No lens anywhere asks about a contract as an object. "A boolean is not a
lifecycle" (13) gives a supplier compliance *document* an expiry date, but
that is scoped to supplier onboarding, not to the lease on a location, the
franchise agreement behind a royalty settlement (19), or the standard
terms a B2B buyer signs. Legal-hold (05) covers *preserving* a record
under litigation, which presumes the record already exists — it says
nothing about where a signed agreement's own term, renewal date and
governing jurisdiction live.

**The forced question:** for each contract-bearing relationship this
feature touches — a location's lease, a franchisee's agreement, a
supplier's terms, a B2B customer's standing contract — which table holds
the agreement's own start date, term, renewal or auto-termination rule and
governing jurisdiction, distinct from the operational relationship
(`Location`, `TradingPartner`, `Supplier`) it governs?

**What gets built wrong without it:** a franchise or lease feature reads
the operational row (`Location.isActive`, `TradingPartner.kind`) as if it
were the contract, so nothing tells legal that a lease expires in 60 days
or that a franchise agreement's renewal window just opened — the
100-plus-location group discovers a lapsed lease when a location goes
dark, not sixty days before.

### 5. Quality assurance — no inspection, no non-conformance (severity: minor)

Neither the production file (16) nor the procurement file (13) asks a
quality question. 16 covers scrap *quantity* ("The scrap that has no
reason code") but not a pass/fail inspection result; 13 covers a
supplier's *compliance document* (a certificate's expiry) but not an
inbound *goods* inspection or a non-conformance record raised against a
specific receipt or production batch.

**The forced question:** for a receipt from a supplier or an output batch
from production, what table records an inspection's result (pass, fail,
conditional) and, on a fail, what happens to the stock — is it the same
`StockVariance` row "Shortage with no reason, no evidence" (15) already
demands, or a separate non-conformance record with its own disposition
(return to supplier, scrap, rework)?

**What gets built wrong without it:** a "quality" screen becomes a free-
text note on the goods receipt with no queryable outcome, so nothing can
answer "what fraction of supplier X's shipments failed inspection this
quarter" — the question a QA department exists to answer.

## Verdict

Five gaps, none a restatement of an existing lens under a different name:
payroll's posting artifact, a standalone facilities/asset-maintenance
lens, ESG's own metric (as opposed to the origin-claim field its file
otherwise delivers), a contract-as-object table for Legal, and an
inspection/non-conformance record for QA. Ranked: HR & Payroll first
because it is money-posting scope explicitly named as missing and never
converted to a question; Facilities and ESG next because each has a
numbered file that does not deliver on its own title; Legal fourth because
its gap is real but partially adjacent to the supplier-compliance lens
that already exists; QA last because its blast radius is narrower — a
missing report, not a missing ledger entry or a missing agreement.
