# 179 — Pilot rollout: ten integration patterns, then 40, then 150, then the full engine — and parallel running before any financial cutover

> **Status: proposed (2026-09-27), not yet built.** A sequencing document with
> one new artifact: the evidence record of a system-of-record cutover (§5.3).
> Everything each wave runs is specified in docs 169–176; this document decides
> **which SMEs, in which posture, in which order, and what must be true before
> the next wave starts.** It gives no calendar dates: those depend on NEWAX's
> own UAE launch plan and, for Wave 2, on the UAE Ministry of Finance's
> published e-invoicing phases, which are to be taken from the Ministry's own
> publications at the time — never assumed here.
>
> **Revised (2026-09-28), ADR-072.** SMEs reach every wave through NEWAX's own
> sales, onboarding and agency channel (doc 11's Agency-Managed track, the
> self-serve trial of docs 51/154) — not through any telecom's bundled
> distribution; the cutover's third signatory is NEWAX's own program owner.

## 1. Select patterns, not companies

The pilot's risk is not whether 10 SMEs like the product. It is whether the
**integration shapes** those SMEs run can be connected, mapped, confirmed and
simulated on. Ten SMEs with the same POS and the same accounting package test one
shape ten times. So Wave 0 selects **ten distinct integration patterns** — each a
combination of source systems and record kinds (doc 172 §4) — and one SME per
pattern.

## 2. Wave 0 — ten patterns, one SME each

| # | Pattern | Sources → connector (doc 172 §3) | Record kinds exercised | What it proves | Expected derivability (doc 177) |
|---|---|---|---|---|---|
| 1 | **Retail: POS + spreadsheets** | POS export → `FileConnector`; purchase log → `UPLOAD` CSV/XLSX | `PRODUCT`, `LOCATION`, `STOCK_POSITION`, `SALE_LINE`, `SUPPLIER`, `SUPPLIER_ITEM`, `SUPPLIER_BILL` | The spreadsheet ceiling (9500) and name-only matching against POS item codes | Derivable if the purchase log is item-level |
| 2 | **Services: accounting only** | Accounting API → `PollConnector` + `OAuthConnection` | `CUSTOMER`, `SALES_INVOICE`, `SUPPLIER`, `SUPPLIER_BILL`, `CASH_BALANCE` | The API ceiling; AR from `Invoice`; the services-mode screen (WO-177.4) | Partially — liquidity and obligations |
| 3 | **Distributor: inventory + accounting** | Warehouse/inventory export → `FileConnector`; accounting API | all stock and AP/AR kinds | Two systems describing the same items: cross-source resolution, `ENTITY_CONFLICT_WITH_SOR` | Derivable |
| 4 | **Hospitality: POS + manual** | POS webhook or export; purchases by hand → `UPLOAD` | `PRODUCT` (menu items), `SALE_LINE`, `SUPPLIER_BILL` | A POS that pushes (`InboundWebhookEndpoint`); **the recipe boundary**: ingredients consumed by menu items are a BOM, which is not derivable (doc 177 §3) — the pilot shows supplier obligations and menu-item demand, and states that ingredient stock-outs are out of reach | Partially |
| 5 | **Contractor: Excel + bank** | Job-costing workbook → `UPLOAD` XLSX; bank statement → camt.053 or the bank's CSV via `FileConnector` | `SUPPLIER`, `SUPPLIER_BILL`, `CUSTOMER`, `SALES_INVOICE`, `CASH_BALANCE` | XLSX (pending the doc 172 §3 dependency decision); an observed bank balance feeding cash (doc 173 §4.3) | Partially — liquidity and obligations |
| 6 | **E-commerce storefront + accounting** | Storefront order API → `PollConnector`; accounting API | `SALE_LINE` (web orders, item-level), `PRODUCT`, `CUSTOMER`, AP kinds | A second demand source with a web location; a paginated feed under timeouts (doc 172 §10) | Derivable if stock is available from the storefront |
| 7 | **Import trader with foreign-currency suppliers** | Accounting API with multi-currency bills | `SUPPLIER` (with `country`, `currency`), `SUPPLIER_BILL` in USD/CNY/EUR, `SUPPLIER_ITEM` | R16's quadruple and WO-173.3's base-currency sums; the heavy-FX line (≤ 40% foreign AP, doc 177 §4) | Derivable below the FX line |
| 8 | **Structured e-invoices + POS** | Supplier invoices received as PINT AE through the SME's ASP; POS export | `SUPPLIER_BILL` and `SUPPLIER_ITEM` at the 10000 ceiling | The highest-confidence source; doc 169 §8's table read in reverse — **conditional** on the SME having an ASP relationship at pilot time | Derivable |
| 9 | **Multi-branch retail, one POS per branch** (2–5 branches) | One `FileConnector` per branch export | `LOCATION` per branch, per-location `STOCK_POSITION`/`SALE_LINE` | `authoritativeLocationIds` per mapping; per-location freshness; later, a branch moving onto the platform alone (Wave 3) | Derivable; transfers only once done on the platform |
| 10 | **B2B wholesaler with credit terms** | Accounting API (item-level sales invoices) + bank feed | `CUSTOMER` with TRN → `Party` CUSTOMER (doc 169 §3.1), `SALES_INVOICE`, `CASH_BALANCE` | AR authority (doc 173 §4.2), customer concentration (doc 174 question 1), the B2B buyer identity PINT AE needs | Derivable |

**How an SME is chosen for a slot:** NEWAX's own sales and onboarding team
nominates, from SMEs that reach NEWAX directly, through the public `/pricing`
page and trial sign-up (`PlansService.getPlanComparison()`, doc 154;
`SignupService`, `TenantStatus.TRIAL`, doc 51), or through an Agency-Managed
engagement (doc 11 §5); the SME confirms it controls the data (doc 177 §3's last exclusion); the pre-pilot sample
run (WO-177.3) through doc 172's pure front half shows the pattern's
derivability; the SME accepts the pilot's data terms (doc 181). The accounting
package and POS for patterns 2, 3, 6, 7 and 10 are chosen from what the
nominated SMEs actually run — the connector design does not change with the
vendor (doc 172 §3).

**Wave 0 exit gate — every item, or Wave 1 does not start:**
- each of the ten patterns has reached *confirmed mapping → promoted batch →
  one simulation on its own data* (`ResilienceSimulation.usedIngestedData`), or
  is documented as failing with the reason and removed from the pattern set;
- the fault-injection suite (WO-176.3) is green against every connector kind in
  use;
- a measured RTO is recorded in `DEPLOYMENT.md` from a real restore (doc 176 §6);
- the preconditions are merged: currency sweep (WO-170.3), fail-closed callbacks
  (WO-175.1), the planning currency fixes (WO-173.1–173.4).

## 3. Wave 1 — connect-only, 40 tenants

**Posture.** Every tenant's Build Manifest (doc 171): the core defaults plus
`connectors`; `accounting`, `settlements`, `wallet`, `pos` off. The SME's own
systems stay the system of record for every fact (doc 169 §5); this platform
observes, scores, simulates and recommends. No payments, no invoices issued here.

**Composition.** Four SMEs per surviving Wave 0 pattern, weighted toward the
patterns NEWAX's own pipeline shows most often (Wave 0's nominations and the
trial sign-ups are the evidence, not a forecast); a mix of Solo and 2–5-branch
tenants.

**Running.** Rings on (doc 171): NEWAX's own internal tenants in `CANARY`;
Wave 1 tenants in `EARLY`. The SLI sampler (doc 176 §5) on. Support only through
purpose-scoped grants (doc 170 §4).

**Wave 1 exit gate:**
- connect success ≥ **85%** (doc 180 §1);
- time to first value ≤ **5 days** at the median, measured, not estimated (doc
  180 §2);
- revenue-linked dependency coverage ≥ **80%** for every tenant assessed
  *derivable* (doc 180 §4);
- SLIs 1, 3 and 4 within budget for 30 consecutive days (doc 176 §5);
- zero cross-tenant isolation findings in the period, and the doc 39 isolation
  test green on the production cluster.

## 4. Wave 2 — invoicing migrated, 150 tenants

**Posture.** SMEs issue their sales documents on this platform (native `Order`
→ `Invoice`, doc 169 §3.4); a licensed PSP integrated through `PaymentProvider`
collects (doc 175); PINT AE submission
through an ASP once the SME's mandate applies (doc 181). **Their legacy
accounting package stays the ledger through parallel running**; `accounting` is
added to the manifest only at cutover (§5).

**Prerequisites specific to Wave 2** (named work, not assumed):
- **An opening-balance door into the ledger.** The lens index: "No
  opening-balance or manual-journal entry point into `postEntry()`" —
  `postEntry()`'s only callers are event handlers and year-end close. A tenant
  whose ledger moves here needs AR, AP, bank and inventory opening balances
  posted once, balanced, audited evidence-class. An `accounting` work order,
  sequenced before the first cutover.
- **`Payment.invoiceId`** (WO-175.9) if invoice-keyed collection is required by
  then; otherwise collection stays order-keyed (doc 175 §2).
- **The runtime legal identity decision** (doc 170 §6, WO-168.3) — a tax invoice
  prints the SME's TRN, which cannot come from a compile-time `brand.ts`.

## 5. Parallel running and the financial cutover

### 5.1 What parallel running checks, every day, automatically

During parallel running the legacy accounting connector keeps polling —
read-only, exactly as in Wave 1 — but its role changes: from the system of
record to a **verification source**. For every document issued natively, the
comparison reads the legacy system's copy through the same `ExternalRecordLink`
machinery (native `Invoice` id ↔ the legacy system's id for the same document)
and checks:

| Check | Tolerance | Source on each side |
|---|---|---|
| Document present in both, per day | exact count | `Invoice`/`Order` ↔ ingested `SALES_INVOICE` |
| Net, VAT and gross per document | **exact, to the minor unit** — integer minor units leave no rounding excuse | `Invoice.subtotalMinor/taxMinor/totalMinor` ↔ the legacy document |
| Customer, issue date, due date per document | exact | same |
| AR balance per customer | exact at day end | the native AR (ledger-first, doc 173 §4.2) ↔ legacy AR |
| Payments applied per document | exact | `Payment` ↔ legacy receipts |
| VAT for any return period that closes inside the window | exact | native tax lines ↔ legacy VAT report |

Every difference must carry one **named reason** — `TIMING` (booked the next
day on one side; must clear within 2 days), `MAPPING` (a tax code or account
mapped wrongly — a fix and a re-run), `NOT_EXPORTED` (the legacy side has not
received it yet), or `DEFECT` (a bug; blocks the gate). **Zero differences may
remain unexplained at any day's end.**

### 5.2 The go/no-go gate

Cutover — the day this platform becomes the system of record for the SME's
invoices and ledger — requires **all** of:

1. at least **30 consecutive days** of parallel running;
2. at least **one complete month-end close** inside that window, reconciled;
3. **zero unexplained differences** on any day, and zero open `DEFECT`s;
4. if a VAT return period ends inside the window, its figures reconcile exactly;
   otherwise, the first native return is prepared from both systems and
   compared before filing;
5. opening balances posted and tied out to the legacy trial balance at the
   cutover date;
6. the tenant's Build Manifest frozen (`frozenUntil`, doc 171) for the window
   and for 14 days after cutover — no release moves a tenant mid-cutover.

And **three sign-offs from three different people**, none of whom may sign
twice (the maker-checker shape `approveWriteoff()` and `approveRollout()`
already enforce):

| Signatory | Attests |
|---|---|
| The SME's owner or finance lead | these are our books — the reconciled figures are correct |
| NEWAX's implementation lead | every difference in the window was classified and every defect fixed |
| NEWAX's program owner — never the same person as the implementation lead | the gate's criteria 1–6 are met for this tenant |

Both NEWAX signatories work for the same company, so the distinct-person rule is
what keeps the program owner's signature a check on the implementation lead's
work rather than a second copy of it.

### 5.3 The cutover evidence record

Nothing in the schema records "on this date, for this fact kind, the system of
record moved from source X to this platform, on this evidence, signed by these
people" (checked: no model with *cutover*, *system of record* or *parallel* in its
name exists in `apps/api/prisma/schema/`). It is the one artifact this document
adds:

```prisma
// connectors.prisma — additive (the connectors module owns the
// system-of-record window, doc 169 §5, so it owns the record of moving it)
enum CutoverStatus { PARALLEL_RUNNING READY SIGNED EFFECTIVE ABANDONED }

model SystemOfRecordCutover {
  id                String   @id @default(cuid())
  /// "SALES_INVOICE" | "SUPPLIER_BILL" | "LEDGER" | "SALE_LINE@<locationId>" …
  factScope         String
  fromConnectorId   String   // the external system that was authoritative
  parallelFrom      DateTime
  parallelUntil     DateTime?
  status            CutoverStatus @default(PARALLEL_RUNNING)
  /// StorageService key of the final variance report (every day, every
  /// difference, every reason) — the evidence, retained with the SME's
  /// financial records.
  varianceReportKey String?
  /// [{ role: "SME_OWNER" | "NEWAX_LEAD" | "NEWAX_PROGRAM_OWNER", userId, signedAt }]
  /// — three distinct userIds, enforced at sign time.
  signoffs          Json
  effectiveAt       DateTime?
  createdAt         DateTime @default(now())

  @@unique([factScope, fromConnectorId, parallelFrom])
  @@index([status])
}
```

`EFFECTIVE` is written in one transaction with the mapping change it
authorises: the legacy connector's mapping for that fact scope gets
`authoritativeUntil = effectiveAt` (doc 172 §4), so the handover is a date, not
an overlap, and the native writer's first fact is dated after it. The same
transaction publishes `connectors.cutover_effective` (`{ cutoverId, factScope,
effectiveAt }` — a record kind and at most a location id, no amount) through
the outbox; doc 180 §0's poller reads it for the `CUTOVER_EFFECTIVE`
milestone. Each signature
is an evidence-class audit row. The two NEWAX signatories sign inside the
tenant under a purpose-scoped support session (doc 170 §4.2's grant gains the
purpose `CUTOVER_SIGNOFF`, and nothing else) — the SME's own signatory is an
ordinary user holding the existing `accounting.manage_periods` ("Open, close and
lock fiscal periods", `packages/shared/src/permissions.ts:711`), because a
cutover is dated at a period boundary and moves where the books are kept — the
same authority, no new key. The sign route carries `@SessionOnly()`: a
signature attests a person, and a personal API key is not one.

**Abandon, before `EFFECTIVE`:** native issuing stops; the legacy system was
the ledger throughout, so nothing needs undoing. **After `EFFECTIVE`:** moving
back is a new cutover in the other direction, with its own parallel running —
never a flag flipped back.

## 6. Wave 3 — the full engine

**Posture.** POS on the platform (native `POS_SALE` movements, per location,
each location's `SALE_LINE` mapping ended by its own cutover); purchasing on the
platform (purchase orders and goods receipts — which start feeding
`SupplierLeadTimeObservation`, R25, so lead time becomes a distribution);
transfers on the platform (lateral edges appear — `TRANSFER_STOCK` becomes
possible); decisions measured against outcomes (doc 174 §3.5).

**Gate from Wave 2:** every Wave 2 tenant that cut over has run 60 days on the
native ledger with its month-end closes completed on the platform, and no
`DEFECT` from parallel running is open anywhere in the fleet.

## Scope lenses

Ingestion lenses are doc 172's, money lenses doc 175's. These answer this
document's own artifact — `SystemOfRecordCutover` — and the wave gates.

**The actor with three tables** — the three signatories are `User`s (the two
NEWAX signatories acting through a support session with the single purpose
`CUTOVER_SIGNOFF`); no new actor type.
**The principal with no permission key** — n/a: no keyless principal is
introduced. The SME's signatory signs under `accounting.manage_periods` on a
`@SessionOnly()` route; NEWAX's two sign through a support session whose
grant names `CUTOVER_SIGNOFF` and nothing else (doc 170 §4.2).
**The grant that ends itself** — the signing support session ends with its
grant; `frozenUntil` ends the manifest freeze without a human remembering.
**Whose rows, and which columns** — the cutover record and variance report are
visible to the tenant's `accounting.view` holders and the signing session; the
control plane sees only the status.
**The threshold nobody approves alone** — the cutover needs three distinct
signatories (§5.2), enforced at sign time; the record stores all three.
**The toxic pair, caught at grant or at act** — the NEWAX implementation lead
who classified the variances cannot also sign as the program owner: distinct
`userId`s are enforced at the act.
**Authority and blast radius** — moving the system of record is the widest act
in the program; it is bounded to one tenant and one fact scope per record.
**Audience is a capability, not an address** — a day with an unexplained
difference notifies the tenant's `accounting.view` holders and the implementation
lead through the action hub; a stalled parallel run (no comparison for 2 days)
escalates to NEWAX's program owner.
**Request or record — classify every write** — signing is a REQUEST; the
variance report is a RECORD; `EFFECTIVE` is a RECORD of the authorised switch.
**The movement with no address** — `factScope` names the location for
location-scoped facts (`SALE_LINE@<locationId>`).
**Four hours down, the counter stays open** — during parallel running the SME
trades on its legacy system; this platform's outage delays a comparison, never
a sale.
**The unwritten posting rule** — at cutover, opening balances post through the
new opening-balance door (§4) with `source: 'cutover'` and
`sourceRef: <cutover id>`, idempotent by `findPostedEntry`.
**Every column or none** — opening-balance lines set the tenant's own
brand/node dimensions (one brand, one node).
**The period that already moved** — cutover is dated at a period boundary (the
day after a month-end close) so no fact straddles two ledgers inside one period.
**The second legal entity** — one tenant, one entity, one cutover per fact
scope.
**Dry run before live** — parallel running *is* the dry run, for 30 days, with
every difference named.
**Click the number** — every figure in the variance report links to the two
documents compared.
**Three silhouettes, and the day the tier above appears** — a multi-branch SME
cuts over per location for sales (`SALE_LINE@<locationId>`), one branch at a
time.
**The absent collaborator** — `accounting` off until cutover (Wave 1 posture);
turning it on is the manifest change the cutover authorises.
**The second copy of the write** — `@@unique([factScope, fromConnectorId,
parallelFrom])`; `EFFECTIVE` can be written once.
**The hundred-thousandth row** — a handful of cutover records per tenant; the
variance report is a file, not rows.
**The adoption test** — n/a: no generated code.
**The reversal document, not the reversal flag** — moving back is a new cutover
record in the other direction, never an edited status.
**The undo fan-out** — `EFFECTIVE` ends the legacy mapping's authority
(automatic), adds `accounting` to the manifest (human, NEWAX hosting operations, doc 171),
posts opening balances (automatic, once), and publishes
`connectors.cutover_effective`, whose milestone is deliberately irreversible
(doc 180) — moving back is a new cutover, so it gets its own record.
**The version stamp** — the record keeps the variance report and signatures as
they were; a later policy change never re-opens a signed cutover.
**The erasure the ledger cannot obey** — the variance report can contain
customer names and amounts; it is retained under the SME's own financial-record
basis (ruling 1), and a customer's erasure pseudonymises names in any regenerated
copy, never the signed original, whose retention is the named basis.
**The failure path, and who is allowed to walk it** — a gate not met leaves the
cutover in `PARALLEL_RUNNING`, listed with the failing criterion; abandoning is
a signed act.

## Work orders

**WO-179.1 — Pattern selection kit**: the ten-pattern matrix as a checklist,
the sample-run procedure (WO-177.3), the data-terms acceptance.
**WO-179.2 — Parallel-running comparator**: the daily comparison of §5.1 over
native documents and read-back ingested documents, the variance classification,
the report into `StorageService`.
**WO-179.3 — `SystemOfRecordCutover`** and its three-signature flow, with the
`CUTOVER_SIGNOFF` support purpose, and `connectors.cutover_effective` published
in the `EFFECTIVE` transaction (payload contract test in doc 176 §7).
**WO-179.4 — Opening-balance door** into `postEntry()` (an `accounting` work
order, prerequisite of the first cutover).
**WO-179.5 — Wave gate reports**: each gate's criteria computed from doc 180's
metrics and doc 176's SLIs, rendered for NEWAX's program owner.

## Acceptance

- A Wave 1 tenant's manifest excludes `accounting`, `settlements`, `wallet` and
  `pos`, verified by `GET /meta` against the manifest.
- The comparator flags a one-fils VAT difference on one document as unexplained
  until classified.
- A cutover cannot reach `SIGNED` with two signatures from the same user, nor
  `EFFECTIVE` before 30 days and one month-end close.
- `EFFECTIVE` sets the legacy mapping's `authoritativeUntil` in the same
  transaction; afterwards, a legacy document dated after `effectiveAt` is
  ingested as a verification record only, never as authoritative.

## Out of scope

Calendar dates. Migrating historical ledger detail (only opening balances move;
history stays in the legacy system and is reachable through its ingested copy).
Payroll cutover (payroll is not in this program). Organization-edition groups
(doc 177).
