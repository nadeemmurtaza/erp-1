# Gap departments

Output of the `gap:departments` agent (Gaps phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Angle

Org-chart walk (A–Z departments of a large retail group) against the lens catalogue (_index.md) and the CLAUDE.md feature-scope section (_claude-md-feature-scope.md), checking each department's concern against both the catalogue table and the underlying numbered domain files in docs/erp-lenses, at the stated Solo/SME/Org scale.

## Verdict

Most departments are genuinely covered (finance, treasury, tax, legal-hold/evidence, compliance/data-rights, internal audit, fraud/insider risk, HR's access lifecycle, procurement, planning, warehouse/logistics/fleet, production, merchandising, retail ops, e-commerce, customer service, marketing's data-integrity surface, IT/extensibility, franchise/wholesale, and investor/group consolidation via the existing elimination lens). Five real gaps found, ranked by severity, and written up in full in docs/erp-lenses/_meta/_gap-departments.md along with everything checked and found already covered.

## Gaps

### HR & Payroll — no posting artifact for compensation or the pay run

**Why:** Lens 06 covers only the access/JML half of HR; nothing forces a wage-rate table, a pay-run document, or its Dr/Cr posting, even though _index.md's own ground-truth list names 'no journal for production, payroll or shift close' as missing. Without it, payroll ships as an hours report with no compensation model, no statutory deductions, no GL posting, and no reversal path for an overpayment.

**Severity:** blocking

### Facilities & asset maintenance — file 37 has zero surviving lens of its own

**Why:** All three lenses in 37-assets-facilities-maintenance.md were absorbed into other domains' canonical lenses (custody, downtime, posting), leaving no question that asks what a physical asset or lease *is* as a row, when it needs service, or who is told. Without it, facilities gets reduced to a single downtime flag with no equipment registry, no per-asset insurance or depreciation, and no maintenance scheduling.

**Severity:** significant

### ESG — the file's title promises it, the content never delivers it

**Why:** 34-provenance-esg-statutory.md's actual lenses are lot traceability, origin claims and regulator line-mapping — none a sustainability metric, and its own 'Not modelled yet' section never mentions energy, waste or emissions. A reviewer grepping the filename would wrongly credit ESG as scoped. Without a forced question, an ESG disclosure feature has no per-location/per-shipment field to aggregate from.

**Severity:** significant

### Legal — no table for the agreement itself (lease, franchise, supplier or B2B contract)

**Why:** Legal-hold (05) preserves an existing record; supplier compliance-document expiry (13) is scoped to onboarding only. No lens asks where a lease's or franchise agreement's own term, renewal date and governing jurisdiction live, distinct from the operational row (Location, TradingPartner) it governs. Without it, a 100+-location group discovers a lapsed lease when the location goes dark, not sixty days before.

**Severity:** significant

### Quality assurance — no inspection or non-conformance record

**Why:** Production (16) covers scrap quantity, not a pass/fail result; procurement (13) covers a supplier's compliance certificate, not an inbound goods inspection. No lens asks what records an inspection outcome on a receipt or batch and its disposition on failure. Without it, QA becomes a free-text note with no queryable failure rate.

**Severity:** minor

