# ADR-071 — Docs 168–183 (a composable, resilience-first SME platform for du): built inside erp-1 as new core-classified modules over the shipped planning engine (doc 144) and hosting control plane (doc 39), not a greenfield repository or a fork; zero new module couplings, and the program brief's premises corrected against the code

[← Decision log](../DECISIONS.md)


### Context

NEWAX is proposing to du (a UAE telecom operator) a du-owned, composable ERP/SaaS
product focused on operational resilience, for 50,000+ SMEs: an SME connects its
existing spreadsheets, accounting system and POS; the platform builds a
dependency graph of its business, simulates disruptions (a supplier down, a
lead-time slip, a cash shock), ranks recovery actions, and closes the loop
through du's own payment rails. Docs 168–183
(`docs/implementation/composable-resilience-platform/`) specify it as seven
layers. The question this entry settles is **where it is built**: in a new
repository, inside this one, or in a fork of this one.

The evidence, checked against the code while writing the document set:

- **The resilience engine already exists.** `apps/api/src/modules/planning/` is
  `RETAIL-ERP.md` R20–R26 built (doc 144, ADR-066): `DependencyGraphService.build()`,
  the pure `propagate()` and `rankActions()` with determinism and non-invention
  proven by spec, `NarrationService` with `assertNoOriginatedFigures()`,
  `LiquidityForecastService`, `SupplierResilienceService`, `OnlineStockService`,
  and `/admin/resilience` behind `planning.propagation.view`.
- **The multi-tenant control plane already exists.** `apps/platform` (doc 39 and
  docs 14/50/51/153/154): an isolated database per tenant ("a tenant is a
  node"), provisioning, hostname routing, expiring and audited
  `SupportAccessGrant`s, resource quotas, export and deprovisioning, four pricing
  shapes, invoicing, trials, metering from each tenant's own outbox.
- **The connector architecture is specified to the column** (docs 36, 132, 160,
  162) — and, checked, **unbuilt**: no `connectors.prisma`, no `connectors`
  module.
- **Every country-specific integration sits behind an interface** —
  `PaymentProvider`, `FinancialInstitutionConnector`, `IdentityVerificationProvider`,
  `AiProvider`, the sketched `FiscalComplianceProvider` — and module independence
  is enforced by `scripts/check-module-boundaries.mjs` on every `pnpm lint`.

### Options Considered

1. **A separate greenfield repository for the du product.** Rejected: it would
   rebuild, before its first new feature, a resilience engine whose
   determinism and non-invention guarantees took nine spec files to prove, a
   control plane with isolation, support access, export and billing, a PBAC
   catalogue with seeded roles and non-delegatable keys, a transactional outbox,
   a double-entry ledger that posts from events, a settlement reconciler with a
   named `SHORT` variance, and a feature-flag primitive with maker-checker —
   and would re-earn none of the scope-lens analysis 160+ documents already
   carry. It would also sever the international proof that is this program's
   strongest argument: a second market arriving as second implementations of
   existing interfaces.
2. **Inside erp-1, as new modules extending docs 144/39/160/162.** The new work
   is: the ingestion boundary as the inbound half of the `connectors` module docs
   160/162 already specify (`'core'` in `MODULE_PACKS`, `offByDefault`), a
   `CanonicalRecordSinkRegistry` core extension point for writing into owning
   modules, planning extensions (provenance partition, currency-neutral cost,
   revenue at risk, persisted runs and decisions), du-rail implementations of the
   two existing payment/settlement interfaces, and control-plane state for
   per-tenant Build Manifests.
3. **A fork of erp-1 dedicated to du.** Rejected for now: doc 11 already rejects
   per-client branches and forks ("merge hell") in favour of one Blueprint and the
   extractor (`scripts/sync-client.mjs`, doc 12, built), which can produce a
   client-specific repository from `main` without forking development. A fork
   today would split every fix between two codebases for no requirement anyone
   has stated.
4. **Inside erp-1, but as a new sector pack (`PackName 'resilience'`).**
   Considered because the brief spoke of "module packs". Rejected by
   `module-packs.ts`'s own rule — "a pack exists only where a vertical owns
   genuine domain data that core cannot express"; connectivity and resilience are
   cross-sector capabilities, classified `'core'` exactly as `marketplace`,
   `managed-services` and `accounts` already are.

### Decision

**Option 2.** The program is built inside this repository, as core-classified,
off-by-default modules and extensions of shipped modules, in `apps/api` and
`apps/platform`, under this repository's lint, test, index and ADR discipline.
Specifically:

- **No new `KNOWN_MODULE_COUPLINGS` entry.** The brief expected one for the
  ingestion pack to "reach `planning`", mirroring `planning -> inventory`. There
  is no same-transaction write between them, the list's own comment reserves it
  for exactly that, and `RETAIL-ERP.md` Part 4 says the intelligence layer adds
  "zero module couplings". `planning` reads ingested rows by bare Prisma read, as
  it reads every other module's rows; the connectors module writes into owning
  modules through `CanonicalRecordSinkRegistry`, the `StockIntakeRegistry`
  precedent (doc 172 §8–§9).
- **No `tenantId` column.** The tenant boundary is the database (doc 39;
  ADR-040/044 as restated in `idempotency.prisma`); provenance, confidence and
  freshness live on doc 160's `ExternalRecordLink`, extended (doc 169 §2, §4).

### Reasoning

The decision rests on shipped capability, not on architectural preference:

- The product's differentiator — deterministic, traceable disruption simulation
  with AI that may narrate but never compute — is `planning`, already built and
  proven. Its missing half is data from systems the SME already runs, and the
  design for that half (docs 160/162) is already written, reviewed through its
  own scope lenses, in this repository.
- du's operating model — du owns the platform, each SME is isolated — is doc 39's
  shared-infrastructure/isolated-data control plane, already built, with the
  support-access and export commitments a regulated operator will be asked about.
- The UAE is the proof this architecture was designed for: tax filing, identity,
  payments, settlement and locale each take a UAE implementation behind an
  existing interface (doc 168 §5), with the honest deltas named — two optional
  fields on `IdentityVerificationStart`, fail-closed callback verification, labels
  as translation rows — and none requiring a core edit or a country conditional.
- Building here also surfaced defects a separate repository would have
  inherited unseen: `rupeesSpentMinor` and its currency-literal siblings (eight
  `@default("PKR")` schema defaults; create paths that never set `currency`),
  AP summed across currencies, cash reported as zero when unknown, callbacks
  trusted when a provider omits `verified`, and support grants enforced only in
  the control plane. Each is now a scoped work order.

### Consequences

- **This program is coupled to erp-1's own release, lint and test discipline.**
  Its work orders pass `pnpm lint && pnpm typecheck && pnpm test`, the module
  boundary check, the index freshness check and this ADR log like every other
  change; its pace is bounded by that discipline, deliberately (doc 183's gates).
- **The fork door stays open, unexercised.** If a contract ever requires full
  separation, doc 11's handover model — the extractor producing a du repository
  from `main`, upgraded by pull request — is the path; source escrow (doc 181 §7)
  covers continuity without one.
- **The brief's premises are corrected, not carried** (doc 168 §3):
  `FiscalComplianceProvider` has zero implementations, so the UAE ASP provider
  will be its first; the shipped identity provider calls Newax's own nID
  platform, not NADRA; the connector system is unbuilt, so WO-160.x/162.x are the
  ingestion program's first work orders; doc 38 is unbuilt — no circuit breaker,
  no measured RPO/RTO; the pricing model has four shapes and doc 155's wallet is
  not one and is excluded from du tenants.
- **Preconditions before any UAE tenant exists** (doc 183 gate G0): the currency
  sweep, fail-closed callback verification, and the planning currency and
  honesty fixes.
- **Two decisions are opened, not taken** (WO-168.3): an SME's legal identity on
  its own tax invoice at runtime (touches `ENTERPRISE-SCALE.md` Br1's wording),
  and compute density / scale-to-zero at 50,000 tenants (beside ADR-018, still
  Open). Two more are named for their own entries when their work orders start:
  a payment-clearing account (WO-175.10) and the `CanonicalRecordSinkRegistry`
  extension point itself.
- **Documents of record are not edited by this entry.** `RETAIL-ERP.md` R22's
  heading ("cash preserved per rupee spent") and doc 144's §3 sketch still carry
  the currency word; the first is the owner's to reword, the second is updated by
  the PR that lands WO-173.1.

### Status
**Superseded by ADR-072.**
