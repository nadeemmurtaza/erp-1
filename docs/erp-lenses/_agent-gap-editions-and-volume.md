# Gap editions and volume

Output of the `gap:editions-and-volume` agent (Gaps phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Angle

Take seriously that one build serves Solo, SME and Org simultaneously (Org = one Organization, several RetailBrands, 100+ Locations across timezones, 10,000+ products/variants, 100+ actor kinds, 100+ named roles with rank/grade, every corporate department). Walked a feature from single shop to corporate group looking for transitions no lens catches: schema shape, defaults, performance, who does the job when there is nobody in that role, and what silently breaks on the day the client grows.

## Verdict

Two gaps survive, both concrete (missing question + built-wrong scenario), checked by name against the 146-lens catalogue, the six canonical rulings, the conflict register, and the four prior gap audits already in docs/erp-lenses/. Coverage of schema shape/defaults/performance for the Solo-to-Org walk is genuinely strong (Three silhouettes / The adoption test / The absent collaborator / hundred-thousandth-row / findability-at-scale / Branch means database not location / timezone-and-fiscal-calendar lenses). Full audit written to docs/erp-lenses/_gap-editions-and-volume.md.

## Gaps

### No lens asks what a quorum/dual-custody/second-signature control does when the deployment's roster can't supply the second person

**Why:** The catalogue and Ruling 6 state controls requiring more than one distinct human ('two of three regional finance leads' in The threshold nobody approves alone; 'a different person closed and reconciled a shift' in Who counts the drawer they held; Ruling 6's abandoned PosShift needing 'a second person holding the cash-count permission') but never ask what happens when this deployment's live roster (Solo: two or three staff, no accountant) has fewer qualified holders than the control needs. Grepped the full catalogue, hardening files, _canonical-decisions.md and _conflicts.md for quorum/second-person/cannot-be-met language — zero hits asking the headcount-shortfall question. Built wrong without it: either the control is literally unusable at Solo (a PO/JE/shift stuck permanently in DRAFT or abandoned, blocking next-day trading per 'The branch that cannot trade tomorrow'), or an implementer quietly adds an unaudited single-approver bypass with no field distinguishing it from a real quorum pass six months later when the client has grown to 40 branches.

**Severity:** blocking

### The per-brand currency field forces the invoice to say the right thing; no lens forces the ledger to convert it

**Why:** Lens 08 (One tax regime, many legal entities) forces a RetailBrand-scoped field for tax label/number/currency, with its done test satisfied by a query proving TaxRate selection — that says nothing about JournalLine. debitMinor/creditMinor are documented in 00c-ground-money.md and 07-money-integrity-gl.md's own 'Not modelled yet' as ALWAYS base currency, with 'No FxRate table, no rate source, and no period-end revaluation' named three times across files and never turned into a lens question. A prior audit (_gap-innovation.md) called this area covered by lens 08, but conflated the invoicing-currency field with GL-currency conversion, which are different artifacts. Built wrong without it: a second RetailBrand ships a correct AED invoice while its sales post at base currency (or a hand-picked one-time rate), and ConsolidationService.groupProfitAndLoss() sums PKR and AED minor-unit integers as the same unit — the group P&L is wrong in a way the trial balance still reports as zero, discoverable only the day it matters.

**Severity:** significant

