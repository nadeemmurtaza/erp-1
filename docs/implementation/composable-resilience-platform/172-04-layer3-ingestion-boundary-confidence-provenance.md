# 172 — Layer 3: the ingestion boundary — read-only connectors, scored and traced records, and a person who confirms before anything is simulated

> **Status: proposed (2026-09-27), not yet built — and neither is its
> foundation.** This is the one genuinely new named capability in the
> program. It is built as the **inbound half of the `connectors` module that
> docs 36, 132, 160 and 162 already specify** — `OutboundConnector`,
> `InboundWebhookEndpoint`, `OAuthConnection`, `PollConnector`,
> `ExternalRecordLink`, `FileConnector`/`FileConnectorRun`/`FileFormatHandler`
> — **none of which exists in code today** (no `connectors.prisma`, no
> `connectors` module; verified by grep). So this document's first work
> orders are those documents' own (WO-160.1/160.3, WO-162.1/162.2/162.4),
> built as specified with four corrections named in §3; the ingestion pipeline
> (mapping, staging, confidence, confirmation, promotion) lands on top. It
> adds **zero** `KNOWN_MODULE_COUPLINGS` entries (§9 explains the entry the
> program brief expected, and why the checker's own rules refuse it).

## Implementation plan

Written to `CLAUDE.md`'s "Plan before build" template, because this is a
named feature and the plan is what a reviewer reads first.

### Objective
Get an SME's facts — suppliers, items, stock, sales, receivables, payables, a
cash balance — from a spreadsheet, one accounting system and one POS into the
canonical models (doc 169), **read-only** towards the source, with every
record carrying a confidence score, provenance and freshness, and with the
SME confirming that the data describes its business before the engine (doc
173) treats it as a basis for simulation.

### Existing state
- Connectors: specified in docs 36/132/160/162; **unbuilt**.
- CSV import precedents (built): `ProductImportService` (`catalog`,
  `csv-parse`, `IMPORT_ROW_CAP`, dry-run shares the commit path's validation —
  WO-72.3), `ContactImportService` (`crm`), `ExpenseImportService` (`finance`,
  which "always creates a second row" on re-import — the duplicate-ingestion
  failure this document must not repeat).
- AI-assisted mapping (built): `ImportAssistantService` (`catalog`,
  `AiFeature.IMPORT_CLEANUP`) — column mapping, value normalisation, duplicate
  flags (word-token Jaccard ≥ 0.7), always a preview before a write.
- Stock writes from outside `inventory` without a direct import:
  `StockIntakeRegistry` (`core/extension-points/stock-intake.registry.ts`).
- Review surface for pending items: the manager action hub
  (`core/action-hub/`).

### Required change
§3–§8 below.

### Files likely affected
New: `apps/api/prisma/schema/connectors.prisma`;
`apps/api/src/modules/connectors/**` (transport per docs 160/162, plus
`ingestion/`); `apps/api/src/core/extension-points/canonical-record-sink.registry.ts`;
`apps/web/src/app/(admin)/admin/(app)/connections/**`.
Changed: `module-packs.ts` (+`connectors: 'core'`), `modules.registry.ts`
(+`offByDefault: true` entry), `extension-points.module.ts` (+one provider),
`domain-events.ts` (+three events), `packages/shared/src/permissions.ts` (doc
170 §2), and one `onModuleInit()` registration each in `purchasing`, `crm`,
`parties`, `catalog`, `inventory`, `tradingpartners`.

### Dependencies (reused)
`csv-parse` (already a dependency), `StorageService`, `AiService`
(`IMPORT_CLEANUP`), `@newax/shared`'s `secret-crypto`, `normalizePhone`,
`normalizeEmail`, `convertToBase`, `EventBusService`, `AuditService`,
`IdempotencyKey`, `ActionHubSource`, `InventoryService.postUnconditional()`
(through a sink, never imported).

### Risks
Wrong data trusted (mitigated by §5–§6); duplicate or partial imports (§10);
a second writer for an invariant (§8's system-of-record rule, doc 169 §5); a
cron that never fires in a scaled-to-zero tenant (doc 176); cross-border
transfer of SME data through an AI mapping call (doc 181 — AI off by default
for UAE tenants).

### Acceptance criteria
See "Acceptance" at the end — every criterion is a test.

### Out of scope
See "Out of scope" at the end.

### Scope lenses
The full pass is the `## Scope lenses` section below.

## 1. What "read-only" means, exactly

- **Nothing is ever written to the source.** No `OutboundConnector` is
  registered by this program; doc 36's push path exists in the design and is
  not used here.
- **Credentials are read-scoped where the source allows it.** An OAuth
  connection requests the vendor's read-only scopes; an SFTP credential is a
  read-only account on the source's side (a requirement stated to the SME in
  the connection screen, because this platform cannot enforce the other
  side's permissions); an upload has no credential at all.
- **The source remains the system of record** for everything it supplies
  until a dated handover (doc 169 §5, doc 179 Wave 2/3). Ingestion mirrors; it
  never becomes a second authority for the same fact at the same time.

## 2. Where this lives — and why it is not a new pack or a second module

- **Module:** `connectors`, classified `'core'` in `module-packs.ts` and
  registered `offByDefault: true` in `modules.registry.ts`. `module-packs.ts`
  itself rules that "a pack exists only where a vertical owns genuine domain
  data that core cannot express"; connectivity is cross-sector, the same
  reasoning that put `marketplace`, `managed-services` and `accounts` in core.
  A tenant SME's Build Manifest (doc 171) adds `connectors` to its `MODULES`.
- **Why one module, not `connectors` + `ingestion`.** Doc 160 makes
  `ExternalRecordLink` "one generic mapping table every stateful sync reuses".
  Splitting the inbound pipeline into its own module would give that table two
  writers (outbound sync in `connectors`, inbound promotion in `ingestion`) —
  D5's defect by construction — or force one module to import the other. One
  module, one writer. The inbound pipeline lives in
  `apps/api/src/modules/connectors/ingestion/` as that module's internals.

## 3. The foundation: docs 160/162 built as specified, with four corrections

Built exactly as those documents specify — `ConnectorAuthMethod` with
`OAUTH2_AUTHORIZATION_CODE`, `OAuthConnection`, `ConnectorOAuthController`
(start/callback) plus the refresh cron, `PollConnector` with
`runDuePolls()`, the poll-history table doc 160 WO-160.3 names (here
`PollConnectorRun`), `FileConnector`, `FileConnectorRun`
(`@@unique([connectorId, fileChecksum])`), `FileFormatHandler` with
`CsvHandler` first — except:

1. **`ExternalRecordLink`'s unique key** is `@@unique([connectorId,
   ourEntityType, externalId])`, not doc 160's `([connectorId, externalId])`:
   one accounting connector exports suppliers and items whose ids overlap.
   Plus doc 169 §4's provenance columns.
2. **A browser upload is a transport.** Doc 162's `FileTransport` has only
   `SFTP`; its out-of-scope named e-mail and cloud-drive drops, not upload.
   `FileTransport` gains `UPLOAD`: the admin screen streams the file into
   `StorageService` and records a `FileConnectorRun` exactly as an SFTP poll
   would — so re-uploading the same file is the same checksum no-op (doc 162
   §3) and the pipeline downstream has one entry point, not two.
3. **Excel is a format, and it needs a dependency.** `FileFormat` gains
   `XLSX`. No spreadsheet parser is a dependency today (`apps/api/package.json`
   has `csv-parse` and `csv-stringify` only). Per `.claude/rules/dependencies.md`:

   ```
   Dependency: exceljs (maintained, MIT)
   Purpose: parse .xlsx uploads into rows for XlsxHandler
   Existing Alternative: csv-parse — the SME saves the sheet as CSV first
   Why Existing Alternative Is Insufficient: SME spreadsheets are Excel files;
     "save as CSV" loses sheet selection and silently re-formats dates and
     decimals in the SME's own locale, the exact class of error §10's schema-
     drift detector would then flag on every upload
   Security Considerations: parse in a size-capped, row-capped worker path
     (IMPORT_ROW_CAP); never evaluate formulas, read cached values only;
     reject macro-enabled .xlsm
   Maintenance Considerations: one server-side dependency behind
     FileFormatHandler — replaceable by a class swap
   Bundle / Runtime Impact: server-side only, no frontend bundle impact
   Approval Required: yes — named here for the owner's decision before
     install; the vertical slice ships CSV-only if it is not approved
   ```
4. **Secrets are strings, the house convention.** Doc 160 sketches
   `accessTokenEncrypted Bytes`; every other secret in this schema is an
   AES-256-GCM string from `@newax/shared`'s `secret-crypto`
   (`TradingPartner.outboundApiKeyEncrypted`, `SsoConnection.credentialEncrypted`).
   The connector models follow the convention, and every one is write-only:
   never selected by a read path that leaves the connectors service.

The three connector shapes the slice uses:

| Source | Connector | Transport |
|---|---|---|
| A spreadsheet | `FileConnector` (`UPLOAD`, `CSV`/`XLSX`) | admin screen upload |
| One accounting system | `PollConnector` + `OAuthConnection` (`OAUTH2_AUTHORIZATION_CODE`) | the vendor's read API |
| One POS | `FileConnector` (`SFTP` or `UPLOAD` of the POS's scheduled export) **or** `InboundWebhookEndpoint` (doc 132) if the POS pushes | per vendor |

Which accounting system and which POS are Wave 0 decisions (doc 179), made
per integration pattern; the mechanism above does not change with the choice.

## 4. The pipeline, and its three tables

```
RECEIVE ─▶ PARSE ─▶ MAP ─▶ SCORE ─▶ STAGE ─▶ (CONFIRM) ─▶ PROMOTE ─▶ PROJECT
 file run    pure     pure    pure     rows      human       sinks, one    ObservedSale /
 poll run                                                    tx per chunk  ObservedCashBalance
 webhook
```

`PARSE`, `MAP` and `SCORE` are pure functions over bytes and data — no
`prisma.` write, no `publish(` — so the whole front half of the pipeline can
replay last month's raw files with nothing written (ruling 3: *decide* is pure,
*apply* is the single writer). `STAGE` and `PROMOTE` are the writes.

```prisma
// connectors.prisma — the inbound pipeline's own tables. Every other-module
// reference is a bare scalar (ADR-012).

enum IngestionRecordKind {
  SUPPLIER
  SUPPLIER_ITEM      // a supplier can ship an item: SupplierProduct
  SUPPLIER_BILL
  CUSTOMER
  PRODUCT
  LOCATION
  STOCK_POSITION     // an on-hand snapshot at a location
  SALES_INVOICE
  SALE_LINE          // a POS receipt or daily-sales line with no document of its own
  CASH_BALANCE
}

enum IngestionMappingStatus { DRAFT CONFIRMED SUPERSEDED INVALIDATED }

/// How one connector's data for one record kind maps onto the canonical
/// candidate shape. Versioned; a CONFIRMED version is immutable (the
/// version-stamp lens) — a change is a new version.
model IngestionMapping {
  id                String   @id @default(cuid())
  connectorId       String
  recordKind        IngestionRecordKind
  version           Int
  /// { canonicalField: { from: "source column or JSON path", transform?: "…" } }
  /// — a closed set of named transforms (trim, upper, parseDate:<fmt>,
  /// decimalToMinor, …), never free code.
  fieldMap          Json
  /// sha256 over the sorted (source field, inferred type) pairs this mapping
  /// was confirmed against — the schema-drift detector's reference (§10).
  schemaFingerprint String
  /// Where a source names no location, the one this mapping names instead —
  /// never InventoryService.defaultLocationId() implicitly (doc 169 lenses).
  defaultLocationId String?
  /// The system-of-record window this mapping claims (doc 169 §5).
  authoritativeLocationIds String[]
  authoritativeFrom DateTime?
  authoritativeUntil DateTime?
  status            IngestionMappingStatus @default(DRAFT)
  /// Every required field of recordKind (the table below) is mapped — set by
  /// the pure required-fields check when the version is saved; connect
  /// success's stage S2 reads it (doc 180 §1).
  requiredFieldsSatisfied Boolean @default(false)
  /// Whether a DRAFT's field map came from an AI suggestion (IMPORT_CLEANUP)
  /// — kept so review shows the SME which choices a model proposed.
  aiSuggested       Boolean  @default(false)
  authoredById      String
  confirmedById     String?
  confirmedAt       DateTime?
  invalidatedAt     DateTime?
  invalidatedReason String?
  createdAt         DateTime @default(now())

  @@unique([connectorId, recordKind, version])
  @@index([connectorId, recordKind, status])
}

enum IngestionBatchStatus {
  RECEIVED
  PARSED
  AWAITING_CONFIRMATION   // first batch under a new mapping version (§6)
  PROMOTING
  PROMOTED
  PARTIALLY_PROMOTED      // a human rejected the remainder (§10)
  HELD_SCHEMA_DRIFT
  HELD_ERROR_RATE         // too many rows failed to parse (§10)
  REJECTED
  FAILED
}

enum IngestionBatchTrigger { UPLOAD FILE_ARRIVAL SCHEDULED_POLL WEBHOOK MANUAL_RETRY }

/// One unit of arrival: one file run, one poll cycle's pages, or one
/// webhook delivery window.
model IngestionBatch {
  id               String   @id @default(cuid())
  connectorId      String
  mappingId        String
  trigger          IngestionBatchTrigger
  /// FileConnectorRun.id or PollConnectorRun.id this batch was parsed from.
  sourceRunId      String
  /// sha256(connectorId + the source's own batch identity: a file checksum,
  /// a poll cursor window, a webhook delivery id). The batch-level
  /// "second copy of the write" guard.
  idempotencyKey   String   @unique
  status           IngestionBatchStatus @default(RECEIVED)
  recordsTotal     Int      @default(0)
  recordsSimulation Int     @default(0)
  recordsWarning   Int      @default(0)
  recordsAdvisory  Int      @default(0)
  recordsExcluded  Int      @default(0)
  recordsFailed    Int      @default(0)
  recordsDuplicate Int      @default(0)
  /// Highest record ordinal whose promotion has committed — the resume point
  /// after a crash mid-promotion (§10, "partial import").
  promotedThroughOrdinal Int?
  /// Set when drift is detected: ADDITIVE (safe, proceeds) or BREAKING (held).
  driftKind        String?
  confirmedById    String?
  confirmedAt      DateTime?
  receivedAt       DateTime @default(now())
  completedAt      DateTime?
  failureReason    String?

  @@index([connectorId, receivedAt])
  @@index([status])
}

enum IngestionConfidenceTier { SIMULATION WARNING ADVISORY EXCLUDED }
enum IngestionRecordStatus { STAGED PROMOTED SKIPPED_DUPLICATE EXCLUDED FAILED REJECTED }
enum IngestionSeverity { NONE WARNING CRITICAL }

/// One source record, parsed, mapped, scored — a REQUEST-shaped holding row,
/// the same "pending before the real row" posture B2BOrderRequest,
/// PurchaseRequisition and MarkdownSuggestion already take. Never a second
/// canonical model: it holds a candidate until a sink writes the real row.
model IngestionRecord {
  id                 String   @id @default(cuid())
  batchId            String
  connectorId        String   // denormalised for the record-level unique key
  ordinal            Int      // row/position within the batch
  recordKind         IngestionRecordKind
  /// The source's own identity for this record: its id, or its natural key
  /// when it has none (invoice number + issuer; sku; E.164 phone).
  sourceRecordKey    String
  /// sha256 of the normalised source payload — same key + same hash is the
  /// same fact arriving twice; same key + new hash is a change.
  sourceVersionHash  String
  sourceUpdatedAt    DateTime?
  /// The normalised canonical candidate the sink will receive.
  candidate          Json
  confidenceBps      Int
  confidenceTier     IngestionConfidenceTier
  /// [{ rule: "ENTITY_MATCH_NAME_ONLY", deltaBps: -2000, detail: "…" }, …]
  confidenceReasons  Json
  /// The scoring policy version applied — a later policy never rescores
  /// silently (version-stamp lens).
  confidencePolicy   String
  status             IngestionRecordStatus @default(STAGED)
  severity           IngestionSeverity     @default(NONE)
  errorCode          String?
  errorMessage       String?
  resolvedById       String?
  resolvedAt         DateTime?
  canonicalEntityType String?
  canonicalEntityId   String?
  promotedAt         DateTime?
  createdAt          DateTime @default(now())

  @@unique([batchId, ordinal])
  @@unique([connectorId, recordKind, sourceRecordKey, sourceVersionHash])
  @@index([batchId, status])
  @@index([connectorId, recordKind, sourceRecordKey])
  @@index([confidenceTier, status])
}
```

Checked against the schema before naming: no model or enum called `Ingestion*`
exists; `rag.prisma` already declares `enum IngestStatus` and
`model DocumentSource`, so every name above avoids both (Prisma enums share
one namespace across schema files).

**Required fields per kind** (a missing required field fails the record,
`severity: CRITICAL`; it is never scored):

| Kind | Required | Used by the engine if present |
|---|---|---|
| `SUPPLIER` | name; one of taxId, phone, email, source id | country, currency, lead time, payment terms |
| `SUPPLIER_ITEM` | supplier ref; item ref (sku, barcode or source id) | last cost + currency, lead time, MOQ |
| `SUPPLIER_BILL` | supplier ref; bill reference; issue date; amount | currency (else tenant default, scored down), due date, amount paid |
| `CUSTOMER` | name; one of phone, email, taxId, source id | taxId (B2B) |
| `PRODUCT` | name; sku or barcode | cost, price, kind (`GOODS`/`SERVICE`) |
| `LOCATION` | source code; name | — |
| `STOCK_POSITION` | item ref; location ref (or `defaultLocationId`); quantity; as-of time | — |
| `SALES_INVOICE` | number; customer ref; issue date; total | currency, due date, status/paid, lines (sku, qty, unit price, line total) |
| `SALE_LINE` | item ref; location ref (or `defaultLocationId`); occurred-on date; quantity; revenue | currency |
| `CASH_BALANCE` | account ref; as-of time; balance | currency |

**Mapping suggestions.** A new connector's first mapping is proposed two ways:
deterministically (exact and alias header matches — `supplier_name`,
`vendor`, `Vendor Name` → `SUPPLIER.name`, an alias table in code, reviewed)
and, only when `AI_PROVIDERS` is configured **and** the tenant's manifest allows
AI (doc 181: off by default for UAE tenants for residency), by
`AiService.complete(AiFeature.IMPORT_CLEANUP, …)` — reusing the feature value
doc 09 WO-9.10 defined for exactly this ("infer column mappings, normalise
inconsistent values… flag likely duplicates"), not a new `AiFeature`.
`ImportAssistantService` itself is not imported (it lives in `catalog` and its
column list is product-specific); its *discipline* is copied: a suggestion is
a DRAFT, `aiSuggested` is recorded, and nothing is written until a person
confirms (doc 09's rule 1, "the AI proposes; a person disposes").

## 5. The confidence model

Four tiers, fixed by the program and stored as integer basis points (a score
is not money, but House Rule 5's "never a float" is kept so thresholds compare
exactly):

| Score | Tier | What happens |
|---|---|---|
| **0.90–1.00** (9000–10000 bps) | `SIMULATION` | Promoted; used in simulation |
| **0.70–0.89** (7000–8999) | `WARNING` | Promoted; used in simulation **with a warning** carried to every figure it touches (doc 173 §2) |
| **0.50–0.69** (5000–6999) | `ADVISORY` | **Not promoted.** Shown in review and counted in the control center's coverage gap ("n records held at advisory"); never in a simulation |
| **< 0.50** (< 5000) | `EXCLUDED` | Not promoted, not counted as coverage; listed in review with the reasons |

The score is produced by one **pure, deterministic** function —
`scoreRecord(input: ScoreInput): { bps: number; tier: IngestionConfidenceTier;
reasons: ScoreReason[] }` in `connectors/ingestion/confidence.ts` — with no
I/O: its context (existing links, natural-key matches, the source's own recent
medians) is resolved by the caller and passed in, so the same input always
yields the same score and a reviewer can reproduce any number from
`confidenceReasons`. The policy below is `CONFIDENCE_POLICY = 'cp-1'`, stored
on every record; a changed rule is `cp-2`, and existing records keep the
score they were promoted under.

**Start from the source-class ceiling:**

| Source class | Ceiling | Why |
|---|---|---|
| A structured, signed e-invoice (PINT AE from a supplier's ASP, doc 181) | 10000 | Machine-generated, schema-validated, legally the supplier's own document |
| A vendor API over `OAuthConnection` | 9800 | System-generated; the residual is *our* interpretation of their fields |
| A system's own scheduled export file (POS, accounting) | 9600 | System-generated; column semantics inferred from headers |
| A human-maintained spreadsheet upload | 9500 | Human-typed; can reach `SIMULATION` only if nothing below deducts more than 500 |

**Then apply every deduction that fires** (a record can hit several):

| Rule | Δ bps | Fires when |
|---|---|---|
| `MAPPING_UNCONFIRMED` | cap at 6999 | The record's mapping version is still `DRAFT` — it is shown in the preview at advisory, and nothing promotes until §6's confirmation |
| `ENTITY_MATCH_SOURCE_ID` | 0 | Resolved through an existing `ExternalRecordLink` for this connector |
| `ENTITY_MATCH_NATURAL_KEY` | 0 | Resolved by an exact natural key: barcode/GTIN, sku, taxId, E.164 phone (`normalizePhone`), email (`normalizeEmail`) |
| `ENTITY_MATCH_NAME_ONLY` | −2000 | Resolved only by normalised name |
| `ENTITY_NEAR_DUPLICATE` | −500 | A new entity whose normalised name has word-token Jaccard ≥ 0.7 with an existing one of the same kind (the threshold `ImportAssistantService` already uses) — "The exact-string gate" |
| `ENTITY_CONFLICT_WITH_SOR` | −2000 | Another source is the system of record for this entity and disagrees on a key field (the SoR link is not displaced) |
| `ENGINE_FIELD_MISSING` | −500 each, at most −1500 | A field the engine uses (right-hand column above) is absent |
| `CURRENCY_DEFAULTED` | −1000 | No currency on the record; the tenant's `BRAND.locale.currency` was assumed |
| `UNIT_UNDECLARED` | −500 | A quantity with no unit on a kind where units vary (no `UnitOfMeasure` model exists — doc 169 §8) |
| `VALUE_ZERO_PRICE` | −1000 | Quantity > 0 with a price or amount of 0 |
| `VALUE_FUTURE_DATE` | −3000 | Occurred/issued more than one day in the future |
| `VALUE_OUTLIER` | −1500 | An amount more than 20× (or less than 1/20th of) this source's trailing median for the same kind — catches a source switching major/minor units |
| `STALE` | −1000 / −3000 | `sourceUpdatedAt` (or the run time when absent) older than the kind's freshness window / older than 4× it |
| `NEGATIVE_ON_HAND` | −1500 | A stock snapshot below zero — still a record, promoted as a variance if the tier allows (§8) |

Freshness windows: `STOCK_POSITION` and `SALE_LINE` 48 h; `CASH_BALANCE` 72 h;
`SUPPLIER_BILL` and `SALES_INVOICE` 7 days; master data (`SUPPLIER`,
`SUPPLIER_ITEM`, `CUSTOMER`, `PRODUCT`, `LOCATION`) 90 days.

**Worked examples** (all under a confirmed mapping):
a spreadsheet supplier row matched by TRN, every field present → 9500,
`SIMULATION`; the same row with no lead time and no currency → 9500 − 500 − 1000
= 8000, `WARNING`; an accounting-API bill matched by source id, due date
present → 9800, `SIMULATION`; a POS item matched only by name → 9600 − 2000 =
7600, `WARNING`; the same item also 3 days stale on a 48 h window → 7600 −
1000 = 6600, `ADVISORY`, held.

**A score describes a record, never a quantity.** Nothing in the engine
multiplies a stock level or an amount by a confidence. A score decides which
partition of the graph a record's edges fall into (doc 173 §2). Treating 0.8
confidence as "80% of the stock exists" would be inventing a statistical
meaning the scorer never had — the exact thing R21 forbids.

## 6. Human confirmation before simulation

The rule the program states — *a human confirms before simulating* — is
applied at the level a person can actually attest to. An SME owner can say
"yes, this column is my supplier and this one is my cost price" and "yes, the
first import looks like my business". They cannot meaningfully review a
15-minute poll's 40 records every 15 minutes; asking them to would train them
to click "confirm" without reading, which is worse than asking nothing.

1. **Structure is confirmed once per mapping version.** The first batch under
   a new `IngestionMapping` version stops at `AWAITING_CONFIRMATION`. The
   confirmation screen shows the dry run of that batch: counts per tier, a
   sample of rows per tier with their reasons, every entity-resolution
   decision (matched to what / created new), and every field left unmapped.
   `connectors.ingestion.confirm` confirms. The confirmation writes, **in the
   same transaction**, an evidence-class audit row (`AuditService.recordEvidence`,
   ruling 9) naming the confirmer, the mapping version, the batch, the tier
   counts, and whether the confirmer also authored the mapping (the doc 170 §2
   same-person visibility in place of a toxic-pair refusal).
2. **Content under a confirmed structure promotes by tier.** Every later batch
   under that version promotes `SIMULATION` and `WARNING` records automatically;
   `ADVISORY` records stay staged for review; `EXCLUDED` never move.
3. **Any change of structure returns to step 1:** a new mapping version, a
   new record kind for a connector, the first batch of a new connector, or a
   breaking schema drift (§10).
4. **An advisory record becomes usable only through a person.** Review offers
   three actions — confirm the proposed match, choose a different match, or
   mark "not my business" (→ `REJECTED`, kept, never deleted); each re-scores
   the record under the same policy with the human decision recorded as its
   match rule.
5. **A simulation always says what it rests on.** Doc 174 persists, with every
   run, the confirmed mapping versions and batches whose data it used; data
   from an unconfirmed mapping is not in the graph at all, so it cannot leak
   into a figure.
6. **Support may draft, never confirm.** `connectors.ingestion.confirm` is not
   grantable to a support session (doc 170 §4.2): confirmation is the SME's
   attestation, and a support engineer who confirms is manufacturing consent.

## 7. Provenance and freshness

Every promoted figure can be walked back to bytes:

```
figure on /admin/resilience
  └─ graph edge (doc 173: sourceEdges[])
       └─ canonical row (SupplierProduct, VariantLocationStock, SupplierBill, ObservedSale…)
            └─ ExternalRecordLink (sourceSystem, externalId, confidence, mappingId, lastIngestionRecordId)
                 └─ IngestionRecord (candidate, confidenceReasons, sourceVersionHash)
                      └─ IngestionBatch (mapping version, confirmation)
                           └─ FileConnectorRun / PollConnectorRun (storageKey → the raw file or raw pages)
```

Freshness is carried at three grains and surfaced, never assumed:

| Grain | Field | Surfaced where |
|---|---|---|
| Connector | last successful `PollConnectorRun`/`FileConnectorRun` time | Connections screen; doc 176's freshness SLI |
| Entity | `ExternalRecordLink.sourceUpdatedAt` (else `lastSyncedAt`) | review; the `STALE` rule |
| Simulation input | the oldest `sourceUpdatedAt` among the edges a run used, per record kind | doc 174's run header ("stock as of 09:12, sales as of yesterday") |

## 8. Writing into the modules that own the data — an extension point, not an import

The connectors module must create `Supplier`s, `SupplierProduct`s,
`SupplierBill`s, `Contact`s, `Party`s, `Product`s/`ProductVariant`s,
`Location`s, `Invoice`s and stock true-ups — rows owned by seven other modules,
each with its own writer and its own rules. Importing seven services would be
seven `KNOWN_MODULE_COUPLINGS` entries the checker would rightly refuse. The
codebase's own answer to "reach another module without importing it" is a
registry in `core/extension-points/`, and `StockIntakeRegistry` is the exact
precedent: it lets `catalog`'s CSV import write stock "without importing
`inventory` directly".

```ts
// apps/api/src/core/extension-points/canonical-record-sink.registry.ts — new
export interface SinkContext {
  tx: Prisma.TransactionClient;
  /** The human whose confirmation this promotion rests on (§6) — never null. */
  actorId: string;
  provenance: { connectorId: string; sourceSystem: string; externalId: string; mappingId: string; ingestionRecordId: string };
}

export interface CanonicalRecordSink<TCandidate = unknown> {
  readonly kind: IngestionRecordKind;
  /** Pure: this module's own validation of a candidate, no write — the
   *  dry-run half (ruling 3). Called at SCORE time and again at PROMOTE. */
  validate(candidate: TCandidate): { ok: true } | { ok: false; code: string; message: string };
  /** The one writer for this kind, inside the caller's transaction. MUST be
   *  idempotent on its resolution keys. MUST NOT publish the native
   *  domain events that would post the mirrored fact to this platform's
   *  ledger (SupplierBillRaised, OrderPlaced, …): a mirrored document is an
   *  observation of another system's books (doc 169 §5). */
  mirror(candidate: TCandidate, ctx: SinkContext): Promise<{ entityType: string; entityId: string; outcome: 'created' | 'updated' | 'unchanged' }>;
}

@Injectable()
export class CanonicalRecordSinkRegistry {
  private readonly sinks = new Map<IngestionRecordKind, CanonicalRecordSink>();
  /** Called once per kind, from the owning module's onModuleInit(). */
  register(sink: CanonicalRecordSink): void { /* throws on a second sink for a kind */ }
  /** Null when the owning module is not in MODULES — the caller holds the
   *  record STAGED with NO_SINK_REGISTERED, never fails. */
  get(kind: IngestionRecordKind): CanonicalRecordSink | null { /* … */ }
}
```

**Why a transaction crosses the registry here, when `StockIntakeRegistry`'s
does not.** `StockIntakeRegistry`'s own header says it is "not for… anything
else that must commit in the SAME database transaction" and runs best-effort.
Promotion is different: the canonical write, the `ExternalRecordLink` upsert
and the `IngestionRecord` flip to `PROMOTED` must commit together or not at
all — otherwise a crash between them creates a canonical row with no
provenance, or a `PROMOTED` record with no row. Passing the Prisma
transaction client through an extension point is not a module import (the
checker reads `import` statements), and it keeps exactly-once promotion
provable.

| Kind | Sink registered by | Real writer and model(s) | Resolution keys, in order |
|---|---|---|---|
| `SUPPLIER` | `purchasing` (+ the parties sink in the same tx) | `Supplier` + `Party` (SUPPLIER role); `Party.externalRef/externalSystem` set from the SoR link | source id → taxId → E.164 phone → normalised name |
| `SUPPLIER_ITEM` | `purchasing` | `SupplierProduct` upsert on `@@unique([supplierId, variantId])`; `lastCost` in **base** minor units via `convertToBase` | (supplier, item) |
| `SUPPLIER_BILL` | `purchasing` | `SupplierBill` with R16's quadruple and `baseAmountMinor`; no `SupplierBillRaised` | source id → (supplier, reference) |
| `CUSTOMER` | `crm` (+ parties for a business) | `Contact` (+ `Party` CUSTOMER role, `Contact.partyId`) | source id → taxId → E.164 phone → email |
| `PRODUCT` | `catalog` | `Product` + `ProductVariant`, status `DRAFT` (doc 169 §3.3); `costPrice` only while the item master is the SoR | source id → barcode → sku |
| `LOCATION` | `inventory` | `Location`, `code = EXT-<connector code>-<source code>` (`@unique`) | source id → code |
| `STOCK_POSITION` | `inventory` | `InventoryService.postUnconditional()` with `delta = snapshot − current`, reason `COUNT`, `refType: 'IngestionBatch'`, `refId: batchId` — a snapshot is a count and a RECORD; a negative snapshot becomes the `POS_OFFLINE_VARIANCE` + `StockVariance` pair R5 already defines | (variant, location) |
| `SALES_INVOICE` | `tradingpartners` (today's writer of `Invoice`) | `Invoice` with `contactId` (doc 169 §3.4), number `EXT-<connector code>-<source number>`; plus one `ObservedSale` per resolvable line (connectors' own table) | source id → (customer, number) |
| `SALE_LINE` | — (connectors' own table) | `ObservedSale` | `ingestionRecordId` |
| `CASH_BALANCE` | — (connectors' own table) | `ObservedCashBalance` | `ingestionRecordId` |

**Promotion is chunked.** Records promote in ordinal order, 200 per
transaction (`PROMOTION_CHUNK_SIZE`), so no single transaction holds locks for
a whole 10,000-row file ("The busiest minute, and the lock you hold through
it"); `promotedThroughOrdinal` advances with each committed chunk. Stock
true-ups for one location are ordered by variant id, the deadlock-avoiding
order `InventoryService.moveMany()` already uses.

**The system-of-record check runs at confirmation, not per row.** A mapping
that claims AP/AR documents (`SUPPLIER_BILL`, `SALES_INVOICE`) is refused when
`accounting` is in the tenant's `MODULES` (`AppConfigService.isModuleEnabled()`
— a configuration read, not a module import): with a native ledger live, the
native documents are the system of record. A mapping that claims a location
already receiving native `POS_SALE` movements is refused likewise (doc 169
§5).

## 9. `KNOWN_MODULE_COUPLINGS` — the entry the brief expected, and why it is not added

**The declaration mechanism** is a `Set` literal in
`scripts/check-module-boundaries.mjs` (`:134`), one string per
`'<from> -> <to>'` pair, each with a comment stating the same-transaction
write that justifies it; the checker fails the build on an undeclared
module-to-module import (`:386–399`) and on a declared entry that no longer
happens (its stale message: "the list must only shrink", `:435–442`). The
list's own comment (`:122–132`) is explicit that it is **not** a burn-down list
like `KNOWN_VIOLATIONS`: these are writes "meant to stay direct imports
permanently", which is why the bar for a new one is a same-transaction write
and nothing less. Doc 144's entry reads:

```js
  // online-stock.service.ts's assignFulfillingBranch() (144-supply-chain-
  // resilience-planning-engine.md, R26) reverses stock at an order's
  // current fulfilling location and re-commits it at the new one
  // (InventoryService.move(), twice) inside one transaction — …
  'planning -> inventory',
```

**What the program brief asked for** was a mirror of that entry letting the
new ingestion pack "reach `planning`": `'connectors -> planning'` (or
`'ingestion -> planning'`). It is **not added**, for four reasons, each from
the repository's own rules:

1. **There is no same-transaction write.** `planning` writes nothing on the
   connectors module's behalf; the connectors module writes nothing into
   `planning`'s tables. The checker's header reserves the list for "a write
   that must commit in the SAME database transaction as the write that caused
   it", and the list's own comment: "Adding a fifth entry needs the same
   same-transaction justification in the pull request — 'the check was in my
   way' is not one."
2. **`RETAIL-ERP.md` Part 4 rules it out for this layer by name:** the
   intelligence layer reads "other modules' tables through `PrismaService`…
   and write[s] only their own — so… they add **zero module couplings**."
3. **The engine already reads other modules' rows by bare Prisma read** — that
   is how `DependencyGraphService.build()` reads `SupplierProduct`,
   `BomComponent`, `VariantLocationStock`, `StockTransfer` and `SupplierBill`
   (`dependency-graph.ts:44–60`) with no import of `purchasing`, `bom`,
   `inventory` or `transfers`. It reads `ExternalRecordLink`, `ObservedSale`
   and `ObservedCashBalance` the same way (doc 173).
4. **What the connectors module does need — writing into seven owning modules
   inside one transaction — goes through `CanonicalRecordSinkRegistry` (§8),**
   the extension point the checker's own header prescribes ("Everything else
   goes through a domain event or an extension point
   (`apps/api/src/core/extension-points/`) instead of a direct import — see
   `StockIntakeRegistry` for the shape").

The connectors module announces what happened through domain events, never a
call into another module:

```ts
// core/events/domain-events.ts — additive
IngestionBatchPromoted: 'connectors.ingestion_batch_promoted',     // { batchId, connectorId, recordKinds, tierCounts, promotedAt }
IngestionHeld:          'connectors.ingestion_held',               // { batchId, connectorId, reason: 'SCHEMA_DRIFT' | 'ERROR_RATE' | 'AWAITING_CONFIRMATION' }
ConnectorNeedsReauth:   'connectors.needs_reauth',                 // { connectorId, since }
```

The control center does not even need to subscribe: its "new data since your
last simulation" banner is computed on read, comparing the latest `PROMOTED`
batch with the latest persisted run (doc 174 §4), both bare reads, no state
kept. The events exist for two readers: doc 180's `TenantMilestonePoller`, which
reads `ingestion_batch_promoted` out of the tenant's outbox for the
`FIRST_BATCH_PROMOTED` milestone (the `UsageMeteringService` pattern, with its
own cursor), and the connectors module's own `ConnectorsListener`, which
handles `ingestion_held` and `needs_reauth` with `@OnDomainEvent` and notifies
the holders the audience lens names through core's `NotificationsService` —
exactly how `InventoryListener` handles its own module's `ProductLowStock`
(`modules/supply-chain/inventory/inventory.listener.ts:19`). The action-hub item is
separate and needs no event: the hub is pull-based
(`ActionHubRegistryService.collect()` calls each registered source's
`fetchFor(user)`), so the connectors module registers a `ConnectorsActionSource`
that reads held batches and reauth-required connectors on demand, as
`leave-request-action.source.ts` does for payroll. **Net effect
on the checker: `connectors`
imports no module, and no module imports `connectors`.** If a future
requirement ever does need a same-transaction write (none is identified), its
entry would take the form `'connectors -> <module>'` with that write named in
its comment, and would need this document amended first.

## 10. Failure modes, and what each one leaves behind

| Failure | Detected by | What happens | State left behind | Recovery |
|---|---|---|---|---|
| **Connector outage** (API 5xx, SFTP unreachable, DNS) | `PollConnectorRun` status `FAILED` | Retried on the next tick with exponential backoff (the outbox's own `min(2^n s, 300 s)` curve); after 5 consecutive failures the connector's circuit opens (doc 38 §2's `CircuitBreaker`, built by WO-176.2) and polls stop for the cooldown instead of piling up | The last promoted data stays in the graph, ageing; `STALE` fires on the next scoring; the control center shows "accounting data as of <time>" | Automatic when the source returns (half-open trial); an action-hub item for `connectors.manage` holders after 24 h |
| **Credential expired or revoked** | Refresh failure in the OAuth refresh cron | Connector status `REAUTH_REQUIRED` (added to doc 36's `ConnectorStatus`); `ConnectorNeedsReauth` published | Same as an outage — nothing is lost, nothing new arrives | The SME reconnects (start → callback); the next poll resumes from `lastCursor` |
| **Duplicate ingestion** | Three keys, one per level | Same file: `FileConnectorRun @@unique([connectorId, fileChecksum])` → no-op. Same poll window: `IngestionBatch.idempotencyKey @unique` → no-op. Same record in overlapping windows: `IngestionRecord @@unique([connectorId, recordKind, sourceRecordKey, sourceVersionHash])` → `SKIPPED_DUPLICATE`. Same record, changed content: a new `sourceVersionHash` → an update through the sink | No duplicate canonical row, no duplicate `ObservedSale` (`ingestionRecordId @unique`) | None needed; the duplicate count is visible on the batch |
| **Partial import** (process killed mid-promotion) | Batch left in `PROMOTING` with `promotedThroughOrdinal = n` | Chunks ≤ n committed atomically (canonical row + link + record flip together); records > n still `STAGED` | A batch that is half-applied **and says so**: the control center labels any simulation run meanwhile "batch X promoted n of m" | Default: the promotion job resumes from `n + 1` on its next run (idempotent by every key above). Human alternative: "reject remainder" → records > n `REJECTED`, batch `PARTIALLY_PROMOTED`. A full reversal of promoted records is compensating facts (negative `ObservedSale` rows, a re-applied previous stock snapshot), **never a delete** (the owner's no-deletion rule) |
| **Row-level parse failures** | `IngestionRecord.status = FAILED`, `severity = CRITICAL`, with `errorCode` | Other rows proceed ("The weaker writer": every row gets its own outcome) | Failed rows listed with their raw values | Fix at source and re-send (a new `sourceVersionHash`), or fix the mapping (a new version → §6) |
| **Error-rate spike** | > 5% of a batch's rows fail (minimum 20 rows) | Batch `HELD_ERROR_RATE`, nothing promotes — a spike is almost always a mapping or format problem, not bad data | Staged, inspectable | `connectors.ingestion.confirm` releases after a fix, or rejects |
| **API timeout** mid-pagination | Per-request timeout (30 s, `AbortController`) | Pages are staged one at a time and `PollConnector.lastCursor` advances **per staged page**, never per run; a timeout abandons only the in-flight page | Records only from complete pages — never a half-parsed record | The next tick resumes from the last staged page; repeated timeouts count toward the circuit |
| **Schema drift** (the source changes its export) | `schemaFingerprint` of the arriving file/page ≠ the confirmed mapping's | **Additive** drift (new fields; every mapped field still present with its type) proceeds, `driftKind = 'ADDITIVE'` recorded. **Breaking** drift (a mapped field missing, renamed, or changing type — including a date or decimal format change, detected as a per-column parse-failure spike) → batch `HELD_SCHEMA_DRIFT`, mapping `INVALIDATED`, `IngestionHeld` published | Nothing from the drifted batch promotes; last confirmed data stays and ages | A new mapping version, confirmed under §6 step 1; held batches re-parse against it |
| **Source semantics change silently** (amounts switch from major to minor units) | `VALUE_OUTLIER` fires across the batch | Records score down (typically to `ADVISORY`); if > 5% fire, the batch is `HELD_ERROR_RATE` | Held | Mapping transform fixed (`decimalToMinor` vs `integerMinor`) → new version |
| **Owning module absent** | `CanonicalRecordSinkRegistry.get(kind)` returns null | Records of that kind stay `STAGED`, `errorCode = NO_SINK_REGISTERED` | Visible, not an error | Add the module to the manifest (doc 171) |
| **Tenant isolation** | By construction | Connectors run inside the tenant's own deployment against its own database; credentials are encrypted with that deployment's own key; there is no path to another tenant's database (doc 39) | — | — |

## 11. What the SME and NEWAX support actually use

- **Settings → Connections** (`/admin/connections`, nav key `connections`,
  group `settings`, permission `connectors.manage`): register a connector,
  upload a file, "Connect your account" (OAuth start), map fields with the
  dry-run preview, and — for `connectors.ingestion.confirm` holders — confirm.
- **Connections → Review** (`/admin/connections/review`,
  `connectors.ingestion.review`): batches by status, records by tier with their
  reasons, advisory resolution (§6 step 4), held batches.
- **The action hub** (`/admin/my-actions`): a `connectors` `ActionHubSource`
  lists batches awaiting confirmation, held batches and reauth requests, each
  deep-linking to the screen that acts on it — the hub never acts itself.
- No new nav group: Connections sits under Settings, because Law 3 ("it should
  feel like there are only a few features") and the pipeline is set up once and
  then runs.

## Scope lenses

**The five shop-scale lenses first.**
*The transaction, start to finish* — connect → map → preview → confirm →
promote → the engine uses it → the SME sees its own supplier in a simulation;
every step has a screen (§11). *The other side of the same transaction* — NEWAX
support's view is a purpose-scoped support session (doc 170 §4) onto the same
review screens; the SME's owner is the confirmer. *What happens after "done"* —
disconnect a connector (status `SUSPENDED`, data stays and ages, links remain);
"this record isn't mine" (`REJECTED`, kept); reversal by compensating facts
(§10). *The integrations a real business needs* — real OAuth2 authorization
code with refresh, real SFTP, real CSV/XLSX, real signed webhooks; no
"imported" status enum standing in for an integration. *The policy layer* — the
confidence policy is versioned code (`cp-1`) and the confirmation rule is §6;
neither is a free-form setting.

**The actor with three tables** — the SME's own staff are `User`s; a
counterparty the source describes becomes `Supplier`+`Party`, `Contact`
(+`Party` CUSTOMER) or neither (a record held for review); a pushing POS is an
`InboundWebhookEndpoint`, never a `User`.
**The principal with no permission key** — `InboundWebhookEndpoint`: HMAC over
the raw body, fail-closed, can only create staged records for its own
connector (doc 170 §3.1); the polling cron acts under no principal and its
writes stop at `STAGED` — promotion names the confirming human as `actorId`.
**The grant that ends itself** — an `OAuthConnection` ends at its token expiry
unless refreshed; a support session's purposes end with its grant; a
connector `SUSPENDED` stops all runs immediately.
**Whose rows, and which columns** — `connectors.ingestion.review` sees staged
candidates and errors; no role sees a credential after it is written;
`ObservedCashBalance.externalAccountRef` is stored masked; raw files in
`StorageService` are reachable only through the review screen's own
permission.
**The threshold nobody approves alone** — confirmation has no amount band
(it attests data, it commits no money); the one threshold is structural —
a support session can never confirm (§6 step 6).
**The toxic pair, caught at grant or at act** — `connectors.manage` +
`connectors.ingestion.confirm` is allowed and made visible (the confirmation
row records whether the confirmer authored the mapping) rather than refused,
because a Solo SME's owner must hold both (ruling 16).
**Authority and blast radius** — who may change the confidence policy: nobody
at runtime (it is code, versioned, reviewed); who may change a mapping:
`connectors.manage`, producing a new version that needs confirmation; the
worst value an SME can set is a wrong mapping confirmed in good faith, whose
blast radius is its own tenant's simulations — bounded by the tier partition
(doc 173) and reversible by a new version plus compensating facts.
**Audience is a capability, not an address** — `IngestionHeld` and
`ConnectorNeedsReauth` reach holders of `connectors.manage` (and
`connectors.ingestion.confirm` for held batches) through the action hub and
`NotificationsService`; zero holders → the tenant's `billingContactEmail`
through the control plane (named escalation); many holders → one action-hub
item, not a message each. No resolver for "holders of key K" exists today
(the lens index: "no method anywhere counts how many distinct people hold a
permission key"); WO-172.9 builds `PermissionsResolverService.holdersOf(key)`
as the first feature that needs it (ruling 16).
**Request or record — classify every write** — staging a record: RECORD of
what arrived (never refused; a bad row is recorded as `FAILED`, not dropped).
Promotion: RECORD of an observation, never refused once the tier and the
confirmation allow it; a disagreement with the system of record becomes a
scored-down record, not a rejection. Confirming a mapping: REQUEST.
**The movement with no address** — every `STOCK_POSITION` and `SALE_LINE`
names a `Location` from the source or from `IngestionMapping.defaultLocationId`;
`InventoryService.defaultLocationId()` is never reached on this path, and a
record with neither is `FAILED` with `LOCATION_UNRESOLVED`.
**Four hours down, the counter stays open** — the source down: the SME keeps
trading on its own systems, which *are* the system of record; nothing on paper
is needed here, and when the source returns the cursor resumes and the
overlap is deduplicated (§10). This platform down: the source keeps
accumulating; the next poll catches up from the cursor.
**The unwritten posting rule** — ingestion posts nothing: sinks never publish
posting-trigger events, and AP/AR mappings are refused while `accounting` is
live (§8). The reconciling report instead is doc 180's revenue-coverage query
and doc 179's parallel-running comparison.
**Every column or none** — n/a: no `JournalLine` is written by this capability.
**The period that already moved** — n/a for this platform's ledger (none is
written); an ingested fact dated inside the SME's own closed period is still
recorded, because the source already booked it.
**The second legal entity** — one tenant is one legal entity; a source
exporting several entities is out of pilot scope (doc 177) and a mapping may
filter to one entity's rows.
**Dry run before live** — `PARSE`, `MAP`, `SCORE` and every sink's
`validate()` are pure; the confirmation preview *is* the dry run; any past raw
file can be replayed through them with nothing written.
**Click the number** — §7's chain: figure → edge → canonical row → link →
record → batch → raw file; the drill-down reproduces the figure because the
figure was computed from exactly those rows.
**Three silhouettes, and the day the tier above appears** — Solo: one location,
`defaultLocationId` set once. Chain: `LOCATION` records map each branch, and
`authoritativeLocationIds` lets a chain move one branch at a time. Organization:
out of pilot scope; nothing here assumes one brand, because scope is carried by
`Location`, which already has `retailBrandId`.
**The absent collaborator** — `connectors` off: nothing changes anywhere. An
owning module off: its kind stays staged with `NO_SINK_REGISTERED`. AI off: the
deterministic mapping suggester only. `planning` is always on; it reads zero
ingested rows when there are none.
**The second copy of the write** — file checksum, batch `idempotencyKey`,
record `(connectorId, recordKind, sourceRecordKey, sourceVersionHash)`,
`ObservedSale.ingestionRecordId`, `ExternalRecordLink`'s two unique keys, and
each sink's resolution-key upsert.
**The hundred-thousandth row** — `IngestionRecord` for a busy retail SME: ~300
sale lines/day + master-data changes ≈ 120,000 rows/year; every review list
reads `[batchId, status]` or `[confidenceTier, status]`, paginated; resolution
lookups hit `ExternalRecordLink`'s unique indexes. Candidate JSON of promoted
records older than 180 days is compacted to `{}` (the raw file stays in
`StorageService` under its own retention), stated in WO-172.10.
**The adoption test** — generated codes: `Location.code = EXT-<connector
code>-<source code>`, `Invoice.number = EXT-<connector code>-<source number>`;
the connector code is unique within the tenant, so two sources never collide,
and no counter is shared.
**The reversal document, not the reversal flag** — a wrongly promoted
`ObservedSale` is reversed by a negative correcting row citing the correcting
record; a wrongly matched entity is re-pointed by a new link version and the
old link is `SUPERSEDED`-in-place (`isSystemOfRecord = false`), never deleted.
**The undo fan-out** — promotion fires `IngestionBatchPromoted` (read by the
control plane's metering poller — automatic, and a milestone once recorded is
deliberately irreversible, doc 180) and, for stock
true-ups, `InventoryService`'s own `ProductLowStock`/`StockVarianceRecorded`
(human: the first backfill can raise many low-stock alerts at once, so WO-172.8
routes ingestion-originated low-stock alerts into one digest — "The recipient's
daily total"). Everything else it fires is nothing: sinks publish no native
events.
**The version stamp** — each record stores `confidencePolicy`; each link stores
`mappingId`; a confirmed mapping version is immutable; a figure promoted under
`cp-1` and mapping v3 is explainable from those two stamps forever.
**The erasure the ledger cannot obey** — `IngestionRecord.candidate`,
raw files in `StorageService`, `ExternalRecordLink.externalId` and
`OutboxEvent.payload` can all hold a person (a customer's phone). On a
`Contact` erasure: candidate JSON of that person's records is pseudonymised
in place, raw files containing them are re-written with the person's fields
redacted (the original retained only under a named legal basis — the SME's own
tax-record retention — per ruling 1), links' `externalId` pseudonymised.
**The failure path, and who is allowed to walk it** — durable stores:
`PollConnectorRun`/`FileConnectorRun` (raw), `IngestionBatch` (held/failed),
`IngestionRecord` (failed/advisory); the screen: Connections → Review; the
permission: `connectors.ingestion.review` to see, `connectors.ingestion.confirm`
to release or reject; the replay action: re-parse a batch against a new mapping
version, safe because every write is keyed (above).

**Catalogue lenses this capability reaches** (`docs/erp-lenses/_meta/_index.md`,
run because the feature reaches their surface):
*The weaker writer* — per-row outcome vocabulary is `IngestionRecordStatus`.
*Row 4,312's authority* — authority is checked once, at confirmation of the
mapping version; per-row authority does not apply because rows are
observations, not acts.
*The 14:02 undo* — the before-image of a stock true-up is the previous
snapshot's `IngestionRecord`; re-applying it is the undo.
*The exact-string gate* — entity resolution's ordered keys (§8) and
`ENTITY_NEAR_DUPLICATE` (§5).
*The crosswalk that doesn't exist* — `ExternalRecordLink` is the crosswalk,
with a per-kind unique key for collisions.
*Which tier owns the credential* — the tenant's own deployment, encrypted with
its own `APP_ENCRYPTION_KEY`; never the control plane.
*The busiest minute, and the lock you hold through it* — 200-record chunks.
*Quota has no owner* — each connector's polling interval has a floor
(`intervalMinutes ≥ 15`, doc 160's default) and each batch is capped by
`IMPORT_ROW_CAP`; a per-vendor API rate limit is read from the vendor's
response headers and honoured by backoff.
*The stale clock nobody reads* — `STALE` is computed on every scoring and the
control center reads the oldest input per kind (§7).
*Narrate, never post* — an AI mapping suggestion is a DRAFT a person confirms;
it writes nothing.

## Work orders

**WO-172.1 — Connectors schema (docs 160/162, corrected)**: `connectors.prisma`
with doc 36/132/160/162's models, §3's four corrections, doc 169 §4's
`ExternalRecordLink` provenance, `ObservedSale`/`ObservedCashBalance` (doc
169 §6), and §4's `IngestionMapping`/`IngestionBatch`/`IngestionRecord`;
hand-written forward-only migration including the partial unique index.
**WO-172.2 — Module registration**: `connectors: 'core'` in `module-packs.ts`,
`offByDefault: true` in `modules.registry.ts`, and `connectors` named on every
env template's `# Available:` line (`scripts/check-env-templates.mjs`'s
DISCOVERABILITY rule fails the build otherwise); `pnpm lint`'s boundary check
passing with zero new `KNOWN_MODULE_COUPLINGS` entries.
**WO-172.3 — Transports**: `FileConnector` (`UPLOAD`, `SFTP` behind doc 162's
already-templated SFTP dependency approval), `CsvHandler`, `XlsxHandler`
(pending the §3 dependency approval), `PollConnector` + `runDuePolls()` +
`PollConnectorRun`, `OAuthConnection` + `ConnectorOAuthController` + refresh
cron, doc 132's `InboundWebhookEndpoint` (fail-closed HMAC).
**WO-172.4 — Pure front half**: `parse`, `map` (with the named transforms),
`scoreRecord()` (`cp-1`), schema fingerprinting; specs proving determinism
(identical input twice → identical output) and each rule's delta.
**WO-172.5 — Mapping suggester**: the deterministic alias table and the
optional `IMPORT_CLEANUP` path, gated by AI availability and the manifest.
**WO-172.6 — `CanonicalRecordSinkRegistry`** + the sinks in `purchasing`,
`crm`, `parties`, `catalog`, `inventory`, `tradingpartners`, each with a
`validate()` spec and an idempotency spec.
**WO-172.7 — Staging, confirmation and promotion**: the batch state machine,
chunked promotion with `promotedThroughOrdinal`, evidence-class confirmation
audit, the three domain events.
**WO-172.8 — Failure handling**: backoff, `REAUTH_REQUIRED`, drift
classification, error-rate hold, the low-stock digest for ingestion-originated
alerts, and `ConnectorsListener` (`ingestion_held`/`needs_reauth` →
`NotificationsService`, audience from WO-172.9); the circuit breaker is
WO-176.2's and is consumed here.
**WO-172.9 — `PermissionsResolverService.holdersOf(key)`** (count + list) for
audience resolution, with its own spec.
**WO-172.10 — Retention**: compaction of promoted candidate JSON after 180
days; raw-file retention per doc 181.
**WO-172.11 — UI and reachability**: Connections, Review, the action-hub
source, the nav entry, and the four permissions seeded through to real roles
(doc 170 WO-170.1).

## Acceptance

- Uploading the same CSV twice produces one `FileConnectorRun` and one batch;
  re-uploading it with one changed row promotes exactly one update.
- A supplier row matched only by name scores 7600 from an export file and is
  promoted with `WARNING`; the same row three days stale on a 48 h window
  scores 6600 and is **not** promoted — proven by spec.
- No record from a `DRAFT` mapping is ever promoted; the first batch under a
  confirmed version waits at `AWAITING_CONFIRMATION`; the confirmation writes
  one evidence-class `AuditLog` row in the same transaction.
- Killing the process after chunk 3 of 10 leaves exactly 600 records
  `PROMOTED` with their canonical rows and links, 1,400 `STAGED`, and a resume
  promotes the rest with no duplicate — proven against a real Postgres.
- Renaming a mapped CSV column holds the batch at `HELD_SCHEMA_DRIFT` and
  invalidates the mapping; adding an unmapped column does not.
- A timeout on page 4 of 6 stages pages 1–3 only, and the next run starts at
  page 4.
- `pnpm lint` passes with `connectors` in `MODULE_PACKS` and no new
  `KNOWN_MODULE_COUPLINGS` entry; `grep -rn "from '../connectors" apps/api/src/modules`
  finds nothing outside the module itself.
- A mirrored `SupplierBill` publishes no `SupplierBillRaised`; with
  `accounting` in `MODULES`, confirming a `SUPPLIER_BILL` mapping is refused.

## Out of scope

Writing back to any source (no `OutboundConnector` use). Bank-statement line
reconciliation (doc 162's follow-on; only a dated balance is ingested here).
Payroll/HR ingestion. Transfer history from an external POS (a lateral
`Location → Location` edge exists only where stock moved through this
platform's own `StockTransfer`, doc 144's rule — named in doc 173, not
invented here). Automatic entity merging across sources without a person
(near-duplicates are flagged and scored down, never merged silently). Any
transport beyond upload, SFTP, polling and signed webhooks.
