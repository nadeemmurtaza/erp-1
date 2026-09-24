# 25g generate privacy retention residency

Output of the `gen:25:privacy-retention-residency` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Privacy, retention and residency

## File

docs/erp-lenses/privacy-retention-residency/25-privacy-retention-residency.md

## Lenses

### The row the ledger will not let you touch

**Question:** When an erasure request reaches a person whose id sits in JournalLine.contactId, what happens to that row, and name the mechanism in this repo that refuses to let it change?

**Grounding:** accounting.prisma:189 (JournalLine.contactId), the journal_line_immutable DB trigger (forbid_journal_line_mutation()) that forbids UPDATE/DELETE forever, AuditLog.actorId SetNull vs AuditLog.data Json (core.prisma:220-235), User relation onDelete:Cascade at core.prisma:88,107,124,146,285,342,398, InboundEmail.bodyText/fromName/fromAddress with contactId SetNull (crm.prisma:142-162)

### The payload that already left

**Question:** Name every place this person's identifiers already sit inside a JSON payload outside the User row today, and state what happens to each one when their erasure request is honored.

**Grounding:** OutboxEvent.payload Json (core.prisma:361-374, no delete call found anywhere in apps/api/src), ReplicationRecord.payload Json and its append-only FACT-up/POLICY-down design (replication.prisma:1-74), NODE_ROLE=BRANCH/BRAND requiring PARENT_URL (env.validation.ts:72-245), Location.address as bare Json? with no country field (inventory.prisma:102)

### The retention clock with no dial

**Question:** For a FACT row, a POLICY row, and a raw InboundEmail, what is the retention period in days, where is that number stored as data, and what deletes the row when it expires?

**Grounding:** Setting model as flat key/value with no scope (core.prisma:151-158), ReplicationRecord.dataClass FACT|POLICY documented as conflict-resolution not retention (replication.prisma:9-16,28-31,59), absence of any cron/scheduled purge job in apps/api/src, absence of retentionUntil/purgeAfter columns anywhere in apps/api/prisma/schema

## Absences

- No retention/expiry column anywhere in the schema (RoleGrant, UserRoleAssignment, UserPermission, AdminScope, Setting, OutboxEvent, ReplicationRecord carry only createdAt)
- No purge or anonymization job for OutboxEvent.payload, ReplicationRecord.payload, AuditLog.data, or InboundEmail.bodyText
- No jurisdiction/country/region column on Location, Node, or RetailBrand - Location.address is a bare Json? with no structured country field
- No consent or legal-basis model beyond User.marketingEmailOptOut, which is scoped only to marketing sends

