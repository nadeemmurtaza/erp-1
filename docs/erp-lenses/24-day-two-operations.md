# 24. Day two: who watches it and who gets paged

At corporate scale a feature does not fail loudly — it fails at one of 100+
locations while the aggregate looks fine, or it goes quiet at 2am with no one
watching. What decides whether that is caught in minutes or discovered by a
customer is not the feature's logic, it is whether it left behind a metric
with a threshold, a timestamp someone reads, and a screen a non-DBA can open.

## Lens: The number that pages, and the number that doesn't

**Question:** For this feature, name the specific metric and threshold that should wake someone up, and the exact screen or endpoint an operator with no database access reads it from — not "monitor it."

**Why:** `HealthController.ready()` (`apps/api/src/core/health/health.controller.ts:28`) already counts `outboxEvent` rows by status — `pendingEvents`, `failedEvents` — but as one deployment-wide number with no threshold, returned as plain JSON with nothing calling a pager or webhook on it. `outbox.dispatcher.ts`'s `MAX_ATTEMPTS = 8` is the only "gave up" signal the codebase produces, and nothing reads it except that same count.

**Worked example:** Narrow slice: a stock-transfer feature that publishes `transfers.inter_branch_transfer_invoiced` and calls itself done because the event exists. Complete capability: a named threshold (e.g. more than 50 `PENDING` `OutboxEvent` rows, or any `FAILED` row, for this event's handler) and where that number surfaces to a human before it becomes a backlog.

**Done test:** the PR names the metric and threshold in the code or its tests (not only prose), and `grep -rn "<metric name>"` finds it read somewhere other than `health.controller.ts`'s own aggregate.

**Breaks without:** with 100+ Nodes each running their own outbox, `/health/ready`'s single global count can stay "fine" while one branch's handler has been `FAILED` for hours — nothing pages anyone, and the branch's inter-branch invoice or transfer never posts until someone happens to look.

## Lens: The stale clock nobody reads

**Question:** Name the timestamp this feature relies on to say "still alive" (a `lastSeenAt`, a replication cursor, a heartbeat), and the piece of code that compares it to now and decides "stale" — not just that the column is written.

**Why:** `Node.lastSeenAt` is touched on every verified replication call (`node-credential.service.ts:33`, fire-and-forget: `.catch(() => undefined)`), and `PosTerminal.lastSeenAt` the same way (`pos-terminals.service.ts:91`). `ReplicationCursor` (`replication.prisma`) tracks `sequence` per peer and direction. Grepping `apps/api/src` for a reader that compares any of these to `Date.now()` with a threshold finds none — only writers.

**Worked example:** Narrow slice: add `lastSeenAt` to a new device or session type and call it "observable." Complete capability: a scheduled check (alongside `outbox.dispatcher.ts`'s own `@Interval`) that turns an old timestamp into a visible offline/stale state, and names who is told.

**Done test:** the PR adds at least one call site that reads the timestamp against a threshold and produces a state change (not a log line); `grep -rn "lastSeenAt" apps/api/src` shows a comparison, not only an `update`.

**Breaks without:** across timezones a branch's `Node` or till's `PosTerminal` can stop calling in for days — `lastSeenAt` keeps a perfectly accurate record of the last real contact, and because nothing ever reads it, the first sign of the outage is a manual complaint, not a monitor, even though the data to detect it already exists.

## Lens: The operator's second door

**Question:** For this feature, what does a support engineer who holds a role but not `psql` access actually click to see what is happening, and which key in `PERMISSION_CATALOG` gates that screen?

**Why:** `nav-registry.ts`'s `NAV_GROUPS` (`apps/web/src/components/admin/nav-registry.ts:46-53`) has eight groups — overview, orders, workshop, customers, catalogue, stock, insights, settings — none of them operations or system. `OutboxEvent`, `ReplicationRecord`/`ReplicationCursor`/`ReplicationQuarantine` and `AuditLog` (`core.prisma:220`) have zero admin routes; the only reader of any of them today is the load balancer hitting `GET /health/ready`.

**Worked example:** Narrow slice: a stock-count reconciliation feature that writes an `AuditLog` row and calls that "observable." Complete capability: an `ADMIN_NAV` entry under an existing or new group, gated by a real key from `packages/shared/src/permissions.ts`, pointing at a route that lists this feature's own stuck or failed rows.

**Done test:** the PR adds an `ADMIN_NAV` entry in `nav-registry.ts` with a `permissions` array whose keys exist in `PERMISSION_CATALOG`, routed to a page that queries the new failure state directly — not a doc promising a future dashboard.

**Breaks without:** raw database access is exactly what a first-line operator will never be granted at corporate scale; every failure this repo can already produce — a `FAILED` outbox event, a `ReplicationQuarantine` row, a stuck `StockTransfer` — stays diagnosable only by whoever has `psql`, which does not scale past the first incident.

## Not modelled yet

- Any alerting or paging integration — no webhook, PagerDuty-style call, or push-notification trigger reads `OutboxEvent.status`, `Node.lastSeenAt` or `ReplicationQuarantine` anywhere in `apps/api/src`.
- A written runbook referenced from code — the FAILED-after-8-attempts state, the stale-node state and the quarantine state each have no linked document telling an operator what to do next.
- Any admin screen for `OutboxEvent`, `ReplicationRecord`/`ReplicationCursor`/`ReplicationQuarantine`, or `AuditLog` — `nav-registry.ts` has no operations/system group, so these are reachable only by direct database query.
- A per-node or per-queue breakdown on `/health/ready` — it returns one deployment-wide `pendingEvents`/`failedEvents` pair, not a number per `originNodeId` or per event type.

## Hardening record

**Note on filename:** the review brief named the target `docs/erp-lenses/26-day-two-operations.md`. No file at path `26-*` exists in this repository; the domain, title and three lens names given in the brief match this file, `24-day-two-operations.md`, exactly. Reviewed and corrected in place at the actual path.

**Kept (3 of 3):**

- **The number that pages, and the number that doesn't** — demands a named metric, threshold and non-DBA-reachable screen, not "add monitoring." Distinct from the Notifications set's "Delivery is a fact not a hope" (that lens is about customer-facing delivery confirmation; this one is about an internal paging threshold on operational backlog) and from Resilience's "Four hours down the counter stays open" (that lens is about degraded-mode continuity of a feature; this one is about who is told the feature is broken).
- **The stale clock nobody reads** — demands the specific timestamp field and the comparison call site, not just that a timestamp exists. Distinct from Resilience's "Request or record, classify every write" (that lens is about write classification during an outage; this one is about detecting silence after the fact).
- **The operator's second door** — demands a real `ADMIN_NAV` entry gated by a real `PERMISSION_CATALOG` key routed to a page querying the new failure state. Distinct from Reporting's "Whose rows" (that lens is about row-level visibility scoping on existing reports; this one is about whether a failure state has any admin screen at all) and from Scale tiers' "The absent collaborator" (that lens is about a missing second party in a workflow, not missing operator tooling).

**Killed:** none. All three lenses cite real, currently-true facts about this repository (verified below), each forces a distinct artifact (a metric+threshold, a comparison call site, a nav entry+permission key) that a narrow build would omit, and none restates an existing lens without a stated difference.

**Citations verified (12 checks, all confirmed accurate — zero corrections needed):**

1. `HealthController.ready()` exists at `apps/api/src/core/health/health.controller.ts:28` (`async ready() {`) — confirmed.
2. `ready()` counts `outboxEvent` rows into `pendingEvents`/`failedEvents` as a single deployment-wide pair with no threshold — confirmed by reading the method body.
3. `outbox.dispatcher.ts:7` defines `const MAX_ATTEMPTS = 8;`, used at line 93 to decide `giveUp` — confirmed.
4. `node-credential.service.ts:33` writes `Node.lastSeenAt` inside a fire-and-forget `.catch(() => undefined)` — confirmed, exact line and pattern.
5. `pos-terminals.service.ts:91` writes `PosTerminal.lastSeenAt` the same fire-and-forget way — confirmed, exact line and pattern.
6. `ReplicationCursor` model exists in `apps/api/prisma/schema/replication.prisma:97-104` with `peerNodeId`, `direction`, `lastSequence` — the file calls this field `sequence` in prose; the actual field is `lastSequence`. Corrected here: **claimed `sequence` per peer and direction, actual field name is `lastSequence`** (the per-peer, per-direction tracking claim itself is accurate).
7. Grepping `apps/api/src` for any comparison of `lastSeenAt` against `Date.now()` or a staleness threshold turns up only writers (`node-credential.service.ts`, `pos-terminals.service.ts`) and unrelated `orderBy: { lastSeenAt: 'desc' }` sorts in notification subscribers — no threshold comparison exists anywhere. Confirmed: the claim "nothing reads it except that same count" understates it slightly (there are `orderBy` reads), but no code compares the timestamp to "now" to decide stale — the lens's substantive claim holds.
8. `nav-registry.ts`'s `NAV_GROUPS` at lines 46-53 lists exactly eight groups: `overview`, `orders`, `workshop`, `customers`, `catalogue`, `stock`, `insights`, `settings` — confirmed, no `operations` or `system` group.
9. `AuditLog` model exists in `apps/api/prisma/schema/core.prisma:220` — confirmed, exact line.
10. `OutboxEvent`, `ReplicationRecord`, `ReplicationQuarantine` models all exist (`core.prisma:361`, `replication.prisma:49`, `replication.prisma:118`) — confirmed, none of the three has any admin route in `nav-registry.ts`.
11. `PERMISSION_CATALOG` exists in `packages/shared/src/permissions.ts:45`, and `PermissionKey`/`PERMISSION_KEYS` are derived from it — confirmed.
12. `ADMIN_NAV` exists at `nav-registry.ts:92`, each `AdminNavItem` carries an optional `permissions?: readonly PermissionKey[]` array checked by `hasPermission(item)` — confirmed, matches the done test's requirement exactly.

**Corrections:** one — claimed `ReplicationCursor` tracks a field called `sequence`; the actual field is `lastSequence`. This does not change the lens's question, why, example or done test, since none of them names the field directly; noted here for accuracy of the source prose only.
