# 75 — The managerial "To-Do" widget: already built, as doc 44

Doc 44's own opening line already states this exact request as its reason
for existing: "A manager today checks four or five separate screens to
find out what needs their signature — the leave-request list, the
timesheet-approval queue (doc 42), an expiring-document report (doc
27/28), the advance-approval list (doc 25)... This is that one screen,
built... [as] a registry of optional sources, each contributing rows
through a shared shape, never a hard import of the modules it surfaces."
"Reviewing pending leave requests, approving timesheets, and updating
employee documents" is, verbatim, three of doc 44's own named source
examples. This document is a coverage note, not a new widget.

## 1. What already exists

- **`ActionHubSource`** — the registered-source interface every
  contributing module implements, never a hard import.
- **Leave requests** (`LeaveRequest`, doc 19/57) — already registered as a
  source per doc 44's own worked example.
- **Timesheet approvals** (doc 42's `TimesheetApproval`) — already
  registered, and now generalizable onto doc 63's own `ApprovalChain`
  mechanism, still surfaced through the identical `ActionHubSource` shape.
- **Expiring employee documents** (doc 27/28, unified by doc 54's own
  `ExpiringRecordSource` watcher) — already registered.

Doc 63's new `ApprovalStep` stalled-approver surfacing and doc 64's
unassigned-ticket surfacing (both built this same documentation effort)
already register against this identical hub, per their own stated work
orders — the hub keeps growing sources without ever growing a second
queue mechanism.

## Scope lenses

Not repeated — doc 44's own scope lenses already answer every lens for
this exact mechanism; this document introduces no new schema, permission,
or write path.

## Work orders

None. If a genuinely new source type is later requested (e.g., doc 79's
asset-return overdue list, once written), it registers against doc 44's
existing `ActionHubSource` interface exactly as every source above already
does — never a parallel to-do mechanism.

## Acceptance

- No schema, service, or permission change — verified by citation to doc
  44's own text and its already-registered sources.

## Out of scope

Nothing further — this domain has no remaining gap; this note exists so
the promotional list's own bullet has a corresponding, citable document.
