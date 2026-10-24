# 227 — Complaints and visitors

> **Industry-specific module.** This belongs to the **housing-society sector pack** (real estate / society management), not to `core`. It is enabled only in housing-society deployments through the `MODULES` allowlist; other sectors never load it, and core never imports it.
>
> **Status: Planned.** Module: `society-service`. Two jobs, so two screens:
> *resolve complaints* and *log visitors*. Each is small on purpose.

## Part A — Complaints management

### A1. Reuse, don't rebuild

A complaint is a core `support` ticket with society categories, and an
internal follow-up is a core `tasks` item (doc 23). This pack adds
**categories, routing rules and SLAs** only.

| Concept | Where it lives |
|---|---|
| Ticket, status, comments, attachments | core `support` |
| Category: water, electricity, sewerage, roads, security, billing, plot/possession, noise, other (list is `Setting`) | this pack, data |
| Assignee/department, SLA | `ComplaintRoutingRule` rows |
| Follow-up | core `tasks` |

### A2. Flow — Track, Resolve, Follow up

`RAISED → ACKNOWLEDGED → IN_PROGRESS → RESOLVED → CLOSED` (or `REOPENED` once within 7 days).

* **Raised** by a member (portal), by staff on a member's behalf (phone/walk-in),
  or by a resident. Linked to `plotId` and, where relevant, `bookingId`.
* **Track**: the member sees status and timeline; the office sees a queue.
* **Resolve** records what was done, cost (if any, an expense voucher link),
  evidence photo.
* **Follow up**: after `RESOLVED` the member is asked "fixed?" once; "no"
  reopens and escalates; no answer auto-closes after 7 days.
* **Billing complaints** (wrong installment, receipt not shown) link to the
  installment/receipt and are routed to accounts, not general staff.

### A3. Routing and SLA (defaults in `Setting`, per category)

| Step | Default | Why | On breach |
|---|---|---|---|
| Acknowledge | 24 h | A visible reply within a day is the single biggest satisfaction factor | escalate to department lead |
| Resolve (routine) | 5 working days | Typical for a minor service issue | manager at day 3 |
| Resolve (urgent: water/power/security) | 24 h | Safety and health | director at 12 h |
| Auto-close after resolved, no reply | 7 days | Stops stale tickets, reopenable | — |

Routing is a pure `route(complaint, rules, roster)` function, replayable
over last month's complaints with nothing written. Audience always resolves
from `society.complaints.handle` + project/block scope; zero holders →
escalate to admin; many → digest.

### A4. Acceptance

1. A raised complaint reaches the right queue within 2 s with plot and member attached.
2. Breaching acknowledge SLA escalates exactly once; a re-run changes nothing.
3. A member sees only their own complaints.
4. Reopen works once within 7 days, then needs staff.
5. SLA report: every number drills to the tickets.

## Part B — Visitor management

### B1. The job

Gate guard (or a resident) records who is coming to which plot; the resident
knows; the society keeps the history. Nothing more.

### B2. Tables

`VisitorPass` (pre-approval): `plotId`, `hostPartyId`, `visitorName`, `phone?`,
`vehicleNo?`, `validFrom`, `validTo`, `code` (random 128-bit, QR-capable),
`status` (`ACTIVE` `USED` `EXPIRED` `CANCELLED`).
`VisitLog`: `plotId`, `visitorName`, `phone?`, `vehicleNo?`, `purpose`, `passId?`,
`enteredAt`, `exitedAt?`, `gateId` (a `Location` row), `recordedByUserId`,
`approvedBy` (`RESIDENT` | `GUARD_OVERRIDE` | `PASS`).

### B3. Flow

1. **Pre-approved**: resident creates a pass; guard scans/enters the code →
   entry logged, resident notified.
2. **Walk-up**: guard enters visitor + plot; resident gets a
   notification and approves/denies (with a timeout); `GUARD_OVERRIDE` is
   allowed only when the resident does not respond, and is flagged in the log.
3. **Exit**: one tap marks `exitedAt`; visitors still inside at day-end are
   listed.
4. **Delivery/staff/contractor**: recurring passes with a weekday/time window;
   expiring on their own.
5. **History**: filter by plot, date, visitor, vehicle; export under
   `society.visitors.export`. Photo capture is optional and a per-society
   policy (privacy), off by default.

### B4. Resilience and privacy

* **Gate offline**: guard records on paper or in a locally cached entry list;
  entries sync with an idempotency key (`gateId+localSerial`); a visit is a
  *record* — never refused by sync.
* No notification provider → the gate screen still shows the resident's
  decision if they use the portal; otherwise guard override with flag.
* Visitor identity numbers and phone numbers are masked in lists and
  pseudonymised after a retention window (default 90 days, `Setting`).
* Guard role sees only the gate screen — not members, money or bookings.

### B5. Acceptance

1. A valid pass entered at the gate logs entry in ≤ 2 s and notifies the host.
2. An expired or cancelled pass is refused with a clear reason.
3. A walk-up without response past the timeout is allowed only as `GUARD_OVERRIDE`, flagged.
4. Gate offline → entries made offline appear once on reconnect, no duplicates.
5. A guard cannot read any member, booking or finance data (test).

### Permissions

`society.complaints.raise` (portal/staff), `society.complaints.handle`,
`society.complaints.assign`, `society.visitors.record` (gate role, narrow),
`society.visitors.passes` (resident via portal), `society.visitors.view`,
`society.visitors.export`.

### Work orders

227.1 complaint categories + routing + SLA · 227.2 portal + staff queue ·
227.3 follow-up/reopen · 227.4 visitor passes + gate screen · 227.5 resident
approval + notifications · 227.6 history/export + offline gate sync.
