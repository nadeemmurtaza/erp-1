# 181 — Risk, compliance and continuity in the UAE: every obligation mapped to a mechanism that exists, and every gap named

> **Status: proposed (2026-09-27), not yet built.** This document maps the
> program's UAE obligations onto **real mechanisms in this codebase** — doc 39's
> tenant isolation and time-boxed support access, `AuditService`, the
> `FiscalComplianceProvider` extension point, the `PaymentProvider` custody
> boundary — and names, rather than asserts away, every place a mechanism is
> missing. It then specifies the continuity package that replaces any
> single-vendor-lock-in story, and the IP boundary between du and NEWAX. **It is
> an engineering mapping, not legal advice:** the obligations are stated as
> this program understands them and are to be confirmed by counsel for the
> contract; where a figure (a retention period, a mandate date) is legal rather
> than technical, it is marked for confirmation, never presented as settled.

## 1. Who is who under data-protection law

| Party | Role for SME business data (customers, suppliers, staff contacts) | Instrument |
|---|---|---|
| **The SME** | Controller — it decides why its customers' and suppliers' data is processed | Its own obligations under the law that applies to it |
| **du** | Processor — hosts and operates the platform on the SME's instructions; controller only for its own customer relationship with the SME | A data-processing agreement between du and each SME, part of the service terms |
| **NEWAX** | Sub-processor — software, support, maintenance | A sub-processing agreement with du; access only through §3.2's mechanisms |
| **Licensed payment entities** | Independent controllers of payment data under their own licences | Their own terms with the SME (doc 175 §4) |
| **An ASP (e-invoicing)** | Processor/independent per the ASP accreditation regime | The SME's own ASP contract (§5) |

## 2. The obligation stack

| Layer | Applies when | How it enters this program |
|---|---|---|
| **UAE PDPL** — Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data | Baseline for processing in the UAE outside the financial free zones | §3's control map |
| **DIFC Data Protection Law** (DIFC Law No. 5 of 2020) | Only where an SME or a processing entity is established in the DIFC | Same mechanisms; additional registration/notification and transfer duties handled per tenant by the contract (a `DEDICATED`-tier deployment where the SME's regulator requires it) |
| **ADGM Data Protection Regulations 2021** | Only where established in ADGM | As DIFC |
| **du's own contractual security requirements** | Always, for du's product | §4 — du supplies them; each is answered with a mechanism or a named gap |
| **ISO/IEC 27001:2022-aligned controls** | Always, as the control vocabulary du and its auditors will use | §3.3 |
| **UAE VAT record-keeping and e-invoicing** | Every SME registered for VAT; e-invoicing per the Ministry of Finance's phased mandate | §5 |
| **Central Bank of the UAE payment regulation** | Money movement | Carried entirely by licensed entities; this platform never moves funds (doc 175 §4) |

The executive regulations and supervisory guidance under the PDPL, and the exact
e-invoicing phases, are to be taken from the authorities' own current
publications at contract time; this document maps mechanisms to principles that
are stable across those details.

## 3. Controls, mapped to real mechanisms

### 3.1 PDPL principles → mechanism → gap

| Principle | Mechanism in this codebase | Gap, named |
|---|---|---|
| **Lawful processing, on the controller's instructions** | Each SME's data is processed only inside its own database (doc 39); processing is the operational use the SME configures (`MODULES`, connectors it creates and confirms, doc 172 §6) | Consent for *marketing* is a pair of booleans (`Contact.marketingOptOut`, `User.marketingEmailOptOut`) — the lens index's "Consent is a matrix, not a switch"; this program sends no marketing and does not widen it |
| **Purpose limitation and minimisation** | Ingestion keeps only mapped canonical fields in canonical rows; unmapped source columns never reach them (doc 172 §4) | The **raw file** (`FileConnectorRun.storageKey`) holds every column the source sent — kept for provenance ("click the number") and disputes. Bounded by a retention period per SME (WO-181.4), and redacted on erasure (§6) |
| **Accuracy** | The confidence model and human confirmation (doc 172 §5–§6); advisory data never used; every figure traceable to its record | — |
| **Storage limitation** | Compaction of promoted candidate JSON after 180 days (WO-172.10); SLI roll-ups (doc 176) | **No retention or expiry column on any table** (the lens index); a retention schedule per data class is WO-181.4. Business records follow the UAE VAT record-keeping period (five years for most records, **to be confirmed by counsel**), which *requires* keeping the ledger — ruling 1's "the ledger wins" |
| **Integrity and confidentiality** | Isolated database per tenant (doc 39); secrets AES-256-GCM (`@newax/shared` `secret-crypto`; `TenantDeploymentCredential` under `PLATFORM_ENCRYPTION_KEY`); PBAC on every route (`PermissionsGuard`, `scripts/check-route-permissions.mjs`); `NON_DELEGATABLE_PERMISSIONS`; fail-closed callback and webhook verification (docs 170, 175) | `AuditLog` is not immutable at the database — `AuditService`'s own comment: "this trail is transactional, not tamper-evident"; ruling 1 names the migration. WO-181.3 |
| **Accountability / records** | `AuditService.record()` (operational) and `.recordEvidence(tx, …)` (evidence-class, ruling 9) — every confirmation, decision, grant, cutover signature in this program is evidence-class | No read-access log for sensitive records (the lens index: "No read-access logging anywhere") — a support session's *reads* are logged by doc 170 §4.1's per-request audit; an SME user's reads are not |
| **Data-subject rights** — access, rectification, erasure, portability | Rectification through ordinary edits; erasure per ruling 1 (§6's per-table disposition); tenant-level portability through `TenantExportService` (`pg_dump`) | **No data-subject-request model or endpoint** (the lens index). WO-181.5: a request workflow in the tenant — find the person across §6's tables, produce their record set, apply §6's dispositions — run by the SME as controller |
| **Cross-border transfer** | Tenant databases, the control plane, object storage and backups on du's UAE cloud (§3.2); `AiProvider` degrades to absent | Five flows could leave the UAE and each needs a decision: **AI** (`AI_PROVIDERS` — `anthropic`/`openai` are foreign APIs; **off by default for du tenants**, or an in-country provider behind the same interface); **SMS/WhatsApp** providers (doc 33; choose UAE-hosted or contract for transfer); **e-mail** (the self-hosted server's location, `docs/email.md`); **off-site backups** (`S3_TARGET`'s region); **support access by staff outside the UAE** (NEWAX engineers) — permitted only through purpose-scoped grants (doc 170 §4) under the sub-processing agreement's transfer terms, or restricted to UAE-located staff if du requires it — a contract decision, not a code one |
| **Breach notification** | Audit trails; tenant isolation limits blast radius to one tenant | **No monitoring backend** (ADR-017, Open) — detection relies on logs and SLIs computed from rows (doc 176 §5); an incident runbook with the notification path to the regulator is part of §7 |

### 3.2 Residency, isolation and support access — the doc 39 model on du's cloud

- **A tenant is a node** (doc 39, `RETAIL-ERP.md` R2/R7): residency is a
  property of *where each tenant's database runs*, decided per tenant, not a
  filter on shared tables. On du's sovereign cloud, every component that stores
  tenant data — the tenant database cluster, `StorageService`'s bucket, backup
  archives, `TenantDataExport` archives — is placed in a UAE region; the control
  plane (`apps/platform`) holds metadata *about* tenants, never their business
  data, and is placed there too.
- **`DEDICATED` tier** (`ResourceTier.DEDICATED`) for an SME whose regulator or
  contract requires dedicated infrastructure — shared compute opted out,
  control plane still used, second approval required for support access
  (`SupportAccessService.recordAccess()` refuses an unapproved `DEDICATED`
  grant).
- **Support access** is doc 39's `SupportAccessGrant` — expiring, audited,
  self-approval refused — **plus** the two deltas doc 170 §4 specifies because
  today the grant is enforced only in the control plane: signed ≤ 15-minute
  tokens verified inside the tenant, per-request evidence-class audit in the
  tenant's own `AuditLog`, and purposes that cannot include confirming an
  SME's data.

### 3.3 ISO/IEC 27001:2022 Annex A — selected controls

| Control | Mechanism | Status |
|---|---|---|
| 5.15 Access control / 5.18 Access rights | PBAC catalogue, `ROLE_PERMISSION_SEED`, `RolesService` toxic-pair refusal, runtime role editing | Built |
| 5.16 Identity management / 8.5 Secure authentication | JWT + refresh tokens, doc 161 OIDC SSO, doc 163 personal keys with expiry, UAE PASS subject binding (doc 170 §3.2) | Built / specified |
| 5.17 Authentication information | Hash-only key storage (`ApiKey.keyHash`, `TradingPartner.inboundApiKeyHash`), bcrypt behind `PasswordHasher` (doc 126) | Built |
| 8.2 Privileged access rights | `ADMIN_LOCKED_PERMISSIONS`, `NON_DELEGATABLE_PERMISSIONS`, `@SessionOnly()`; support grants with purposes | Built / specified (doc 170 §4) |
| 5.23 Information security for cloud services | Doc 39 isolation; `TenantDeploymentCredential` encryption; residency (§3.2) | Built / deployment |
| 8.24 Use of cryptography | AES-256-GCM `secret-crypto`; doc 126's `PasswordHasher` agility | Built |
| 8.15 Logging | Nest `Logger`; `AuditLog` | Built; **not tamper-evident** (WO-181.3) |
| 8.16 Monitoring activities | SLIs from rows (doc 176) | **Partial** — no APM (ADR-017) |
| 8.13 Information backup | `deploy/backup.sh` restore-tested dumps (one stack); fleet continuous archiving | **Single stack built; fleet specified** (doc 176 §6) |
| 5.29 / 5.30 Continuity and ICT readiness | Doc 176's degradation matrix, targets, game-day | **Specified**; RTO unmeasured until the first game-day |
| 8.32 Change management | Forward-only migrations (ADR-008), CI lint/test gates, release rings with maker-checker on money/stock paths (doc 171) | Built (CI) / specified (rings) |
| 8.25 / 8.28 Secure development and coding | `pnpm lint` guards, `security` review routing for access-control changes, `CLAUDE.md`'s protocol | Built |
| 8.10 Information deletion | Ruling 1's dispositions (§6) | **Specified**; no deletion job exists today |
| 5.34 Privacy and protection of PII | §3.1 | Partly built, gaps named |
| 5.19–5.22 Supplier relationships | Sub-processor list: AI (off), SMS/WhatsApp, e-mail, the payment rail, the ASP | Contractual, §4 |

## 4. du's own contractual security requirements

du will supply its security schedule; this program does not guess it. What the
program commits to answer, requirement by requirement, with a mechanism or a
named gap: the data-residency clause (§3.2); sub-processor approval (§3.1's five
cross-border flows are the complete list of outbound data paths this codebase
has); incident notification timelines (§7's runbook; detection limits stated
per ADR-017); right to audit (evidence-class audit trails, the per-request
support audit, and this document set); penetration-testing cadence and
vulnerability-fix SLAs (release rings let a fix reach every tenant through a
controlled, recorded path, doc 171); any UAE information-assurance standard du
is itself bound to as a telecom operator (mapped onto §3.3's controls when du
names it); encryption at rest (the cluster's storage encryption is the
operator's; application-level encryption covers credentials, not whole tables —
stated, not overstated).

## 5. E-invoicing through `FiscalComplianceProvider` — never a parallel tax system

**Where things stand, honestly.** `FiscalComplianceProvider` exists only as a
sketch in `tax-compliance/15-tax-module.md` — "an interface under
`tax.service.ts`, one implementation per authority" — with **zero
implementations**: WO-15.5 (FBR) is "blocked on real FBR requirements" and
WO-15.6 (PRA) likewise; docs 46, 88 and 112 all point back to it. So a UAE
implementation is the **first**, and UAE is the first regime in this repository's
history whose specification (Peppol PINT, with UAE extensions — "PINT AE") is
published concretely enough to build against. The Pakistani implementations
remain planned on the same interface. That is the point: the extension point
exists so a new market is a new class.

**What exists and is reused as-is.** The `tax` module is built (doc 15, WO-15.1–15.4):
`TaxClass`/`TaxRate` with `rateBps` effective-dated, inclusive/exclusive modes,
per-line tax snapshots on `OrderItem` (`taxAmount`, `taxRateBps`). UAE VAT — a 5%
standard rate and the zero-rated and exempt categories — is **data**: `TaxRate`
rows with `rateBps = 500` and classes keyed `standard`, `zero_rated`, `exempt`.
No code branch knows it is the UAE.

**The change the sketch needs before its first build.** Doc 15's sketch is
order-shaped: `buildInvoicePayload(order: OrderWithTax)`. PINT AE is a
*tax-document* standard — invoice number, tax point, buyer TRN, per-line tax
category, credit notes citing the invoice they correct (doc 169 §8) — and
`RETAIL-ERP.md` R18 already rules that an invoice is a document distinct from an
order. So the interface is corrected while it has no callers:

```ts
// tax module — the doc 15 sketch, made document-shaped before any implementation exists
export interface FiscalDocument {
  kind: 'TAX_INVOICE' | 'CREDIT_NOTE';
  number: string;                 // from a gapless per-authority series (below)
  issueDate: Date;
  taxPointDate: Date;             // "Tax point is not the GL date" — its own field
  currency: string;
  seller: { legalName: string; taxNumber: string; endpointId: string | null };   // tenant runtime identity, doc 170 §6
  buyer:  { name: string; taxNumber: string | null; endpointId: string | null };  // Party via Contact.partyId, doc 169 §3.1
  lines: Array<{ id: string; itemName: string; sellerItemId: string | null; gtin: string | null;
                 quantity: number; unitCode: string; unitPriceMinor: number; netMinor: number;
                 taxCategory: string; taxRateBps: number; taxMinor: number }>;
  totals: { netMinor: number; taxMinor: number; grossMinor: number; payableMinor: number };
  precedingDocument: { number: string; issueDate: Date } | null;   // required for a credit note
}

export interface FiscalComplianceProvider {
  readonly authority: string;                                          // "AE-ASP:<asp key>", "FBR", "PRA", …
  buildDocumentPayload(document: FiscalDocument): Record<string, unknown>;   // pure — the dry run
  submit(payload: Record<string, unknown>): Promise<{ referenceNumber: string; clearedAt: Date | null }>;
}
```

`FiscalDocument` is built from the `Invoice`/`CreditNote` rows doc 169 extends;
the fields `Invoice` lacks today (document kind, tax-point date, per-line tax
category and rate, unit code, electronic addresses, a credit note's link to an
invoice rather than an order) are this work order's own additive columns, each
justified by a PINT business term in doc 169 §8's table — never added
speculatively before this work order.

**Queued, never blocking.** Doc 15's own design: `FiscalSubmission`
(`documentId`, `authority`, `status`, `referenceNumber`, `attempts`) drained by a
cron with retry and backoff — "a slow or down government API never blocks a
sale" (R5's rule applied to a tax authority). The circuit key is
`fiscal.<authority>` (doc 176 §4). **Numbering:** a gapless series per issuing
legal entity per year per authority, allocated through a counter keyed by the
authority, doc 15's own instruction ("reuses `documentNumber()`'s existing …
counter pattern — never a second, bespoke numbering mechanism").

**The routing model, stated as understood and to be confirmed.** The UAE
programme routes an invoice from the seller's system through the seller's
Accredited Service Provider, across the Peppol network to the buyer's ASP, with
tax data reported to the authority's platform. This platform's provider is the
seller-system → seller-ASP leg only; the ASP's own API, authentication and
acknowledgement semantics are taken from the chosen ASP's documentation. **Inbound**
e-invoices from suppliers, delivered by the SME's ASP, are an ingestion source
at the 10000 ceiling (doc 172 §5).

**What must be confirmed before building:** the PINT AE field set and UAE
extensions, B2C scope and timing, the phase that applies to each pilot SME, the
chosen ASP's API. Until then: `buildDocumentPayload()` can be built and
validated against the published specification (pure, no submission), and
submission waits — doc 15's own discipline, not a new caution.

## 6. The erasure the ledger cannot obey — a per-table disposition

Ruling 1: the ledger's references stay (pointing at a pseudonymised subject);
free text is destroyed; a legal hold outranks both. For every table that can
still hold a person after the `User`/`Contact` is erased, one disposition:

| Table / store | Holds | Disposition |
|---|---|---|
| `Contact` | name, phone, email | **Pseudonymise in place** (the row stays; `JournalLine.contactId` and `Order.contactId` keep resolving) |
| `User` | login identity | Pseudonymise; deactivate (ruling 6) |
| `Party` (a sole trader's own name as a business) | name, phone, email, address | Pseudonymise where the party is a natural person; a company's registration data is retained (not personal data) |
| `JournalLine.contactId`, `Invoice.contactId`, `CreditNote.customerId`, `Order.contactId` | a reference | **Retain** — the reference now resolves to the pseudonymised subject; VAT record-keeping is the named basis |
| `Order.guestName/guestEmail/guestPhone`, `shippingAddress`, `billingAddress` | personal data on a sales document | Pseudonymise after the VAT retention period; retain until then under that basis |
| `IngestionRecord.candidate` | the mapped row (may include a phone) | Pseudonymise in place |
| Actor references in this program's own tables — `IngestionMapping.authoredById/confirmedById`, `IngestionBatch.confirmedById`, `IngestionRecord.resolvedById`, `ExternalRecordLink.confirmedById`, `ResilienceSimulation.createdById`, `ResilienceRecommendation.firstViewedById`, `RecommendationDecision.deciderId`, `DerivabilityOutcome.assessedById`, `SystemOfRecordCutover.signoffs[].userId` | a `User` id | **Retain** — the id is not itself personal data and now resolves to the pseudonymised `User`; these rows are evidence of who confirmed, decided or signed (ruling 9), which is their named basis |
| Raw files (`FileConnectorRun.storageKey`, `PollConnectorRun` pages) | everything the source sent | Re-write with the person's fields redacted; the original retained only where it is itself a tax record under the named basis, otherwise destroyed |
| `ExternalRecordLink.externalId` | another system's id for the person | Pseudonymise |
| `AuditLog.data` | free-form JSON | Destroy the person's free text (ruling 1); keep the row |
| `OutboxEvent.payload` | event payloads | Destroy free text in delivered events |
| `Payment.meta` | the rail's raw callback (may carry a payer name) | Pseudonymise |
| `IdentityVerification` (`nidSubjectId`), `SsoSubjectBinding.subject` | external identity references | Pseudonymise |
| `InboundEmail.bodyText/fromName/fromAddress` | free text | Destroy (ruling 1) |
| Backups and `TenantDataExport` archives | point-in-time copies | **Retain** for the backup retention period under a named basis (continuity); a restore re-applies recorded erasures before the tenant is routed — WO-181.6 records erasures in a replayable log so a restore cannot resurrect a person |
| `ReplicationRecord.payload` | n/a for Solo-edition du tenants (no replication) | — |

A legal hold (none modelled today — the lens index: "No `LegalHold` model")
stops every disposition above and is answered with a dated refusal; modelling it
is WO-181.7.

## 7. The continuity package — replacing any lock-in narrative

du must be able to run, repair and — if it ever chose to — leave, without NEWAX's
permission. Each item is a real artifact or a named work order, never a promise:

| Item | What it is, concretely | Status today |
|---|---|---|
| **Data ownership** | Each SME owns its data; du holds it as processor. Any tenant can be exported whole (`TenantExportService.requestExport()`, `pg_dump --format=custom`) at any time and automatically on deprovisioning, with `TenantRetentionCron` never tearing down a database without a `COMPLETE` export (doc 39 WO-39.7). The schema is documented and generated (`docs/index/data/*.md`) | **Built** |
| **Source escrow** | The generic platform (this repository at each release tag), its lockfile, and build instructions deposited with an escrow agent at every `PlatformRelease` (doc 171), verified by the agent's own clean build and test run (`pnpm install && pnpm build && pnpm test`) | **Specified** — WO-181.8 |
| **Escrow release triggers** | Named: NEWAX's insolvency or cessation of business; failure to remedy a severity-1 defect within the contracted period; termination for NEWAX's material breach; a change of control du has a contractual right to object to — the list negotiated, but always named, never "at NEWAX's discretion" | Contractual |
| **Architecture documentation** | This set (168–183), the documents of record (`RETAIL-ERP.md`, `ENTERPRISE-SCALE.md`, `MULTI-SECTOR.md`, `00-HOUSE-RULES.md`), `DECISIONS.md` (ADR-001 onward), and the generated index (`docs/index/`, regenerated on every commit) | **Built** |
| **Infrastructure as code** | Doc 124's honest status: `deploy/` (`backup.sh`, `disk-alert.sh`, `swarm-init.sh`, `systemd/` units) and the Compose files are version-controlled; **declarative provisioning is not** | **Gap** — WO-181.9: declarative definitions for du's control plane, tenant cluster, object storage and archiving, in the operator's chosen tool, committed beside `deploy/` |
| **Deployment runbook** | `DEPLOYMENT.md` exists — for the single-VPS, single-stack model (13 sections, from provisioning to troubleshooting) | **Partial** — WO-181.10: the du-scale runbook (control plane, tenant fleet, release rings, keep-warm) |
| **Operational runbooks** | One runbook per degradation-matrix row (doc 176 §2): symptom, check, action, escalation, including the regulator-notification path for a breach | **Gap** — the lens index: "no runbook referenced from code". WO-181.11 |
| **Dependency register** | Every runtime dependency with its licence, maintainer status and the rule that admitted it (`.claude/rules/dependencies.md`'s template) | **Gap** — `package.json`s and `pnpm-lock.yaml` exist; no register. WO-181.12 generates it with the repository index, so it cannot drift |
| **DR procedures** | Doc 176 §6: the fleet targets (RPO ≤ 15 min, RTO ≤ 4 h per tenant), the sampled nightly restore, the quarterly game-day; the single-stack `backup.sh` restore test that already exists | **Targets specified; measured only after the first game-day** |
| **Handover rights** | Doc 11's two tracks, both real: **Agency-Managed** (du hosts, NEWAX maintains the Blueprint — this program's default) and **Self-Hosted / extracted** (`scripts/sync-client.mjs`, doc 12, built: a client-specific repository generated from the Blueprint, upgraded by pull request with the "engine vs glass" rules). If a contract ever requires full separation, the extractor produces a du repository from the same `main` — the door ADR-069 keeps open without walking through it now | **Built** (extractor); the du-specific extraction is contractual |

## 8. The IP boundary

| Asset | Owner | Notes |
|---|---|---|
| SME data and tenant records | **du** as the operator of the service, holding on the SMEs' behalf; each SME owns its own business data | Exportable at any time (§7) |
| The du-specific deployment — configuration, the Build Manifests, du's `brand.ts` block, du's infrastructure definitions, du's runbooks derived from §7 | **du** | |
| The generic NEWAX platform and engine — this repository's code, including docs 144/39 and everything this program adds to the generic platform | **NEWAX** | Licensed to du; escrowed (§7) |
| Custom extensions built for du beyond the generic platform | **Negotiated** per extension | Default proposal: generic capability → NEWAX (licensed to du); du-only integrations (du's own BSS, du Pay) → du |
| Runbooks and operational documentation | **du has perpetual, irrevocable rights** to use and modify | Survives termination |
| Source escrow | Deposited by NEWAX, releasable to du on the named triggers | §7 |

## Scope lenses

This document's own artifacts are the `FiscalSubmission` queue and the
document-shaped `FiscalComplianceProvider`, the data-subject-request workflow,
the retention jobs, the erasure log, and the legal-hold model; ingestion and
settlement lenses are in docs 172 and 175.

**The actor with three tables** — the ASP is a configuration row per authority
key, not a counterparty; a data subject is a `Contact` or `User`.
**The principal with no permission key** — the ASP's acknowledgement callback
(if any) is verified fail-closed like every inbound path in this program.
**The grant that ends itself** — a legal hold has an explicit release date or a
named releasing actor; a DSR has a statutory response clock tracked on the
request.
**Whose rows, and which columns** — DSR search results are visible only to a
new `privacy.requests.manage` holder (WO-181.5), never to general staff;
`tax.manage` sees fiscal submissions.
**The threshold nobody approves alone** — executing an erasure is a
maker-checker act (requester ≠ approver), recorded evidence-class; placing or
lifting a legal hold likewise.
**The toxic pair, caught at grant or at act** — the person who places a legal
hold cannot also lift it: refused at the act.
**Authority and blast radius** — who may change the retention schedule: an
evidence-class change by `settings.manage` with old and new periods; the worst
value (a period shorter than the VAT record-keeping requirement) is refused by a
floor encoded with the schedule.
**Audience is a capability, not an address** — a `FiscalSubmission` stuck past
its retry window notifies `tax.manage` holders; a DSR nearing its deadline
notifies `privacy.requests.manage` holders; zero holders → the tenant's billing
contact.
**Request or record — classify every write** — a fiscal submission is a RECORD
of a sale already made (never refused by the authority's availability, R5); a
DSR is a REQUEST; an erasure is a RECORD once executed and is itself logged in
the replayable erasure log.
**The movement with no address** — n/a: a fiscal submission, a DSR and an
erasure move no stock or cash; the sale a submission describes already named its
`locationId` when it was recorded.
**Four hours down, the counter stays open** — the ASP down: submissions queue;
sales continue (doc 15's design).
**The unwritten posting rule** — fiscal submission posts nothing; tax already
posted with the sale (R15's `OrderPlaced` rule, Cr Tax Payable).
**Every column or none** — n/a: no new `JournalLine`.
**The period that already moved** — a credit note for an invoice in a closed
period is issued in the open period and cites the original (IBT-025); the
original is never edited.
**The second legal entity** — the gapless series is keyed per legal entity per
authority per year; one tenant is one entity.
**Dry run before live** — `buildDocumentPayload()` is pure and validates against
the published specification with nothing submitted.
**Click the number** — a submission links to the document, the payload and the
authority's reference.
**Three silhouettes, and the day the tier above appears** — per-tenant, edition
independent.
**The absent collaborator** — `tax` with `tax.enabled = false`: no tax lines, no
submissions; no ASP configured: documents issue, submissions queue as
`AWAITING_PROVIDER`, never silently skipped.
**The second copy of the write** — one `FiscalSubmission` per (document,
authority), unique; the authority's reference stored once.
**The hundred-thousandth row** — one submission per tax document; indexed by
`[status, nextAttemptAt]`.
**The adoption test** — the fiscal series is allocated centrally per entity
(R18: "allocated by the brand tier, not offline at a branch") — a Solo tenant is
its own tier.
**The reversal document, not the reversal flag** — a credit note is its own
fiscal document with its own number and its own submission.
**The undo fan-out** — cancelling an invoice after submission is a credit note
(submitted), never a deletion.
**The version stamp** — each submission stores the payload exactly as sent and
the specification version it was built against.
**The erasure the ledger cannot obey** — §6 is this lens, in full.
**The failure path, and who is allowed to walk it** — failed submissions list on
`/admin/tax` for `tax.manage` holders with the authority's error and a retry
action safe by the submission's unique key.

## Work orders

**WO-181.1 — `FiscalComplianceProvider` made document-shaped** (§5), in the
`tax` module, before any implementation.
**WO-181.2 — The UAE ASP implementation**: `FiscalDocument` builder over
`Invoice`/`CreditNote`, the columns PINT AE requires, `FiscalSubmission` + retry
cron, the per-authority gapless series; submission enabled only once the ASP and
specification are confirmed.
**WO-181.3 — `AuditLog` immutability** at the database (ruling 1's prerequisite).
**WO-181.4 — Retention schedule** per data class, with the VAT-record floor, and
the jobs that apply it.
**WO-181.5 — Data-subject-request workflow** and the `privacy.requests.manage`
permission, seeded.
**WO-181.6 — Replayable erasure log** re-applied on any restore before routing.
**WO-181.7 — `LegalHold`** model and its checks before erase/anonymise/close.
**WO-181.8 — Source escrow automation** at every `PlatformRelease`.
**WO-181.9 — Infrastructure as code** for du's estate.
**WO-181.10 — du-scale deployment runbook.**
**WO-181.11 — Operational runbooks** per degradation row, including the breach
notification path.
**WO-181.12 — Generated dependency register** alongside `docs/index/`.

## Acceptance

- `buildDocumentPayload()` for a fixture invoice produces a document that passes
  validation against the published PINT AE rules available at build time; no
  submission occurs without a configured ASP.
- An ASP outage leaves sales unaffected and submissions queued; recovery drains
  the queue with no duplicate submission.
- An erasure pseudonymises every §6 row and redacts raw files, and a restore of
  a backup taken before the erasure re-applies it before the tenant is routed.
- With `AI_PROVIDERS` empty (the du default), no request leaves the tenant's
  deployment for an AI vendor — proven by a network-egress test.
- The escrow agent's clean build from a deposited release passes.

## Out of scope

Legal advice and final legal positions. Choosing the ASP, the SMS/e-mail
vendors or the cloud tooling (operator and contract decisions). Consent
management for marketing (no marketing in this program). Certifying anything —
this document maps controls; certification is an audit du commissions.
