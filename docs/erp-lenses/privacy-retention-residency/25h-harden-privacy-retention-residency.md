# 25h. Hardening record: Privacy, retention and residency

Adversarial review of [25-privacy-retention-residency.md](./25-privacy-retention-residency.md) by the `harden:25:privacy-retention-residency` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### The row the ledger will not let you touch  — strong

**Question:** When an erasure request reaches a person whose id sits in JournalLine.contactId, what happens to that row, and name the mechanism in this repo that refuses to let it change?

**Verified against:** journal_line_immutable trigger verified in migration.sql:221-231; JournalLine.contactId at accounting.prisma:189; AuditLog.actorId SetNull at core.prisma:230; InboundEmail SetNull fields at crm.prisma:147-160 — all confirmed exact.

### The payload that already left  — strong

**Question:** Name every place this person's identifiers already sit inside a JSON payload outside the User row today, and state what happens to each one when their erasure request is honored.

**Verified against:** OutboxEvent.payload at core.prisma:364, no delete call in apps/api/src (verified); ReplicationRecord append-only design at replication.prisma:49-62; confirmed the push/pull transport is real and wired (replication-sync.agent.ts fetches parent /api/v1/replication/push and /pull under NODE_ROLE=BRANCH/BRAND), not dormant.

### The retention clock with no dial  — strong

**Question:** For a FACT row, a POLICY row, and a raw InboundEmail, what is the retention period in days, where is that number stored as data, and what deletes the row when it expires?

**Verified against:** Setting flat key/value at core.prisma:153-158; grep for retentionUntil/purgeAfter/RetentionPolicy across schema returns zero (verified by running it); ReplicationRecord.dataClass confirmed to drive conflict resolution not retention per replication.prisma:1-16 header.

## Killed (0)

_Nothing was killed._


## Citations corrected (2)

- No factual corrections needed — every cited path, line, model, field, trigger, and grep was opened and matches the repository exactly.
- Minor precision note (not a substantive correction): the file cites 'env.validation.ts:72' without its directory; full path is apps/api/src/core/config/env.validation.ts, and the line content (NODE_ROLE enum with STANDALONE/BRANCH/BRAND/ORG) matches exactly.
