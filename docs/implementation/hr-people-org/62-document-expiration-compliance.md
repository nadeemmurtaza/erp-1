# 62 — Document expiry: an enum extension over an existing engine, not a new one

Doc 54 already built the one real mechanism this list keeps re-requesting:
`ExpiringRecordSource` (a registered-source pattern, exactly `ActionHubSource`
doc 44 established for a different queue), plus the watcher that walks every
registered source nightly and raises a reminder ahead of each expiry. Doc 28's
own `EmployeeDocument` model (CNIC, license, health certificate, contract —
whatever fields it already carries an `expiresAt` for) is one of doc 54's own
registered sources today. "Document expiration & compliance tracking for
employee document renewal deadlines" is, verbatim, what doc 54 + doc 28 already
deliver together. This document is a coverage note, not a new engine.

## 1. What already exists

- `EmployeeDocument` (doc 28) — a document row per employee, per document
  type, carrying its own `expiresAt`.
- `ExpiringRecordSource` (doc 54) — the registered-source interface; doc 28's
  employee-document expiry is registered against it exactly as any other
  expiring record (a trade license, an insurance policy) would be.
- The nightly watcher (doc 54, WO-54.2) — walks every registered source,
  raises a reminder at each source's own configured lead time, through
  doc 24's own `NotificationsService` — never a second scheduler.

## 2. The one real gap: document *type* is data, not a fixed list

The promotional list names four concrete document kinds — CNIC, driving
license, health certificate, contract. If doc 28's `EmployeeDocument.type`
is today a hardcoded enum limited to a small fixed set, that is exactly the
rows-over-enums violation this repository's own discipline (`LeaveType`,
`DeductionType`, `CategoryPreset`) already forbids for anything that varies
by client or jurisdiction — a health certificate requirement in one country
is a work-permit requirement in another. Where doc 28's model is still a
closed enum, this document's only real work order is to open it:

```prisma
model DocumentType {
  id             String  @id @default(cuid())
  organizationId String
  code           String  // "CNIC", "DRIVING_LICENSE", "HEALTH_CERT", ...
  label          String
  requiresExpiry Boolean @default(true)

  @@unique([organizationId, code])
}
```

`EmployeeDocument.type` becomes a foreign key to `DocumentType` rather than
a Prisma enum literal — a client adds "work permit" or "vaccination
certificate" as a configuration row, never a migration.

**If doc 28's model already stores document type as a free-form or
data-driven field**, this document has no remaining gap to close beyond
confirming doc 28's own registration with doc 54's watcher covers every
`DocumentType` row uniformly (never special-cased per type in the watcher
itself) — the scope lenses below are written for the migration case, and
collapse to "already satisfied" if inspection at build time confirms the
field is already data-driven.

## Scope lenses

**The actor with three tables / The principal with no permission key / The
grant that ends itself** — n/a: no new actor; `EmployeeDocument` already
belongs to doc 20's `Employee`.
**Whose rows, and which columns** — `DocumentType` is `organizationId`-scoped
exactly as `EmployeeDocument` already is; no visibility change.
**The threshold nobody approves alone / The toxic pair / Authority and blast
radius** — n/a: adding a document-type row is configuration, not a
money/stock act; gated by the same admin permission that already governs
doc 28's own document-management screen.
**Audience is a capability, not an address** — n/a beyond what doc 54's own
watcher already resolves through `NotificationsService`.
**Request or record** — n/a: this document changes no write path, only a
type field's storage shape.
**The movement with no address / The unwritten posting rule / Every column
or none / The period that already moved / The second legal entity** — n/a:
no money or stock fact.
**Dry run before live** — n/a.
**Three silhouettes** — Solo: a small fixed set of document types, the enum
form was tolerable. Chain: multiple jurisdictions across branches genuinely
need different document types — this is where the enum breaks and the data
row pays for itself. Organization: cross-brand compliance reporting over
`DocumentType.code`, unaffected by which brand invented the type.
**The absent collaborator** — with `hr`/doc 28 off, no document tracking of
any kind exists — already true today, unchanged by this document.
**The second copy of the write** — n/a: converting an enum column to a
foreign key is a one-time forward-only migration (backfilling existing rows
against seeded `DocumentType` rows for the prior enum's own values), never a
recurring write concern.
**The hundred-thousandth row** — `DocumentType` is small (tens of rows per
organization); `EmployeeDocument` volume is unchanged by this migration.
**The reversal document / The undo fan-out / The version stamp / The
erasure the ledger cannot obey / The failure path** — n/a: unchanged from
doc 28/54's own existing answers to these lenses.

## Work orders

**WO-62.1** — if `EmployeeDocument.type` is a closed Prisma enum today,
migrate it to a `DocumentType` row + foreign key, forward-only, backfilling
existing values as seeded rows. If it is already data-driven, this work
order is void — record that finding in `DECISIONS.md` rather than silently
skipping it.
**WO-62.2** — confirm (or add, if missing) doc 28's registration of
`EmployeeDocument` expiry against doc 54's `ExpiringRecordSource` covers
every `DocumentType` uniformly, with no per-type special case in the
watcher.

## Acceptance

- A new document type is addable by an organization admin without a code
  deployment or migration.
- Doc 54's nightly watcher continues to raise a reminder for every
  `EmployeeDocument` nearing `expiresAt`, regardless of which `DocumentType`
  it references.

## Out of scope

A compliance *dashboard* rolling up expiry status across the whole
workforce — that is doc 44's own action-hub aggregation, already generic
over any registered source; this document's only job is making the
*type* of document configurable, not building a second summary screen.
