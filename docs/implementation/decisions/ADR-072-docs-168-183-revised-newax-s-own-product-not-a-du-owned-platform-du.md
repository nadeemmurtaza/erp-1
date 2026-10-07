# ADR-072 — Docs 168–183 revised: NEWAX's own product, not a du-owned platform — du was a quality-bar reference only, never a counterparty; ADR-071's build-here decision carried forward unchanged

[← Decision log](../DECISIONS.md)


### Context

ADR-071 recorded where the composable, resilience-first SME platform of docs
168–183 is built, on a premise its own Context states: "NEWAX is proposing to
du (a UAE telecom operator) a du-owned, composable ERP/SaaS product … and closes
the loop through du's own payment rails." The premise ran through the document
set: du as owner and operator of the control plane (doc 168 §1, "A du-operated
control plane"); du's licensed entities as *the* payment rail and the custody
boundary (doc 175); du's account team recruiting pilot SMEs and du's program
owner as the third cutover signatory (doc 179); du as data processor with NEWAX
as its sub-processor, "du's sovereign cloud" and "du's own contractual security
requirements" (doc 181); a competition submission (doc 178); and a commercial
rationale arguing "why du — and not NEWAX building this alone" against e&'s
marketplace (doc 182).

The owner has since corrected that premise directly: du was only ever a
reference point for the ambition and quality bar. There is no du partnership,
no competition submission, no telecom distribution deal, and nothing du-owned.
The product is NEWAX's own — built and owned by NEWAX, sold to SMEs and
enterprises directly and through NEWAX's existing commercial and hosting model:
doc 11's two-track Blueprint/agency model, doc 39's control plane (whose own
text already says "Newax's own hosting-operations staff"), and the pricing
shapes of docs 50 and 153–155.

This is new evidence — a correction of fact from the owner — not a settled
decision reopened without cause. What changed is not ADR-071's decision (build
inside erp-1) but the counterparty its framing, and six of the sixteen
documents, rested on. Three rulings accompanied the correction and are applied
here rather than re-argued: payments and custody stay conservative (licensed
third-party PSPs through the existing extension point, never NEWAX as money
transmitter, and not doc 155's wallet model); the UAE stays, as NEWAX's own
chosen second market; and the competition and "why du / versus e&" arguments
are removed, not reworded.

### Options Considered

1. **Leave ADR-071 as the historical record and layer a correction on top,
   without touching docs 168–183's own prose.** Rejected: the documents would
   stay self-contradictory, citing a counterparty the record says does not
   exist — a "du rail" as WO-175.3's build target, a `DU_OWNER` role in doc
   179's `SystemOfRecordCutover.signoffs`, du as processor in doc 181 §1. An
   engineer picking up WO-175.3 would build against a rail nobody chose.
2. **Rewrite ADR-071 in place.** Rejected: this file's own rule — "do not edit
   a decided entry to reflect a change of mind — supersede it with a new entry
   and set the old one's status to `Superseded by ADR-NNN`" — and the
   repository's practice of correcting forward (the ADR-062 collision was kept
   as merged and resolved by recording ADR-063 beside it, not by rewriting the
   merged entry) keep a merged decision's text as the record of what was
   believed, and when.
3. **Supersede ADR-071 with this entry and revise the sixteen documents' own
   prose to the corrected premise**, changing only sentences that assume a du
   counterparty and leaving technically du-independent content untouched.
   Chosen.

### Decision

**Option 3.** ADR-071's status is now `Superseded by ADR-072`; its Context,
Options, Decision, Reasoning and Consequences are left verbatim, title
included. Its substantive decision is **carried forward into this entry
unchanged**: the program is built inside this repository as core-classified,
off-by-default modules and extensions of shipped modules in `apps/api` and
`apps/platform`; no new `KNOWN_MODULE_COUPLINGS` entry; no `tenantId` column;
the two decisions WO-168.3 names are still to be opened as their own entries.
What changes is who stands where:

- **Owner and operator:** NEWAX, on its own doc 39 control plane.
- **Payments:** licensed third-party PSPs, integrated per market through the
  existing `PaymentProvider` (`apps/api/src/modules/sales/payments/payment-provider.ts:73`)
  and `FinancialInstitutionConnector`. NEWAX never becomes a money transmitter
  or wallet-holder for this program. du Pay and Network International appear
  only as illustrations of a regional rail the extension point could plug into.
  Doc 155's wallet/stored-value/escrow model is not adopted — a separate, more
  heavily regulated business decision the owner has not made.
- **The UAE:** NEWAX's own chosen second market, hosted in a UAE region on
  NEWAX's own control plane; the regulatory research is kept.
- **Go-to-market:** NEWAX direct, self-serve trial and `/pricing`, and doc 11's
  Agency-Managed track.
- **Two files renamed, numbers kept:**
  `178-10-competition-deliverable-vs-pilot-vertical-slice.md` →
  `178-10-mvp-vertical-slice-vs-full-rollout.md`, and
  `182-14-commercial-partnership-rationale.md` →
  `182-14-why-newax-builds-and-owns-this.md`. Every reference outside the
  generated index (`docs/implementation/README.md`, doc 168 §7) was updated;
  the index was regenerated.

### Reasoning

The sentences changed, and why each had to be:

- **Doc 168 §1.** "offered by du to 50,000+ SMEs as a du-owned product" became
  "offered by NEWAX as its own product to SMEs … sold directly and through
  NEWAX's own Agency-Managed hosting model (doc 11 §5, doc 39)"; "A du-operated
  control plane" became "NEWAX's own control plane"; "du's own licensed entities
  move money; NEWAX never holds funds" became "licensed third-party payment
  service providers, integrated per market through the existing
  `PaymentProvider` extension point, move money. NEWAX is a technology
  platform — never a money transmitter or wallet-holder for this program". §5's
  UAE payment row no longer reads "A du rail (du Pay and/or its acquirer)".
- **Doc 175 §3.** "The du rail — du Pay and/or the acquirer behind it (the
  brief names Network International) — is one class,
  `providers/<du-rail>.provider.ts`, its key fixed by the contract (for example
  `du_pay`)" became one class per PSP, `providers/<psp>.provider.ts`, with the
  first PSP NEWAX's own commercial choice and du Pay/Network International named
  only as illustrations. §4's "If du wants stored value, it is du's own licensed
  product" became a statement that stored value is a separate decision the owner
  has not made, behind doc 155's own legal gate (WO-155.0); §4's revenue row
  "du ↔ NEWAX, du ↔ SME … through du's own billing" became "NEWAX ↔ SME",
  collected through `AgencyStripeChargeCron` (ADR-039). The custody posture is
  unchanged or stricter: every money-moving call still terminates at a licensed
  entity, and `wallet` stays out of every program tenant's manifest.
- **Doc 179.** "du's account team nominates" became NEWAX's own sales and
  onboarding team, fed by `/pricing`, the trial sign-up and Agency-Managed
  engagements; the third cutover signatory "du's program owner" became "NEWAX's
  program owner — never the same person as the implementation lead", and the
  `signoffs` role `DU_OWNER` became `NEWAX_PROGRAM_OWNER`. With both NEWAX
  signatories in one company, the existing distinct-`userId` rule is now what
  keeps the second signature a check on the first — written into §5.2.
- **Doc 181.** §1 had du as processor and NEWAX as sub-processor; NEWAX is now
  the processor under its own data-processing agreement with each SME, and its
  infrastructure providers are the sub-processors. §2's "du's own contractual
  security requirements | Always, for du's product" became NEWAX's own published
  security commitments plus any enterprise customer's schedule; §3.2's "On du's
  sovereign cloud" became NEWAX deploying its own control plane and tenant fleet
  in a UAE region; §7's "du must be able to run, repair and … leave" became every
  SME leaving with its data and an enterprise customer that contracts for it
  being able to run and repair; §8's IP boundary is now between NEWAX and its
  customers. The PDPL, DIFC, ADGM, ISO 27001, PINT AE and erasure tables are
  unchanged.
- **Doc 178.** "Competition submission vs pilot" became "MVP slice vs full
  rollout"; "if sandbox access is not granted by submission" became "not yet
  granted when the slice is cut". The built-versus-new map, the 21-step journey
  and the non-goals are unchanged.
- **Doc 182.** §2 "Why du — and not NEWAX building this alone" and §3's "No
  claim is made here about what e& or any other operator offers" are removed.
  In their place: why NEWAX builds and owns this, against what an SME actually
  uses (a spreadsheet, a point-solution BI tool, no visibility), on NEWAX's own
  built distribution (`ProvisioningService`, `SignupService`, `/pricing`,
  `BillingService`, `InvoiceDunningCron`, `AgencyStripeChargeCron`), and one
  owner of the canonical foundation versus a stack of point tools. §4's "Who
  bills whom — two options, decided in the contract" (Option A: du bills the
  SME) became NEWAX billing directly. WO-182.2 and WO-182.3 (a wholesale
  statement and a bridge to du's billing) are marked withdrawn, their ids not
  reused.
- **Incidental mentions in docs 169–174, 176, 177, 180 and 183.** "du SME"
  became "pilot SME" or "tenant SME"; "du operations" became "NEWAX hosting
  operations"; "du's own workforce IdP" became NEWAX's; `CANARY // du's and
  NEWAX's own internal tenants` became NEWAX's; "off by default for du tenants"
  became "for UAE tenants"; doc 183's G3 "The du rail" became "The first
  licensed PSP's integration"; every `<du-rail>` path placeholder became
  `<psp>`. Doc 180's "Revenue per SME to du" row now says NEWAX bills directly,
  so `PlatformInvoice` and `PlatformTenant.status`/`deprovisionedAt` are where
  those figures would be read — as KPIs only once the owner defines them.
- **`docs/implementation/README.md`.** The "Numbers 168–183" introduction no
  longer says NEWAX "is proposing to du, a UAE telecom operator"; rows 168, 175,
  178, 181 and 182 were brought into line with their revised documents.

This correction was safe to make in place because none of the technical
substance was ever du-dependent: Layers 0–5 cite erp-1's own code, the UAE
implementations sit behind interfaces whoever owns the product, and the custody
boundary never depended on *which* licensed entity moves the money — only that
one does.

### Consequences

- **Survives essentially unchanged:** the UAE-market research (PDPL, DIFC,
  ADGM, Emirates ID, UAE PASS, PINT AE, VAT record-keeping), the
  `PaymentProvider`/`FinancialInstitutionConnector` architecture and the custody
  boundary, Layers 0–5, platform resilience, graph derivability, metrics,
  engineering governance, and every work order except the two withdrawn.
- **Does not survive:** the competition/submission narrative (doc 178 is now MVP
  sequencing), the du commercial rationale (doc 182's thesis replaced, and with
  it Option A, WO-182.2 and WO-182.3), and du as recruiter and signatory
  (doc 179).
- **NEWAX now carries directly what the old premise assigned to du:** procuring
  UAE-region hosting (WO-181.9), a UAE sales presence, a possible UAE contracting
  entity (doc 182 §2.3 — named, not built), choosing the PSP or PSPs to integrate
  (WO-175.3), and being the data processor of record under a data-processing
  agreement with each SME (doc 181 §1).
- **Two filenames changed.** An outside bookmark to either old name breaks;
  both old names are recorded here and in each renamed document's own revision
  note so they can be traced.
- **ADR-071's title still reads "for du".** Left as written under this file's
  own rule; its status line points here.
- **Nothing opened or closed by this entry.** WO-168.3's two decisions and
  WO-175.10's clearing-account ADR remain exactly as ADR-071 left them.

### Status
**Accepted.**
