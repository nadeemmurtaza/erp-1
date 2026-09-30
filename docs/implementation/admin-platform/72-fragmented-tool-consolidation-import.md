# 72 — CSV onboarding: one real pattern already exists, extend it, don't re-invent it

> **Status (2026-09-25): Built, with two named deviations.** WO-72.1
> (`ContactImportService`), WO-72.2 (`ExpenseImportService`), WO-72.3
> (dry-run on all three importers + shared `IMPORT_ROW_CAP`) and WO-72.4
> (upload/preview/commit UI on the contacts and expenses lists) are all
> built and tested. Two deviations from this brief's own text, both
> documented in `DECISIONS.md`: the contacts CSV column is `city`, not
> `address` (`Contact` has no `address` field); the closed-fiscal-period
> acceptance criterion is not enforced for imported expenses, because no
> write path in this codebase enforces it today (a manually entered
> expense dated into a CLOSED period is not refused either — see the ADR).

"Purpose-built migration architecture... to replace disconnected
spreadsheets (Excel), manual paper logs, and informal chat messaging
(WhatsApp) with a centralized ledger" is broad promotional language for a
narrow, real, buildable thing: **a client with a working spreadsheet or
paper log needs to get that data into this system without hand-typing every
row.** `ProductImportService`
(`apps/api/src/modules/merchandising/catalog/product-import.service.ts`) already does
exactly this for the catalogue — a fixed `COLUMNS` array, `csv-parse`,
per-row validation producing `created`/`updated`/`skipped` outcomes, an
`ImportSummary` report, all attributed through `AuditService`. This
document does not propose a "migration engine" — it identifies the two
other entities a real onboarding client actually tracks in a spreadsheet
today (customers/contacts, and this repository's own `finance` expenses)
that have no equivalent path, and extends the identical, already-proven
pattern to each. "Informal chat messaging" has no import target — no
messaging data model exists to receive it, and this document does not
invent one to satisfy a metaphor; what a WhatsApp-run business actually
needs onboarded is its customer list and its transaction history, both of
which this document does address.

## 1. The pattern, generalized just enough to name its second and third users

```ts
// The exact shape ProductImportService already establishes, restated as
// what any future CsvImportService for a new entity must match — never a
// shared base class or generic framework, since each entity's own columns,
// validation, and created/updated key differ enough that inheritance would
// hide more than it shares; the convention is the reuse, not the code.
interface ImportSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  results: Array<{ row: number; key: string; action: 'created' | 'updated' | 'skipped'; message?: string }>;
}
```

**`ContactImportService`** (`crm`) — columns: `name`, `phone`, `email`,
`address`, `notes`, `tags`; upsert key: normalized phone (reusing
`normalizePkPhone` — `crm.service.ts` line 2 already imports it for
exactly this normalization) or email. Reuses `crm`'s own existing
`Contact` model and `AuditService` attribution, adding no new schema.

**`ExpenseImportService`** (`finance`) — columns: `date`, `category`,
`amount`, `description`, `vendor`; each row becomes an ordinary
`Expense` row through `FinanceService`'s own existing create path (never
a bypass of its category/GL-posting rules) — a paper expense log's
transcription target.

Both are read as CSV, both produce the identical `ImportSummary` shape,
both attribute every created row to the importing user via `AuditService` —
the convention `ProductImportService` set is what's reused, not a shared
runtime component neither entity actually needs.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: the importing actor is the
authenticated `User` running the import; no new actor kind.
**Whose rows, and which columns** — an import is gated by the same
create-permission its target entity already requires
(`crm.contacts.create`, `finance.expenses.create`) — never a separate,
broader "import" permission that would let someone bulk-create rows they
could not create one at a time.
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — an import of expenses can commit real money-adjacent
records at volume; it is bounded by a hard per-file row cap (matching
`ProductImportService`'s own existing cap, if any, or a newly-stated one)
and every row still passes through `FinanceService`'s own existing
category/amount validation — an import is not a bypass of any check a
manual entry would face, only a batch of the same check.
**Audience is a capability, not an address** — n/a: an import is a
synchronous action the importing user performs, not a notification.
**Request or record** — every imported row is a REQUEST through the
target entity's own existing create path (can be refused per-row —
malformed date, unknown category — and is `skipped` rather than aborting
the whole file), exactly `ProductImportService`'s own existing per-row
outcome model; a batch import summary is never itself a RECORD of a
physical event, only a report of many individual create attempts.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity** — an imported `Expense` posts through `finance`'s own existing
GL rule unchanged (this document adds no new posting path); a
`fiscalPeriod` closed against the import's own dated rows refuses the row
exactly as a manually-entered expense dated into a closed period already
would.
**Dry run before live** — restated as a real, near-free requirement given
the format: a "validate only" mode that runs every row's validation and
returns the `ImportSummary` `created`/`skipped` counts **without writing**
is the natural extension of `ProductImportService`'s own row-validation
function, called once for preview and once for commit — never two
separately-maintained validation implementations.
**Three silhouettes** — Solo: a one-time onboarding import, run once,
rarely revisited. Chain: recurring supplier or franchise-partner exports
reconciled via re-import — upsert-by-key (next lens) is what makes a
second import of an updated spreadsheet safe rather than duplicating.
Organization: cross-brand onboarding at scale, where the row cap and
per-row validation cost (bounded, next lens) matters.
**The absent collaborator** — a `ContactImportService` with `crm` off, or
an `ExpenseImportService` with `finance` off, simply has no target module
to import into — the import screen itself does not render (`MOD-1`),
identical to `ProductImportService`'s own relationship to `catalog`.
**The second copy of the write** — restated as the reason each import
upserts by a stated business key (SKU for products, normalized
phone/email for contacts, no natural key for expenses — so expense
"re-import" is intentionally always `created`, never silently merged, and
the UI must say so) rather than blindly inserting — re-running the same
file twice against `ProductImportService`'s own SKU-keyed logic already
produces `updated`, not a duplicate row; contacts inherit the identical
discipline.
**The hundred-thousandth row** — a hard per-file row cap (matching
whatever `ProductImportService` already enforces) prevents an
unbounded synchronous request; a file above the cap is rejected up front
with a clear message, never silently truncated.
**The reversal document** — an import's own `ImportSummary.results` names
every row's created/updated identity; undoing a bad import is "delete/
revert each named row," the same manual correction path a bad manual
entry would need — no automatic "undo this whole import" transaction is
built, since a partially-corrected-since import cannot be safely
mass-reverted without risking data entered after it.
**The undo fan-out / The version stamp** — n/a beyond each target
entity's own existing answers (an imported `Expense` reverses exactly as
a manually-entered one would).
**The erasure the ledger cannot obey** — an imported `Contact`'s source
CSV file itself (if retained anywhere, e.g., for the `sourceReceiptId`-
style audit trail) is not stored beyond the `AuditService` log's own
existing retention rule — no separate raw-file archive is introduced.
**The failure path** — a malformed CSV (wrong columns, unreadable
encoding) fails the whole import up front with a specific error, before
any row is attempted — never a partial import silently missing columns
the client assumed were included.

## Work orders

**WO-72.1 — `ContactImportService`** (`crm`), matching
`ProductImportService`'s own shape: `import()`, dry-run mode, upsert by
normalized phone/email.
**WO-72.2 — `ExpenseImportService`** (`finance`), same shape, create-only
(no natural upsert key), routed through `FinanceService`'s own existing
create path.
**WO-72.3 — dry-run mode on all three importers** (including retrofitting
`ProductImportService` if it does not already have one), a shared
row-cap constant in `@newax/shared` (never three independently-chosen
numbers).
**WO-72.4 — UI**: an "import from CSV" entry on the contacts list and the
expenses list, matching the catalogue's own existing import screen's
layout (upload, dry-run preview, commit, summary).

## Acceptance

- Re-importing the identical contacts CSV twice produces `created` rows
  the first time and `updated` rows (never duplicates) the second, proven
  by a spec.
- A dry-run import writes nothing, proven by a spec asserting zero rows
  created/updated after a dry-run call.
- An expense row dated into a `CLOSED` fiscal period is `skipped` with a
  clear message, never silently posted or silently dropped without
  explanation.
- A file exceeding the row cap is rejected before any row is processed.

## Out of scope

A generic, admin-configurable "map any CSV to any entity" import builder —
named as a much larger, speculative capability with no concrete requester;
this document ships three purpose-built importers following one shared
convention, not a general-purpose ETL tool. Any import target for
"WhatsApp messages" specifically — no data model exists to receive
unstructured chat history, and none is invented here; the actual business
data a WhatsApp-run shop needs onboarded (its customers, its
transactions) is covered by WO-72.1/72.2 above.
