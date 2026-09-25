# 75 — The managerial "To-Do" widget: covered by doc 44's registry, one real source registered today

> **Correction (this session).** This document previously asserted that
> leave requests, timesheet approvals and expiring employee documents were
> "already registered" against doc 44's action hub. That was false: doc 44
> itself did not exist in the codebase until this session — `grep -rln
> "ActionHubSource" apps/api/src` returned nothing before it was built.
> The claim was never re-verified against the running code; it is
> corrected here rather than left standing. What follows replaces the
> original text.

Doc 44's own opening line states the request this note answers: "A
manager today checks four or five separate screens to find out what needs
their signature — the leave-request list, the timesheet-approval queue
(doc 42), an expiring-document report (doc 27/28), the advance-approval
list (doc 25)... This is that one screen... a registry of optional
sources, each contributing rows through a shared shape, never a hard
import of the modules it surfaces." The mechanism doc 44 describes is now
real infrastructure, built this session (`apps/api/src/core/action-hub/`).
This document tracks which of the sources doc 44 names are actually
registered against it, so the gap between "the hub exists" and "the hub
shows everything a manager needs" stays visible rather than assumed away.

## 1. What actually exists today

- **`ActionHubSource`** (`apps/api/src/core/action-hub/action-hub-source.ts`)
  — the registered-source interface every contributing module implements,
  never a hard import. `ActionHubRegistryService` collects from every
  registered source, tolerates one source failing without blanking the
  rest, and sorts the merged queue by due date.
- **Leave requests** (`LeaveRequest`, `apps/api/src/modules/payroll/
  leave-request-action.source.ts`) — the only source registered. Gated on
  `payroll.manage`; links to `/admin/payroll/leave`.
- The dashboard widget (`action-hub-widget.tsx`) and its overflow screen
  (`/admin/my-actions`) both read the real `GET /admin/action-hub`
  endpoint — reachable from the dashboard and from the nav registry.

## 2. What is named but NOT registered — because its own module isn't built

None of the following exist in this codebase today, so none can register
against the hub. Each is a separate, unbuilt work order, not a hub gap:

- **Timesheet approvals** (doc 42, `TimesheetApproval`) — doc 42 is
  unbuilt; no such model or service exists.
- **Expiring employee documents** (doc 27/28, doc 54's
  `ExpiringRecordSource` watcher) — docs 27, 28 and 54 are unbuilt.
- **Advance approvals** (doc 25) — unbuilt.
- **Stalled multi-tier approvals** (doc 63's `ApprovalStep`) and
  **unassigned support tickets** (doc 64) — both unbuilt; this document
  previously claimed they registered against the hub "this same
  documentation effort," which was never true of the actual codebase.

When any one of these is built, its own work order registers a new
`ActionHubSource` implementation and adds it to that module's own
`onModuleInit()` — per doc 44's own design, this requires zero changes to
the hub itself, to the dashboard widget, or to `/admin/my-actions`. That
is the coverage this note exists to promise; it is not a substitute for
building the other five documents.

## Scope lenses

Not repeated — doc 44's own scope lenses already answer every lens for
this mechanism; this document introduces no new schema, permission, or
write path of its own.

## Work orders

None for this document. The five real gaps above are each their own named
document (25, 27, 28, 42, 54, 63, 64) and are not scoped into this note.

## Acceptance

- The hub, the widget and the overflow screen are real and verified
  (lint/typecheck/test pass on `core/action-hub` and
  `leave-request-action.source`).
- Exactly one source (`LeaveRequestActionSource`) is registered, verified
  by `grep -rln "implements ActionHubSource" apps/api/src`.
- No other source is claimed as registered unless a `grep` for its class
  name against `apps/api/src` actually finds it.

## Out of scope

Building docs 25, 27, 28, 42, 54, 63 or 64 — each is its own document with
its own scope lenses; this note only tracks which of their sources, once
built, still need registering against doc 44's hub.
