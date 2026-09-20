# 25. Privacy, retention and residency

At shop scale, deleting a customer means deleting a row. At corporate scale
the same person's identifiers are already copied into an append-only ledger,
an outbox payload, a replicated fact on a second database, and a CRM email
body — each with its own onDelete rule or none at all. A feature that only
deletes `User` and calls the request satisfied has not built erasure; it has
built the part that was easy to cascade.

## Lens: The row the ledger will not let you touch

**Question:** When an erasure request reaches a person whose id sits in
`JournalLine.contactId`, what happens to that row, and name the mechanism in
this repo that refuses to let it change?
**Why:** `journal_line_immutable` (`forbid_journal_line_mutation()`, the
accounting ledger migration) forbids UPDATE or DELETE on `JournalLine`
forever, and `contactId` (`accounting.prisma:189`) is set on the AR line of
`order.placed`. Most `User` relations cascade on delete
(`core.prisma:88,107,124,146,285,342,398`), but `AuditLog.actorId` only goes
`SetNull` (`core.prisma:230`) — `AuditLog.data` (`Json?`) is untouched
free text. A narrow build wires `DELETE /users/:id`, watches the cascades
fire, and stops.
**Worked example:** Narrow slice: an account-deletion endpoint that cascades
`User` → `Order` → `Payment` and calls itself compliant. Complete capability:
a per-table erasure disposition — pseudonymize the reference, not delete the
row — for every place a person's id survives the User row: `JournalLine`
under its immutable trigger, `AuditLog.data`, and `InboundEmail.bodyText` /
`fromName` / `fromAddress` (`crm.prisma:147-153`), which only `SetNull`s
`contactId` and keeps the raw text.
**Done test:** `grep -n "onDelete: SetNull" apps/api/prisma/schema/*.prisma`
— for every hit, the PR states in writing what happens to the personal data
left behind on that row, not just that the FK went null.
**Breaks without:** The erasure request returns 200 while the person's name
and email still sit in `AuditLog.data` and `InboundEmail.bodyText`
indefinitely, and inside a posted `JournalLine` no code path can ever
UPDATE or DELETE it — the exact accountability record an auditor asks for
first still names them.

## Lens: The payload that already left

**Question:** Name every place this person's identifiers already sit inside
a JSON payload outside the `User` row today, and state what happens to each
one when their erasure request is honored.
**Why:** `OutboxEvent.payload` (`core.prisma:364`) holds the full event body
— `order.placed` carries customer identity — and nothing in `apps/api/src`
deletes a processed row (`grep` for an `OutboxEvent` delete call returns
nothing); every dispatched payload is retained forever regardless of status.
`ReplicationRecord.payload` (`replication.prisma:62`) is append-only by
design (`replication.prisma:9-10`, "never edited from above"), and under
`NODE_ROLE=BRANCH` or `BRAND` (`env.validation.ts:72`) it is pushed to a
parent database that may sit in a different jurisdiction — a second copy the
erasure flow has to know exists.
**Worked example:** Narrow slice: delete the `User` row and treat outbox and
replication as platform machinery out of scope. Complete capability: the
erasure design enumerates `OutboxEvent` rows and any `ReplicationRecord` rows
already pushed under a live BRANCH/BRAND deployment that reference the
person, and states for each whether it is purged, redacted, or retained with
a stated legal reason.
**Done test:** The PR names `OutboxEvent` and `ReplicationRecord` explicitly
with a disposition per table; a query for the person's id inside
`payload::text` on both tables after the erasure runs returns the count the
PR predicted.
**Breaks without:** The person's data keeps living in `payload` columns
nothing purges — indefinitely in `OutboxEvent`, and copied a second time
into a different node's database once replication is live, in a
jurisdiction no per-row field (`Location.address` at `inventory.prisma:102`
is a bare `Json?` with no country column) lets anyone even query for.

## Lens: The retention clock with no dial

**Question:** For a `FACT` row, a `POLICY` row (`replication.prisma:59`),
and a raw `InboundEmail`, what is the retention period in days, where is
that number stored as data, and what deletes the row when it expires?
**Why:** `Setting` (`core.prisma:153`) is the only runtime-configurable
store in the schema and it is a flat `key`/`value` pair with no per-entity
or per-class scope — there is nowhere to write "keep `InboundEmail` 90
days, keep `JournalLine` forever" as a row. No cron or scheduled job in
`apps/api/src` deletes rows by age from any table. `dataClass` on
`ReplicationRecord` exists, but its own file comment (`replication.prisma:9-
16`) states it drives conflict resolution (FACT-up/POLICY-down), never a
retention duration — it is not the field this lens is asking for.
**Worked example:** Narrow slice: a settings page with one global "days to
keep audit logs" number wired to a cron. Complete capability: a retention
policy keyed by data class — order/journal fact, product/price policy,
marketing consent, raw inbound email — each with its own duration and legal
basis, because a `JournalLine` must legally outlive an `InboundEmail`.
**Done test:** `grep -rn "retentionUntil\|purgeAfter\|RetentionPolicy"
apps/api/prisma/schema` returns at least one column; today it returns zero.
The PR adds the model and a job that reads it, not a single global number.
**Breaks without:** One flat `Setting` key either purges a `JournalLine` a
regulator needs kept for years, or keeps a customer's raw email body
forever, because the schema has no column to say which retention class a
row belongs to.

## Not modelled yet

- No retention or expiry column anywhere in the schema: `RoleGrant`,
  `UserRoleAssignment`, `UserPermission`, `AdminScope`, `Setting`,
  `OutboxEvent`, `ReplicationRecord` all carry only `createdAt`.
- No purge or anonymization job for `OutboxEvent.payload`,
  `ReplicationRecord.payload`, `AuditLog.data`, or `InboundEmail.bodyText`.
- No jurisdiction, country or region column on `Location` (`address` is a
  bare `Json?`), `Node`, or `RetailBrand` — residency has no field to filter
  replication or retention by.
- No consent or legal-basis model beyond `User.marketingEmailOptOut`
  (`core.prisma:35`), which is scoped to marketing sends only.

## Hardening record

**Kept (all three, unchanged in substance — every citation verified against
the current schema and source):**

- **The row the ledger will not let you touch** — `journal_line_immutable`
  (`forbid_journal_line_mutation()`) is a real Postgres trigger in
  `apps/api/prisma/schema/migrations/20260917070552_add_accounting_ledger/migration.sql:221-231`;
  `JournalLine.contactId` is confirmed at `accounting.prisma:189`;
  `AuditLog.actorId` confirmed `SetNull` at `core.prisma:230` while
  `AuditLog.data` stays a bare `Json?`; `InboundEmail.contactId` confirmed
  `SetNull` at `crm.prisma:160` with `fromAddress`/`fromName`/`bodyText` kept
  as raw text at `crm.prisma:147-151`.
- **The payload that already left** — `OutboxEvent.payload` confirmed `Json`
  at `core.prisma:364` with no delete call anywhere in `apps/api/src`;
  `ReplicationRecord.payload` confirmed append-only at
  `replication.prisma:49-62`, and the push/pull transport this lens depends
  on is not vaporware — `replication-sync.agent.ts` actually calls
  `fetch(`${parentUrl}/api/v1/replication/push`)` and
  `.../replication/pull` under `NODE_ROLE=BRANCH`/`BRAND`
  (`env.validation.ts` — full path
  `apps/api/src/core/config/env.validation.ts:72`), so the cross-database
  copy this lens asks about is a real, wired code path, not a schema
  comment's aspiration.
- **The retention clock with no dial** — `Setting` confirmed flat `key`/
  `value` at `core.prisma:153-158`; `grep -rn "retentionUntil\|purgeAfter\|
  RetentionPolicy" apps/api/prisma/schema` returns zero matches today, exactly
  as claimed; `ReplicationRecord.dataClass` confirmed to drive FACT/POLICY
  conflict resolution, not retention, per the file's own header comment at
  `replication.prisma:1-16`.

**Killed:** none. Each of the three lenses names a distinct table-level
mechanism (an immutable trigger; a payload column with no delete path and a
live cross-node copy; a config store with no retention schema) and none
restates a lens from CLAUDE.md or the thirty prior lenses — the nearest
neighbor, Integrations' "A fact that already happened is never rejected," is
about accepting late-arriving facts, not about what happens to a person's
identifiers already embedded inside one.

**Citations corrected:** none — every path, line range, model, field,
trigger name, service, and grep in the file was opened and verified to match
the repository exactly. The one imprecision worth noting: the file cites
`env.validation.ts:72` without its directory; the full path is
`apps/api/src/core/config/env.validation.ts`, and line 72 there is indeed
`NODE_ROLE: z.enum(['STANDALONE', 'BRANCH', 'BRAND', 'ORG']).default
('STANDALONE')`, so the line content is correct — only the path was
abbreviated, not wrong.
