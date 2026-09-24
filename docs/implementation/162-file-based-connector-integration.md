# 162 — File-based connectors: the fourth shape doc 160 named and deliberately left out

Doc 160 named this gap explicitly rather than stubbing it: bank statement
reconciliation and some payroll bank-disbursement formats have no HTTP
API at all, just a file arriving or a file that must be produced in a
specific, often decades-old format (MT940, CAMT.053, a bank's own
fixed-width bulk-payment layout). `OutboundConnector` (doc 36) and
`PollConnector`/`InboundWebhookEndpoint` (doc 132/160) are all request/
response HTTP shapes; none of them fit "a file shows up," so this
document builds the fourth connector kind rather than forcing a file
through a JSON-template mechanism it was never designed for.

## Why a file needs its own kind, not a template on the existing connectors

`OutboundConnector.payloadTemplate` and `InboundWebhookEndpoint`'s own
mirror are Handlebars-style JSON mappings — they work because the target
shape is JSON. A CSV, a fixed-width layout, or MT940/CAMT.053 is not
expressible as a JSON template; each is its own small grammar. Rather than
inventing a generic-but-fragile file templating language, this document
applies doc 36's own founding rule one level down: **a named `FileFormat`
key resolves to one small, purpose-built parser or generator class,
written once per format family (not once per bank)**, exactly as
`IdentityProvider` resolves to one class per protocol, not one per
identity vendor.

## 1. `FileConnector` — a scheduled or triggered file exchange, in or out

```prisma
// connectors.prisma — additive
enum FileConnectorDirection { INBOUND OUTBOUND }
enum FileTransport { SFTP }  // the one real transport named by this request; see Out of Scope
enum FileFormat { CSV FIXED_WIDTH MT940 CAMT053 }
enum FileConnectorStatus { ACTIVE SUSPENDED }

model FileConnector {
  id             String   @id @default(cuid())
  organizationId String
  label          String   // "Meezan Bank statement import", "HBL payroll disbursement"
  direction      FileConnectorDirection
  transport      FileTransport
  format         FileFormat
  /// SFTP host/port/path/credentials - credentials encrypted at rest,
  /// the same discipline every other connector's own secret already uses.
  connectionConfigEncrypted Bytes
  /// INBOUND only: how often to check for a new file.
  intervalMinutes  Int?
  /// OUTBOUND only: which domain event triggers a generation, e.g.
  /// PayrollRunPosted - reuses the existing event catalogue, never a new
  /// trigger mechanism.
  triggerEvent     String?
  lastRunAt        DateTime?
  status           FileConnectorStatus @default(ACTIVE)

  @@index([organizationId, status])
}

/// One row per file actually processed or generated - the file-shaped
/// mirror of ConnectorDelivery/InboundWebhookDelivery, and the source of
/// the checksum that makes reprocessing a no-op (§3).
model FileConnectorRun {
  id            String   @id @default(cuid())
  connectorId   String
  filename      String
  fileChecksum  String   // sha256 - the actual dedupe key, not the filename
  storageKey    String   // the raw file, via the existing StorageService
  recordsProcessed Int?
  status        FileRunStatus @default(RECEIVED)
  failureReason String?
  ranAt         DateTime @default(now())

  @@unique([connectorId, fileChecksum])
  @@index([connectorId, ranAt])
}

enum FileRunStatus { RECEIVED PROCESSED FAILED }
```

## 2. `FileFormatHandler` — one class per format family, resolved by `FileConnector.format`

```ts
export interface FileFormatHandler {
  readonly format: FileFormat;
  /** INBOUND: turns raw file bytes into a list of records this repository
   *  already understands (a bank statement line, say) - never a bespoke
   *  shape per bank, since two banks using MT940 produce the identical
   *  structured output from this one parser. */
  parse(raw: Buffer): ParsedFileRecord[];
  /** OUTBOUND: turns our own records into the target's exact byte layout. */
  generate(records: OutboundFileRecord[]): Buffer;
}
```

`Mt940Handler`, `Camt053Handler`, `CsvHandler`, `FixedWidthHandler` are
each written once, reused by every bank/payroll partner that happens to
use that format — the identical "typed once, reused by every vendor"
economics `IdentityProvider` and `TelephonyProvider` already prove.
`CsvHandler` reuses the `csv-parse` package already a dependency of this
codebase (confirmed present in `apps/api/package.json`) — no new
dependency for the most common case.

## 3. Idempotent by checksum, never by filename or schedule alone

```ts
async processIncomingFile(connector: FileConnector, filename: string, raw: Buffer): Promise<void> {
  const fileChecksum = sha256(raw);
  const existing = await this.prisma.fileConnectorRun.findUnique({
    where: { connectorId_fileChecksum: { connectorId: connector.id, fileChecksum } },
  });
  if (existing) return; // doc 157's own idempotency discipline, applied to a file instead of an HTTP request

  const stored = await this.storage.putDocument({ folder: 'connector-files', filename, contentType: 'application/octet-stream', body: raw });
  const run = await this.prisma.fileConnectorRun.create({
    data: { connectorId: connector.id, filename, fileChecksum, storageKey: stored.key },
  });
  try {
    const handler = this.handlers.get(connector.format);
    const records = handler.parse(raw);
    // Each record resolves against ExternalRecordLink (doc 160) so a bank
    // statement line already reconciled on a prior run is skipped, not
    // reprocessed into a duplicate JournalEntry/CashMovement match.
    await this.reconcile(records, connector);
    await this.prisma.fileConnectorRun.update({ where: { id: run.id }, data: { status: 'PROCESSED', recordsProcessed: records.length } });
  } catch (err) {
    await this.prisma.fileConnectorRun.update({ where: { id: run.id }, data: { status: 'FAILED', failureReason: String(err) } });
  }
}
```

An SFTP poll (INBOUND) reuses `PollConnector`'s own due-check cron shape
(doc 160); an OUTBOUND generation subscribes to `triggerEvent` exactly as
`OutboundConnector` subscribes to a domain event, except it writes a file
via `handler.generate()` and uploads it rather than POSTing JSON.

## 4. The two real use cases named in this request

| Use case | Direction | Format | Trigger |
|---|---|---|---|
| Bank statement reconciliation | INBOUND | MT940/CAMT.053 (bank-dependent) | Scheduled SFTP poll |
| Payroll bank disbursement file | OUTBOUND | The specific bank's own fixed-width/CSV layout | `DomainEvent.PayrollRunPosted` (`domain-events.ts:70`, already published by `pay-run.service.ts`) |

Reconciled statement lines feed doc 04's own existing `CashMovement`/
`JournalEntry` matching, never a second bookkeeping ledger; a generated
disbursement file is attached to the `PayRun` it was generated from
(doc 19/25) via `FileConnectorRun`, so "was this pay run's money actually
sent to the bank" is answerable by one drill-down, not a manual check.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: `FileConnector` acts under the
configuring admin's own permissions; no new actor.
**Whose rows, and which columns** — `organizationId`-scoped identically
to every other connector table in docs 36/132/160.
**The threshold nobody approves alone** — an OUTBOUND payroll
disbursement file carries real money; generating one is gated by
`connectors.manage` **and** requires the triggering `PayRun` to already
be in `POSTED` status (doc 19's own existing gate) — this document adds
no new money-movement authority, it only automates producing the file a
human would otherwise have typed by hand into a bank portal.
**The toxic pair** — n/a beyond doc 19's own existing payroll-approval
chain, unchanged by this document.
**Authority and blast radius** — registering a `FileConnector` and its
encrypted SFTP credentials is gated by `connectors.manage`, audited
old/new configuration exactly as doc 160's own connectors already are.
**Audience is a capability, not an address** — n/a: no notification of
its own beyond a failed run surfacing in doc 44's action hub (WO-162.4).
**Request or record** — generating an outbound file is a REQUEST
(refusable if the triggering `PayRun` isn't actually posted); a
successfully processed inbound file's `FileConnectorRun` is a RECORD of
what arrived, kept even if its own reconciliation later needs correcting.
**The movement with no address** — n/a: a reconciled statement line
updates an existing `CashMovement`'s own match status, never creates a
second, competing stock/cash movement.
**Four hours down, the counter stays open** — an SFTP source unreachable
for a scheduled poll is retried on the next tick (identical to
`PollConnector`'s own failure path); a failed outbound generation leaves
the `PayRun` exactly as posted, with the file generation retriable by
hand from the same screen.
**The unwritten posting rule / Every column or none / The period that
already moved / The second legal entity** — n/a: this document posts no
new GL fact of its own; a reconciled statement line updates doc 04's
existing entries under their own already-answered rules.
**Dry run before live** — `handler.parse()` is a pure function over raw
bytes with no `prisma.` write inside it, callable standalone to preview
what a file would produce before `processIncomingFile()` commits it —
this document's own answer to "click the number" one step upstream:
you can see the parse result before it touches the ledger.
**Click the number** — a `PayRun`'s own detail screen links to the exact
`FileConnectorRun` that generated its disbursement file, and a bank
statement's own reconciliation view links each matched line back to the
source file it came from.
**Three silhouettes** — Solo: unlikely to need a bank feed at all. Chain/
Organization: one `FileConnector` per bank relationship, scoped by
`organizationId` exactly as every other connector.
**The absent collaborator** — with no `FileConnector` configured, bank
reconciliation and disbursement-file generation continue exactly as
today (manual), doc 160's own "absent collaborator" answer restated.
**The second copy of the write** — `@@unique([connectorId, fileChecksum])`
is the entire guard: the identical file delivered twice (a retried SFTP
poll, a re-sent bank file) is a no-op on the second attempt.
**The hundred-thousandth row** — `FileConnectorRun` indexed on
`(connectorId, ranAt)`; volume is bounded by real file-delivery frequency
(daily/monthly bank statements), never unbounded.
**The reversal document / The undo fan-out** — a misreconciled statement
line is corrected through doc 04's own existing journal-correction path,
never by deleting the `FileConnectorRun` (per this repository's own
no-deletion rule) — the run stays as the historical record of what
arrived, even after its interpretation is corrected.
**The version stamp** — a `FileFormatHandler`'s own parsing logic
changing (a bank revises its layout) applies to future runs only; a past
`FileConnectorRun`'s stored raw file (via `StorageService`) lets a
dispute be re-examined against exactly what was actually received.
**The erasure the ledger cannot obey** — a bank statement file may name
customers/counterparties in free-text fields; retained under the same
financial-record retention basis doc 04's own ledger already relies on,
never a separate erasure path.
**The failure path** — a parse failure marks the `FileConnectorRun`
`FAILED` with a reason and stops that file's own processing without
blocking the next scheduled poll or the next `PayRun`'s own disbursement
attempt.

## Work orders

**WO-162.1 — schema**: `FileConnector`, `FileConnectorRun`, enums,
forward-only migration.
**WO-162.2 — `FileFormatHandler` + `CsvHandler`/`FixedWidthHandler`**
first (the two most common, requiring no new dependency); `Mt940Handler`/
`Camt053Handler` once a real bank relationship names the exact format it
sends, per doc 36's own "typed once a real need exists" rule.
**WO-162.3 — SFTP transport**. Per `.claude/rules/dependencies.md`'s own
required template before adding one:
```
Dependency: ssh2-sftp-client (or equivalent maintained SFTP client)
Purpose: connect to a bank/payroll partner's SFTP server for file exchange
Existing Alternative: none - no SFTP capability exists in this codebase
Why Existing Alternative Is Insufficient: HTTP-only connectors (doc 36/160) cannot speak SFTP
Security Considerations: host key verification required, never disabled; credentials encrypted at rest (§1)
Maintenance Considerations: actively maintained, low dependency surface
Bundle / Runtime Impact: server-side only, no frontend bundle impact
Approval Required: yes - named here for the owner's decision before install, per house rule
```
**WO-162.4 — `processIncomingFile()`/outbound generation**, the due-poll
cron (reusing `PollConnector`'s own shape), and surfacing a `FAILED` run
in doc 44's manager action hub.
**WO-162.5 — UI**: connector registration screen (sibling to doc 160's
own), the `PayRun`↔`FileConnectorRun` drill-down, the bank-reconciliation
view.

## Acceptance

- The identical file delivered twice produces exactly one
  `FileConnectorRun` at `PROCESSED`, proven by a spec.
- Generating a disbursement file for a `PayRun` not in `POSTED` status is
  refused, proven by a spec.
- `handler.parse()` is provably pure (no `prisma.`/`publish(` call inside
  it), checkable by the identical static check doc 133's own dry-run
  harness convention already establishes.
- A failed parse leaves the raw file retrievable via `StorageService` for
  manual inspection, never silently discarded.

## Out of scope

Any transport beyond SFTP (email-attachment ingestion, a shared cloud-
drive folder) — real alternatives some banks use, named honestly as
unbuilt rather than folded in speculatively; SFTP is the one this request
and doc 160's own gap both actually name. A generic "any file format"
auto-detection — each format is deliberately named and typed
(`FileFormat` enum), never guessed from file content, so a
misinterpreted bank statement fails loudly at the format-mismatch step
rather than silently parsing garbage.
