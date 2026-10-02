# 229 — Import previous data from Excel

> **Industry-specific module.** This belongs to the **housing-society sector pack** (real estate / society management), not to `core`. It is enabled only in housing-society deployments through the `MODULES` allowlist; other sectors never load it, and core never imports it.
>
> **Status: Planned.** Module: `society-import`. Promise: **no data loss, fast
> and secure, get started quickly.** One job: *bring an existing society's
> spreadsheets in correctly.*

## 1. What is imported

In dependency order (each stage can run alone):

1. Projects, phases, blocks, plots
2. Members (`Party` + `Member`), residents, nominees
3. Bookings and files (price, date, status, plot link)
4. Payment plans and installment schedules
5. Receipts and payments history
6. Opening balances (see §4)
7. Complaints and visitor history (optional)

## 2. The pipeline (nothing writes until the last step)

`Upload → Detect → Map → Validate → Dry run → Review → Commit → Reconcile`

* **Upload**: `.xlsx`/`.csv`, virus-scanned, stored via `StorageService`, hashed (SHA-256). Max 25 MB / 200,000 rows per file (larger → split; stated, not silent).
* **Detect**: sheets, header row, data types, date formats (day-first vs month-first asked, not guessed).
* **Map**: columns → fields via a **saved mapping template** per society; a template is reusable for the next file and exportable. AI-assisted mapping (behind `AiProvider`, optional) may *suggest*, staff confirm.
* **Validate**: a pure function `validateImport(rows, mapping, existing) → {valid, errors, warnings, duplicates}` — holds no write. Checks: required fields, plot exists/unique, member duplicate (match check, doc 222), size/unit known, amounts numeric, dates sane, installments sum to price, receipts ≤ price, joint shares = 100.
* **Dry run**: full simulated import producing counts and the **projected trial balance and member balances**, with nothing written. Errors are a downloadable Excel with the offending rows and reasons, so a clerk fixes the *source* sheet and re-uploads.
* **Review**: staff accept warnings explicitly (each type, once).
* **Commit**: a background job writes in **chunks of 500 rows per transaction**, each chunk idempotent by `(batchId, rowKey)`. A crash resumes; a double-click commits once. `ImportBatch` keeps `status`, counts, `fileHash`, `startedBy`.
* **Reconcile**: a report comparing the file's totals to the system's (counts, sum of price, sum of receipts, sum of dues, per project) — differences listed row by row. The batch is **not "complete"** until an authorised person accepts the reconciliation.

## 3. Data safety — "no data loss"

* The **original file is kept** (hash, who, when) and every staged row retains its raw source cells; nothing is "cleaned" away silently — normalisations are recorded per cell.
* Import never overwrites an existing record: matching rows are *updated only when the mapping says so*, otherwise reported as duplicates.
* **Rollback is a reversing batch**, not a delete: `ImportBatchReversal` voids exactly the rows the batch created (soft state, no hard delete), only while no later transaction touches them; otherwise it lists what blocks it. Needs owner confirmation per deletion rule.
* All import rows audited; `society.import.run` and `society.import.accept` are different keys (toxic pair: the runner does not accept their own reconciliation).

## 4. Opening balances

Existing societies are mid-flight. Two honest options per society, recorded:

| Mode | Use when |
|---|---|
| **Full history**: import every receipt and installment; the system's balances are *derived* | records are clean |
| **Cut-over**: import schedule + **opening balance as of a date** (paid-to-date, due-to-date per member) and history as read-only reference | history is incomplete or unreliable |

Opening balances post a single dated journal (`Opening balance` source), keyed
by batch; they land in the right fiscal period or a flagged opening period.

## 5. Security

* Upload and mapping need `society.import.run`; cross-project data is refused unless the user's scope covers the project.
* Staging tables hold PII: access restricted, **purged 30 days** after acceptance (the original file kept per retention policy), pseudonymised on erasure.
* CSV/Excel injection guarded on any later export (cells starting with `=`,`+`,`-`,`@` prefixed).
* Rate limit: 5 uploads per hour per user; one active commit per project.

## 6. Failure paths

A row that fails at commit goes to the batch's *rejected* list with payload
and reason; **Replay rejected** is safe (idempotent). The batch is resumable
and visible on *Delivery & posting problems*.

## 7. Acceptance criteria

1. A 50,000-row file validates in dry run in ≤ 60 s, writing nothing (row-count test before/after).
2. Committing the same batch twice yields no duplicate rows.
3. Killing the job mid-commit then resuming gives the same final counts as an uninterrupted run.
4. After a clean import, reconciliation differences are 0 for count and sum-of-price/receipts/dues.
5. The error Excel lists every rejected row with a reason in plain words.
6. The runner cannot accept their own reconciliation.

## 8. Work orders

229.1 upload/detect/mapping templates · 229.2 `validateImport` + dry run +
error Excel · 229.3 plots/members import · 229.4 bookings/installments/receipts
· 229.5 opening balances · 229.6 reconciliation + acceptance · 229.7 reversing
batch.
