# 26h. Hardening record: Day two: who watches it and who gets paged

Adversarial review of [26-day-two-operations.md](./26-day-two-operations.md) by the `harden:26:day-two-operations` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### The number that pages, and the number that doesn't  — strong

**Question:** Name the specific metric and threshold that should wake someone up, and the exact non-DBA screen/endpoint that surfaces it.

**Verified against:** HealthController.ready() (health.controller.ts:28) counts outboxEvent PENDING/FAILED as one deployment-wide pair, no threshold; outbox.dispatcher.ts MAX_ATTEMPTS=8 (line 7) / giveUp (line 93) is the only give-up signal, unread elsewhere. Verified.

### The stale clock nobody reads  — strong

**Question:** Name the timestamp this feature relies on for 'still alive' and the code that compares it to now to decide 'stale.'

**Verified against:** Node.lastSeenAt written fire-and-forget at node-credential.service.ts:33; PosTerminal.lastSeenAt same pattern at pos-terminals.service.ts:91. Repo-wide grep confirms zero staleness comparisons exist, only writers and orderBy sorts. Verified.

### The operator's second door  — solid

**Question:** What does a support engineer without psql access click to see this feature's failure state, and which PERMISSION_CATALOG key gates it?

**Verified against:** nav-registry.ts NAV_GROUPS (lines 46-53) has 8 groups, none operations/system; ADMIN_NAV at line 92 gated by PermissionKey from packages/shared/src/permissions.ts PERMISSION_CATALOG (line 45). Verified.

## Killed (0)

_Nothing was killed._


## Citations corrected (2)

- ReplicationCursor's per-peer/per-direction field was referred to in prose as 'sequence'; the actual Prisma field name is lastSequence (replication.prisma:97-104). Already noted in the file's own hardening record; the substantive claim about per-peer/per-direction tracking is unaffected.
- Removed a stale 'Note on filename' in the hardening record that incorrectly claimed no file existed at path 26-day-two-operations.md and that the brief actually matched 24-day-two-operations.md. Both claims are false: docs/erp-lenses/day-two-operations/26-day-two-operations.md exists and matches the brief exactly; 24-fraud-insider-risk.md is an unrelated domain. This appears to be a leftover artifact from an earlier misdirected run and was removed since it would mislead a later reader.

## Not modelled in this repo today

- No alerting/paging integration reads OutboxEvent.status, Node.lastSeenAt, or ReplicationQuarantine anywhere in apps/api/src.
- No runbook document linked from code for the FAILED-after-8-attempts, stale-node, or quarantine states.
- No admin screen exists for OutboxEvent, ReplicationRecord/ReplicationCursor/ReplicationQuarantine, or AuditLog.
- /health/ready returns one deployment-wide pendingEvents/failedEvents pair, not per-node or per-event-type breakdown.
