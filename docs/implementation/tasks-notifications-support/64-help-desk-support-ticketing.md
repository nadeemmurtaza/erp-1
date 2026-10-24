# 64 — In-app help desk: a genuinely new capability

> **Status: built (2026-09-27), WO-64.1–64.5, DECISIONS.md ADR-064.**
> `SupportTicket`/`TicketMessage`/`TicketStatus`/`TicketPriority`
> (`support.prisma`), `SupportTicketsService`
> (`create()`/`reply()`/`assign()`/`transition()`/`list()`/`get()`),
> `SupportTicketActionSource` (registered into doc 44's own action-hub
> registry), the four named permissions, and a three-screen admin UI
> (list, raise, detail-with-reply) with a nav entry under Settings — "per
> the request's own placement" — are all real, at
> `apps/api/src/modules/customers/support/` and
> `apps/web/src/app/(admin)/admin/(app)/support/tickets/`. A new,
> standalone module (`support`, `core`, not off by default): nothing
> depends on it, it depends on nothing else, matching this document's own
> "The absent collaborator" lens.
>
> One list screen serves both a requester's own tickets and a handler's
> queue — the API's own visibility scoping (`support.tickets.view_all`
> sees everything, everyone else sees only what they raised or were
> assigned) makes a separate "support-queue view for handlers" screen
> unnecessary, this document's own WO-64.5 wording notwithstanding.
>
> Two decisions beyond this document's own literal sketch, both required
> to make its own stated requirements real — see `DECISIONS.md` ADR-064
> for the full reasoning: who may call `transition()` is resolved
> per-instance inside the service (the current assignee, a
> `support.tickets.reassign` holder, or — only for the one backward move —
> the original requester), since this document's own WO-64.3 names no
> separate permission for it; and `get()` batch-resolves every bare
> `userId` scalar on a ticket to a display name before it ever reaches an
> admin screen, the same discipline ADR-061 already established for a raw
> variant id.
>
> A single SLA window (`SupportTicketSlaMinutes`, default 240 minutes)
> backs the action-hub source's SLA-breach detection — client-editable, no
> per-priority tuning yet, exactly this document's own named, deferred
> scope.

Nothing in this repository today lets a user raise a support request from
inside the product and have it tracked, assigned, and resolved. `AuditService`
records what happened; `NotificationsService` delivers a message; neither
is a ticket with a lifecycle. This is a real gap, scoped narrowly: an
in-app ticketing module living alongside "account and company profile
configuration menus," per the request's own words — internal-support-facing
first, reusing every existing primitive (permissions, org-tree scoping,
notification delivery) rather than building a second identity or messaging
system underneath it.

## 1. A ticket is a record of a request, with an ordered reply thread

```prisma
model SupportTicket {
  id             String   @id @default(cuid())
  organizationId String
  raisedByUserId String
  subject        String
  category       String   // free text or a small seeded list — not a closed enum,
                           // since categories are exactly the kind of thing that
                           // varies per client's own support taxonomy
  status         TicketStatus  // OPEN | IN_PROGRESS | RESOLVED | CLOSED
  priority       TicketPriority  // LOW | NORMAL | HIGH | URGENT
  assignedToUserId String?
  createdAt      DateTime @default(now())
  resolvedAt     DateTime?

  messages TicketMessage[]

  @@index([organizationId, status, assignedToUserId])
}

model TicketMessage {
  id         String   @id @default(cuid())
  ticketId   String
  authorId   String
  body       String
  createdAt  DateTime @default(now())

  ticket SupportTicket @relation(fields: [ticketId], references: [id])
}

enum TicketStatus   { OPEN  IN_PROGRESS  RESOLVED  CLOSED }
enum TicketPriority { LOW  NORMAL  HIGH  URGENT }
```

`TicketStatus`/`TicketPriority` are fixed structural enums (the ticket
module's own workflow states, not a client-varying policy) — the identical
reasoning that already justifies `BulletinCategory` (doc 61) and
`AttendanceEventType` (doc 43) as enums while `LeaveType`/`DeductionType`
are rows.

## 2. Assignment and status transitions reuse the org tree, not a new team model

```ts
async assign(ticketId: string, assigneeUserId: string, actorId: string): Promise<void> {
  // assigneeUserId must hold `support.tickets.handle` — checked server-side,
  // never trusted from the client, exactly PBAC's own standing rule.
}

async transition(ticketId: string, next: TicketStatus, actorId: string): Promise<void> {
  // OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED, forward-only in the ordinary
  // path; RESOLVED -> IN_PROGRESS is the one allowed backward move (the
  // requester reopens because the issue recurred), everything else refused.
}
```

No new "support team" entity is introduced — an assignee is simply any
`User` holding `support.tickets.handle`, resolved the same way doc 24's own
audience-as-a-capability already resolves "whoever holds this permission,"
applied here to ticket routing instead of a notification audience.

## Scope lenses

**The actor with three tables** — `raisedByUserId`/`assignedToUserId`/
`TicketMessage.authorId` are all doc 20's existing `User`; no new actor
kind.
**The principal with no permission key** — n/a: every participant is an
authenticated `User`.
**The grant that ends itself** — an assignee who loses `support.tickets.handle`
(role change, deactivation) stops appearing as an eligible assignee for
*new* assignments immediately (resolved at assignment time, not cached);
their already-assigned open tickets are surfaced to doc 44's own action hub
as needing reassignment, never left silently orphaned on a person who can
no longer act on them.
**Whose rows, and which columns** — a ticket is visible to its own
`raisedByUserId`, its `assignedToUserId`, and anyone holding
`support.tickets.view_all` scoped to the ticket's `organizationId` — a
requester never sees another user's tickets, an ordinary support handler
sees only tickets assigned to them unless granted the broader view
permission.
**The threshold nobody approves alone** — n/a: raising or resolving a
support ticket commits no money or stock; no approval quorum applies.
**The toxic pair** — n/a: no permission pair is toxic together for a
support ticket.
**Authority and blast radius** — who may reassign any ticket (not just
their own) is `support.tickets.reassign`, distinct from
`support.tickets.handle` (work tickets assigned to you) — the audit row is
`AuditService`'s own state-change log on `SupportTicket.assignedToUserId`
and `.status`, old value and new value both.
**Audience is a capability, not an address** — a new ticket notifies
whoever holds `support.tickets.handle` scoped to the ticket's own
`organizationId` (a small holder set: a direct escalation per doc 24's own
audience rule) rather than a `supportEmail` literal — the exact
counter-example `inventory.listener.ts` already warns against, avoided
here from the start.
**Request or record** — raising a ticket is a REQUEST (it can be
malformed, e.g., empty subject, and is refused); once created, the
`SupportTicket` row and every `TicketMessage` are RECORDS of what was
asked and said, never edited in place — a correction is a new message, the
same immutable-thread discipline chat and comment systems already require
everywhere else in this repository.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity** — n/a: no money or stock fact.
**Dry run before live** — n/a: no computed rule to preview.
**Three silhouettes** — Solo: a handful of tickets, likely all landing on
one owner-operator; `support.tickets.view_all` granted broadly since there
is no real team to separate. Chain: real routing across a small support
team per branch or region. Organization: cross-brand support load,
`(organizationId, status, assignedToUserId)`'s own index (next lens) is
where volume first matters.
**The absent collaborator** — a fully standalone module; nothing here
depends on another optional module being present, and nothing else in this
repository depends on it — it degrades to simply not existing when off
(`MOD-1`).
**The second copy of the write** — `assign()`/`transition()` are ordinary
idempotent state-setting calls (assigning the same person twice is a
no-op, not a duplicate); no retried-call double-booking risk exists since
nothing here is a physical event.
**The hundred-thousandth row** — indexed by `(organizationId, status,
assignedToUserId)` for "my open tickets," bounded pagination on every list
view, per this repository's own standing pagination requirement.
**The reversal document** — n/a: a ticket has no monetary or stock reversal;
its own status transitions are its record.
**The undo fan-out** — closing a ticket has no side effects on any other
module; reopening (`RESOLVED` → `IN_PROGRESS`) is the one explicit,
logged undo path.
**The version stamp** — n/a: no policy versioning; a ticket's own thread
is append-only and self-explanatory without a separate version concept.
**The erasure the ledger cannot obey** — `raisedByUserId`/
`assignedToUserId`/`TicketMessage.authorId` each hold a person; on user
deletion, follows doc 20's own stated basis (pseudonymise the author while
retaining ticket content as an organizational record, never a hard
cascade-delete of the support history).
**The failure path** — a ticket stuck `OPEN` past a configurable SLA
window surfaces to doc 44's own action hub (an "unassigned/unanswered
tickets" source registered against it) rather than silently aging
forever — reusing doc 44's registry, never a bespoke SLA-breach mechanism.

## Work orders

**WO-64.1 — schema**: `SupportTicket`, `TicketMessage`, `TicketStatus`,
`TicketPriority`, forward-only migration.
**WO-64.2 — `SupportTicketsService`**: `create()`, `reply()`, `assign()`,
`transition()`, each enforcing the permission and visibility rules above.
**WO-64.3 — permissions**: `support.tickets.raise` (broad — every
authenticated user), `support.tickets.handle`, `support.tickets.view_all`,
`support.tickets.reassign`, seeded to real roles.
**WO-64.4 — doc 44 integration**: register an `ActionHubSource` for
unassigned/SLA-breaching tickets, reusing doc 44's own registry rather than
a bespoke breach mechanism.
**WO-64.5 — UI**: a "raise a ticket" entry point alongside account/company
profile settings (per the request's own placement), a ticket list + detail
+ reply thread, a support-queue view for handlers, a nav entry.

## Acceptance

- A user who did not raise a ticket and does not hold
  `support.tickets.view_all` cannot open it, proven by a spec.
- Reassignment away from a deactivated handler's open tickets is surfaced
  in doc 44's action hub, proven by a spec simulating the deactivation.
- `RESOLVED` → `IN_PROGRESS` is the only allowed backward transition;
  every other backward transition is refused, proven by a spec.

## Out of scope

Customer-facing (external) support ticketing — this document scopes the
*internal* help desk named by the request's own wording ("in-app... alongside
account and company profile configuration menus"); an external
customer-support portal is a distinct, separately-scoped capability with
its own actor model (`Contact`/`Party`, not `User`) if it is ever requested.
SLA policy configuration (breach thresholds per priority) beyond a single
default window — named as a natural extension once real usage data exists
to justify per-priority tuning.
