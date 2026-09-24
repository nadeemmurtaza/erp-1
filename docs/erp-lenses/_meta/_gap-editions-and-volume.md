# Gap audit: editions and volume — one build, Solo to Org

**Angle:** Take seriously that one build serves Solo, SME and Org
simultaneously — Org meaning, all at once, one Organization, several
RetailBrands, 100+ Locations across timezones, 10,000+ products and several
times that in variants, 100+ kinds of actor, 100+ named roles with a
rank/grade ladder, and every department a corporate group runs. Walk a
feature from a single shop to a corporate group and name every transition no
lens catches: schema shape, defaults, performance, who does the job when
there is nobody in that role, and what silently breaks on the day the client
grows. A lens that only makes sense for one edition is not a lens; the job is
what the SAME code must carry so all three configurations work.

I read `_index.md` and `_claude-md-feature-scope.md` in full, then the
domain files a candidate gap pointed at — `01`, `02`, `03`, `04`, `06`, `07`,
`08`, `18`, `30` — plus the relevant sections of
`docs/implementation/WO-22-lens-workflow-results.md`, `_canonical-decisions.md`
and `_conflicts.md`, and the four existing gap audits already in this folder
(`_gap-departments.md`, `_gap-innovation.md`, `_gap-repo-blindspots.md`,
`_gap-roles-ranks.md`) to make sure a finding here was not already logged
under a different angle.

## What I checked and found already covered

- **Tier-bearing schema and the day a tier appears above.** *Three
  silhouettes, and the day the tier above appears* (WO-22) already forces
  the exact discipline this angle would otherwise ask for on its own: draw
  the feature at Solo/Chain/Organization, put the tier columns in the first
  migration, default them to the `MAIN`-Location trick, and never render
  them at Solo. *The adoption test* (WO-22) covers the specific and sharper
  failure mode underneath that — human-supplied and generated uniques
  (`Order.number`, `Product.slug`, `Location.code`) that two nodes can
  generate offline and collide on at merge. Together these two are a strong,
  concrete answer to "schema shape" and "defaults" for the Solo→Org walk.
- **Modules genuinely absent at Solo.** *The absent collaborator* (WO-22)
  forces every optional module (`accounting`, `transfers`, `pos`,
  `identity-verification`, 22 in total) to degrade named-and-invisible
  rather than crash or render a dead control — this is the general answer
  to "what happens when the specialist function this feature assumes isn't
  installed."
- **Row count and query cost at Organization scale.** *The hundred-thousandth
  row* (WO-22), `29-cost-to-serve.md` in full, and `22-findability-at-scale.md`
  in full already force, per feature, the row count at Org edition, which
  columns are indexed, and what a list/search does past the 21st or
  8,400th row. This is "performance" for the walk, applied per feature
  rather than as a single generic lens, which is the right level for it.
- **Timezone and the fiscal calendar across brands.** `30-time-periods-backdating.md`'s
  three lenses — *One clock, a hundred branches*, *The calendar every brand
  shares*, *The day with no name* — cover exactly the "100+ Locations across
  timezones" transition for day-close, month-close and backdating. Nothing
  in this angle adds to that file.
- **100+ Locations inside one Organization-tier database (not one node per
  branch).** *Branch means database, not location* (`06`) already catches
  the precise failure this angle would otherwise raise: `AdminScope.branchNodeId`
  names a child *deployment*, not a `Location`, so an Org-tier single
  database holding 100+ Locations with zero `Node` rows has no column that
  can scope a floor manager to one branch. This is a direct, sharp hit on
  the task's own scale description ("100+ Locations... in one build").
- **Actor and role explosion.** *The actor with three tables*, *The
  credential with no permission key*, *The access with no end date* (`01`)
  and *Who may mint a role, and what a hundred of them costs* (catalogue,
  `02`) cover which table a new actor kind becomes, whether a non-`User`
  principal is checked at all, when an externally-sourced grant ends, and
  the cost of minting the hundredth role. I looked for a further gap in
  "kind of actor" being a fixed enum member (`PartyRoleName`) that would
  need a migration per new business-actor-kind at Org scale, and concluded
  this is not a clean gap: unlike administratively-created roles, the
  business *kinds* of actor (customer, franchisee, tax agent) are a small,
  slow-changing set even at 100+ instances of each kind, so the existing
  lens's question ("which table does it become") is the right level; I am
  not listing this.
- **Per-brand currency, tax label and number series for a second legal
  entity.** *One tax regime, many legal entities* and *Number series, one
  legal entity at a time* (`08`) already force a per-`RetailBrand` field for
  tax label, tax number, currency and an independent gapless counter. A
  prior audit (`_gap-innovation.md`) called the whole multi-currency area
  covered by this pair, citing the same two lenses. I re-checked that claim
  specifically rather than taking it on trust — see Gap 2 below for the one
  piece it does not actually force.
- **One person holding too much authority at once.** `_gap-roles-ranks.md`
  gap 3 already covers the opposite failure to the one I looked hardest
  for: a person accumulating several simultaneous grants (base role, acting
  cover, delegation) and the resolver silently taking the union's highest
  ceiling. That is authority concentrating on too few people. Gap 1 below
  is the mirror case — a control that requires *more* distinct people than
  a small deployment's roster contains — and is not the same claim.

## Gaps

### 1. No lens asks what a quorum, dual-custody or second-signature control does when the deployment's own roster cannot supply the second person — severity: blocking

**Missing question:** For every control this catalogue already demands that
requires *more than one distinct human* — the top-band quorum in *The
threshold nobody approves alone* ("two of three regional finance leads"),
the toxic-pair check in *The conflict matrix has no home* / *Detected at
grant or at act*, and *Who counts the drawer they held* ("a different
person closed and reconciled a shift than the one who opened it") — name
what the SAME write path does when this deployment's live roster contains
fewer distinct qualified holders of the required role or permission than
the control needs. Is there a named, audited fallback (single-approver-with-
a-flag, escalate to an owner role that always exists, block until a second
person is staffed), or does the control simply never fire because the
quorum can never be met?

**Why no existing lens or ruling answers it:** I grepped the full catalogue,
both hardening/generate files, `_canonical-decisions.md` and `_conflicts.md`
for "quorum," "second person," "single approver," "cannot be met," and
"collapses to" — the only hits are the lenses stating the *requirement*
(two of three; a different person; a second person holding the cash-count
permission), never a lens or ruling stating what happens when the
requirement cannot be satisfied. Ruling 6 in `_canonical-decisions.md`
makes the gap concrete rather than hypothetical: it requires an abandoned
`PosShift` to move to "a named abandoned state that requires a second
person holding the cash-count permission to close it against a physical
count" — and never states what happens at a shop where, on a given shift,
there is no second person holding that permission at all, whether because
the deployment is Solo (the task's own definition: "two or three staff, one
location, no accountant") or because the only other qualified person is off
that day. The four approval-and-delegation lenses in `04` and the three
SoD lenses in `03` are exhaustive about *timing* (grant-time vs act-time)
and *lifespan* (a delegation that expires, a pending decision reassigned on
a leaver) but never about *headcount* — none asks what the ladder does when
the roster beneath it is thinner than the ladder assumes.

**What gets built wrong without it:** The natural implementation, given
that every existing lens states the control as "name the band, the role,
the quorum" with no headcount escape hatch, is one of two silent failures,
and nothing in the catalogue would catch either: (a) the control is
implemented literally, so a Solo shop's first $5,000 purchase order can
never leave DRAFT because the deployment has one buyer and the band
requires two distinct approvers — the feature ships correct at Org and
unusable at Solo, the exact failure R14 says must not happen; or (b) an
implementer notices this and quietly adds "if only one qualified user
exists, one approval suffices," with no separate status, no audit
distinction from a real two-person quorum, and no flag an Org-tier auditor
reviewing the same code six months after the client grew to 40 branches
could use to tell a genuine dual-approval from a Solo-era single-approver
exception baked permanently into the transaction history. Ruling 6's own
abandoned-shift case is the sharpest version: a single-operator closing
shift with no second person on-site leaves the till permanently in the
abandoned state, which blocks the next day's shift open at that terminal —
"the branch that cannot trade tomorrow" (`35`) fires from a control this
catalogue itself introduced, at the edition the catalogue explicitly must
serve.

### 2. The per-brand currency field forces the invoice to say the right thing; no lens forces the ledger to convert it — severity: significant

**Missing question:** Once *One tax regime, many legal entities* (`08`)
ships a `RetailBrand`-scoped currency field so a UAE subsidiary's invoice
correctly shows AED instead of PKR, name the `FxRate` table (or equivalent),
the rate-effective-date it is keyed on, and the column on `JournalLine`
that would let `postEntry()` and `ConsolidationService` combine that
brand's postings with the Pakistani parent's into one group ledger — and
state what a consolidated trial balance does today when two brands'
currencies differ.

**Why this is a distinct artifact from what `08` already forces, and why
I am raising it despite a prior audit calling the area covered:**
`_gap-innovation.md` checked this exact territory and concluded it was
"already covered," citing the same two lenses in `08` and noting they
"correctly diagnose" the base-currency limitation. That is true of the
lenses' *Why* sections, which do name the limitation as evidence. But the
lens *question* and *done test* in `08` stop at naming a field for tax
label, tax number and currency **for invoicing and `TaxClass`/`TaxRate`
selection** — the done test is "a query proving `TaxRate` selection joins
through it." A PR can satisfy that done test in full — add
`RetailBrand.currency`, render "AED" on the UAE brand's invoices, select
the right `TaxRate` rows — while leaving `AccountingService.postEntry()`
untouched, because nothing in `08` asks about `JournalLine.debitMinor`/
`creditMinor`. Both `00c-ground-money.md` and `07-money-integrity-gl.md`'s
own "Not modelled yet" sections independently confirm the underlying fact
this gap turns on: "`debitMinor`/`creditMinor` are ALWAYS base currency,"
base currency is "a compile-time `BRAND.locale.currency` constant so one
deployment cannot serve two functional currencies," and "No `FxRate` table,
no rate source, and no period-end revaluation" — named three times as an
absence, in three separate files, and never once turned into a lens
question that a feature PR must answer. *Every column or none* (`07`) asks
which of four *dimension* columns (`organizationId`/`retailBrandId`/
`branchNodeId`/`costCentreId`) a posting rule sets; it does not ask about
*currency* at all, which is an orthogonal axis, not a fifth dimension
column.

**What gets built wrong without it:** The second `RetailBrand` in `08`'s own
worked example ships with a correct-looking AED invoice and a `RetailBrand.currency`
field that passes the lens's done test, while its sales still post in base
currency at whatever rate the developer hand-picks once at build time (or,
worse, at 1:1) because no rate table and no rate-effective-date column
exist to do otherwise. `ConsolidationService.groupProfitAndLoss()` then
sums the two brands' `JournalLine` rows as if PKR and AED minor-unit
integers were the same unit — the group's consolidated P&L is wrong in
exactly the way `_index.md`'s own line about mismatched invoice-number
series describes for a different bug: "the trial balance still reports as
zero." This is discoverable only the day the second brand's real currency
diverges meaningfully from the first — the first day it matters and, per
the same pattern this catalogue already names elsewhere, the last day it
is cheap to fix.

## Verdict

Two gaps, both graded against the strict bar the task set — a concrete
missing question and a concrete built-wrong scenario, checked by name
against the existing 146-lens catalogue, the six canonical rulings, the
conflict register, and the four prior gap audits already in this folder
before being written down. I looked hard for a third and fourth (actor-kind
as a fixed enum at 100+ kinds; department/queue ownership for a workflow
step at Org scale; concurrent-load contention on shared counters) and did
not list them: each either resolved to a repository fact already forced by
an existing lens under a different name, or did not survive its own
"what gets built wrong" test as sharply as the two above. The catalogue's
coverage of schema shape, defaults and performance for the Solo-to-Org walk
is genuinely strong — three separate, well-evidenced lens clusters
(*Three silhouettes*/*The adoption test*, *The absent collaborator*, and
the row-count/findability pair) do that work thoroughly. The two gaps that
survived are both about *headcount and money crossing a boundary the schema
already half-built for*: a control that assumes enough distinct people, and
a currency field that never reaches the ledger it was named for.
