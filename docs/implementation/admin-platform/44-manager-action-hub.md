# 44 — The manager action hub: one queue, many optional sources

> **Status (2026-09-25): WO-44.1/44.3/44.4 built; WO-44.2 scoped to one
> real source; WO-44.5 substituted.** `core/action-hub/` (registry,
> `ActionHubSource` interface, `GET /admin/action-hub`), the dashboard
> widget, and the `/admin/my-actions` overflow screen are real and
> tested. Only `LeaveRequestActionSource` is registered — doc 42
> (timesheets), doc 27/28 (expiring documents) and doc 25 (advances) are
> themselves unbuilt, so their sources do not exist to register; this was
> a scoping decision, not an oversight (see `DECISIONS.md`). Two brief
> deviations, both because the brief assumes concepts this codebase does
> not have: `fetchFor()` takes `AuthenticatedUser`, not
> `actorPositionId` (no position/reporting-hierarchy model exists — see
> §2 below); the endpoint is gated on `analytics.view`, not
> `admin.dashboard.view` (that permission key does not exist in
> `PERMISSION_CATALOG`). Doc 75 tracks which named sources remain
> unregistered and why.

A manager today checks four or five separate screens to find out what
needs their signature — the leave-request list, the timesheet-approval
queue (doc 42), an expiring-document report (doc 27/28), the advance-
approval list (doc 25). Each screen is correct on its own; none of them
tells a manager **everything currently waiting on them**, which is the
actual daily question. This document is that one screen, built the same
way doc 26's performance signals are: **a registry of optional sources,
each contributing rows through a shared shape, never a hard import of the
modules it surfaces.**

## 1. An action item is a shape every contributing module already produces

```ts
interface ActionItem {
  id: string;               // "leave:req_123", "timesheet:ts_456" — sourced, not generated
  kind: 'LEAVE_REQUEST' | 'TIMESHEET_APPROVAL' | 'ADVANCE_APPROVAL'
      | 'EXPIRING_DOCUMENT' | 'EXPIRING_CERTIFICATE' | 'SUPPORT_ACCESS_REVIEW';
  subjectEmployeeName: string;
  summary: string;          // "Leave request, 3 days, Ahmed Raza"
  dueBy: Date | null;       // null when there is no real deadline, never a fabricated one
  href: string;             // deep link to the real screen that acts on it — this hub never acts itself
  permission: string;       // the PermissionKey gating that href, so a filtered-out item never leaks by rendering
}
```

**The hub never approves, rejects, or writes anything.** Every item's
`href` opens the real screen (doc 25's advance queue, doc 42's timesheet
approval, doc 27/28's expiry lists) that already owns that write path —
this document adds a single read surface aggregating what already exists,
never a second way to approve the same thing.

## 2. Sources register, they are not hardcoded

```ts
export interface ActionHubSource {
  readonly kind: ActionItem['kind'];
  /** Reads only rows the caller (by position/permission) may already act
   *  on — the hub applies no filtering of its own beyond what the source
   *  itself already scopes. */
  fetchFor(actorPositionId: string): Promise<ActionItem[]>;
}
```

Each optional module (`payroll`'s leave requests, doc 25's advances, doc
27's certificate expiry, doc 28's document expiry, doc 42's timesheets,
doc 39's `SupportAccessGrant` review) registers its own `ActionHubSource`
implementation from inside its own module, the same extension-point
direction every other cross-module surface in this repository already
uses (`core` never imports a pack; here, the hub never imports a feature
module — the feature module registers *into* the hub). A deployment with
`payroll` off simply has no `LEAVE_REQUEST`/`ADVANCE_APPROVAL` items ever
appear; the hub itself never knows or cares which sources exist.

## Scope lenses

**The actor with three tables** — n/a: every item is sourced from an
actor its owning module already classified.
**The principal with no permission key** — n/a.
**The grant that ends itself** — n/a: the hub grants nothing; each item's
own `permission` field is checked by the destination screen, unchanged.
**Whose rows, and which columns** — `fetchFor(actorPositionId)` is the
entire scoping mechanism: a source must return only items its own module
would already show that position, so the hub can never surface an item a
manager could not already reach by navigating there directly — restated
because it is the one rule that makes aggregation safe rather than a
permission-bypass surface.
**The threshold nobody approves alone** — n/a: the hub performs no act;
whatever threshold guards the underlying action (doc 25's approval bands,
doc 40's penalty threshold) is unchanged and unbypassed, since the hub
only links to the real screen.
**The toxic pair** — n/a: no new write path to collide with another.
**Authority and blast radius** — n/a: a read aggregation confers no
authority of its own.
**Audience is a capability, not an address** — restated as this document's
own design: `fetchFor(actorPositionId)` resolves what a *post* may act on,
never a stored list of who to show a widget to.
**Request or record** — n/a: the hub itself performs no write; see the
underlying module for each item's own classification.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity** — n/a: no money or stock fact, no posting, no new legal-entity
scoping beyond what each source already applies.
**Dry run before live** — n/a: the hub is itself a read with no computed
rule to preview beyond each source's own.
**Three silhouettes** — Solo: perhaps two or three sources ever populate
(a handful of leave requests); the hub is a convenience, not load-bearing.
Chain: a branch manager's real daily start-of-day screen. Organization:
many sources across many modules, item volume (next lens) starts to
matter, and cross-brand managers see a genuinely large aggregated queue.
**The absent collaborator** — restated as this document's central design:
every source is optional by construction; the hub with zero registered
sources renders its own empty state, never an error, and adding a new
module's source later needs no change to the hub itself.
**The second copy of the write** — n/a: the hub performs no write; each
underlying module's own idempotency (doc 25's `@@unique`, doc 42's chain-
level uniqueness) is unchanged and unbypassed.
**The hundred-thousandth row** — the hub's own aggregation query is
bounded by however many sources are registered × each source's own
already-scoped result set (typically single-digit to low-hundreds per
manager); no source may return an unbounded list, enforced by a stated
per-source cap (a source over its cap paginates via its own `href`, the
hub shows "N+ more, view all").
**The reversal document / The undo fan-out / The version stamp** — n/a:
the hub performs no reversible write of its own.
**The erasure the ledger cannot obey** — n/a: the hub persists nothing;
`subjectEmployeeName` is read fresh from each source at render time, so an
employee's erasure elsewhere is reflected here with no separate step.
**The failure path** — one source's `fetchFor()` throwing (a module
mid-outage) does not fail the whole hub — the failing source's section
shows "temporarily unavailable" and every other source's items still
render, the same graceful-degradation discipline doc 38's resilience
matrix already requires of every optional dependency.

## Work orders

**WO-44.1 — `ActionHubSource` interface** + a registry
(`ACTION_HUB_SOURCES`), the same registration-not-import pattern
`module-packs.ts` already establishes for sector packs.
**WO-44.2 — source implementations**: `payroll`'s leave requests, doc 25's
advance approvals, doc 27's certificate expiry, doc 28's document expiry,
doc 42's timesheet approvals, doc 39's support-access review — each inside
its own module, registering outward.
**WO-44.3 — aggregation endpoint**: calls every registered source for the
caller's position, merges, sorts by `dueBy`, degrades per-source on
failure (§ failure path).
**WO-44.4 — UI**: a widget on the existing admin dashboard home (doc 10's
registry-driven card grid — this is a new card, not a new page shell) plus
a full "my actions" screen for the overflow case.
**WO-44.5 — permissions**: none new — every item's own `permission` field
already names an existing key; the hub itself needs only
`admin.dashboard.view`, already granted to every admin role.

## Acceptance

- A manager with `payroll` off never sees a `LEAVE_REQUEST` item, and the
  hub still renders every other registered source's items.
- An item's `href` opens exactly the screen that already handles that
  action — no second approval path is ever created.
- A source that throws does not blank the whole hub; every other source's
  section still renders.
- `fetchFor()` never returns an item the calling position could not
  already reach directly, proven per source with the same isolation test
  every other subtree-scoped query in this repository already requires.
- Registering a new source needs zero changes to the hub's own aggregation
  code, proven by adding a trivial test source and confirming it appears
  with no hub-side edit.

## Out of scope

Acting on an item without leaving the hub (inline approve/reject buttons)
— named and deferred: it would duplicate every underlying screen's own
approval logic (thresholds, self-approval refusals) a second time, exactly
the risk `CLAUDE.md`'s "no duplicate implementation" rule warns against; a
future work order could add it per-source once the pattern is proven, not
by default. Push notifications for a new action item — this is a pull
screen; doc 33's channels are where a "you have a pending approval" alert
would be sent, not built here.
