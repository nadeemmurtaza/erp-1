# 26g generate day two operations

Output of the `gen:26:day-two-operations` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Day two: who watches it and who gets paged

## File

docs/erp-lenses/24-day-two-operations.md

## Lenses

### The number that pages, and the number that doesn't

**Question:** For this feature, name the specific metric and threshold that should wake someone up, and the exact screen or endpoint an operator with no database access reads it from — not "monitor it."

**Grounding:** apps/api/src/core/health/health.controller.ts:28 (HealthController.ready() aggregates outboxEvent PENDING/FAILED counts deployment-wide, no threshold, no pager call); apps/api/src/core/events/outbox.dispatcher.ts MAX_ATTEMPTS = 8

### The stale clock nobody reads

**Question:** Name the timestamp this feature relies on to say "still alive" (a lastSeenAt, a replication cursor, a heartbeat), and the piece of code that compares it to now and decides "stale" — not just that the column is written.

**Grounding:** apps/api/src/core/replication/node-credential.service.ts:33 (Node.lastSeenAt touched fire-and-forget, no reader); apps/api/src/modules/sales/pos/pos-terminals.service.ts:91 (PosTerminal.lastSeenAt same pattern); ReplicationCursor in replication.prisma has no lag computation anywhere

### The operator's second door

**Question:** For this feature, what does a support engineer who holds a role but not psql access actually click to see what is happening, and which key in PERMISSION_CATALOG gates that screen?

**Grounding:** apps/web/src/components/admin/nav-registry.ts:46-53 (eight NAV_GROUPS, none operations/system); no admin route exists anywhere for OutboxEvent, ReplicationRecord/Cursor/Quarantine, or AuditLog (core.prisma:220); only reader today is GET /health/ready

## Absences

- Any alerting or paging integration — no webhook, PagerDuty-style call, or push trigger reads OutboxEvent.status, Node.lastSeenAt or ReplicationQuarantine anywhere in apps/api/src
- A written runbook referenced from code for the FAILED-after-8-attempts state, the stale-node state, or the quarantine state
- Any admin screen for OutboxEvent, ReplicationRecord/Cursor/Quarantine, or AuditLog — nav-registry.ts has no operations/system nav group
- A per-node or per-queue breakdown on /health/ready — it returns one deployment-wide pendingEvents/failedEvents pair, not a number per originNodeId or event type

