# ADR-065 — Doc 148 (external customer support portal): built as a second, `Contact`-keyed model alongside doc 64's own `SupportTicket`, sharing its handler permissions and its action-hub source rather than inventing either again

[← Decision log](../DECISIONS.md)


### Context

Doc 64 built the internal help desk and named its own external
counterpart as explicitly out of scope: "a customer-facing support portal
is a separate, larger effort," deferred to doc 148. That document's own
central thesis is that the two are not the same feature with a different
skin — the requester is fundamentally different. An internal ticket is
raised by a `User`, a staff member already inside the permission system.
An external one is raised by a customer, who is a `Contact`/`Party` in
this codebase's own three-table actor model (`CLAUDE.md`'s "The actor with
three tables" lens) and is never issued a `PermissionsGuard` principal for
it. Building this as a second `raisedByUserId` on the same
`SupportTicket` table would have been the shortcut; it would also have
been wrong, since a customer's session identity is their `User.id`, not a
staff principal, and the moment a customer had no order yet, there would
be nothing to key a ticket to at all.

### Decision — built: `CustomerSupportTicket`/`CustomerSupportMessage`, `CustomerSupportService`, a shared `SupportHandlersService`, an extended action-hub source, two customer-facing screens plus a staff queue

`CustomerSupportTicket`/`CustomerSupportMessage`/`CustomerTicketStatus`/
`SupportMessageAuthorType` land in the same `support.prisma` doc 64 owns
(one schema directory compiles as one schema; no new file was needed),
keyed on `contactId`, never `raisedByUserId`. The document's own sketch
carries an `organizationId` column; the built model has none, the same
deliberate omission ADR-040/044/046/049/060/062 already establish for
every other model in this deployment — this codebase's own tenant
boundary is the deployment itself, not a row-level column, and the file's
own header comment names the precedent rather than leaving the deviation
silent. `raise()` finds-or-creates
the caller's own `Contact` via `CrmService.upsertContact()` inside the
same transaction as the ticket write — the mechanism that closes the doc's
own "Contact creation timing gap": historically a `Contact` row only
existed once `OrderPlaced` fired, so a customer who registered but never
ordered had none yet. This is the one place `support` reaches into
`crm`, sanctioned as `'support -> crm'` in `KNOWN_MODULE_COUPLINGS` on the
identical same-transaction reasoning `'purchasing -> parties'` already
establishes: a ticket must never exist without its `Contact`, so the two
writes commit together or not at all.

The staff side is deliberately doc 64's own, unchanged, not a parallel
system:

1. **The same three permissions.** `support.tickets.handle`/`.view_all`/
   `.reassign`, seeded to the identical roles doc 64 already grants them
   to. A customer-raised ticket and a staff-raised one compete for the
   same handler pool, so a second permission set would only let one
   handler forget to hold both.
2. **`SupportHandlersService`, extracted rather than duplicated.**
   `SupportTicketsService.notifyHandlers()`/`holdsPermission()` (the
   `roleAssignments: { some: { role: { grants: { some: { permission: {
   key } } } } } }` query ADR-064 already traces to `credit-terms
   .service.ts`) moved into a new, shared, independently tested service
   both `SupportTicketsService` and `CustomerSupportService` now inject —
   "does this user currently hold this permission key" stays one
   primitive across both ticket kinds, not two copies that could drift.
3. **The same action-hub source, extended, not a second SLA mechanism.**
   `SupportTicketActionSource.fetchFor()` now also queries
   `CustomerSupportTicket`, tagging its items `kind: 'CUSTOMER_SUPPORT_TICKET'`
   against doc 64's own `'SUPPORT_TICKET'`, reusing the same
   `SupportTicketSlaMinutes` staleness window — the document's own WO-148.4
   asks for "likely one shared queue screen, filterable by ticket type,"
   and one registered source emitting two `kind` values is that, without a
   second SLA setting nobody would keep in step with the first.

Where doc 64 built one screen serving both requester and handler (its own
visibility scoping made a separate queue unnecessary), doc 148 could not:
a customer never holds a staff permission, so `getForCustomer()`,
`raise()` and `replyAsCustomer()` are a genuinely separate trust boundary
from `getForStaff()`, `assign()`, `transition()` and `replyAsStaff()` —
reflected as two controllers (`CustomerSupportController` on bare
`support/tickets`, matching `ReturnsController`'s own customer-facing
convention, and `CustomerSupportStaffController` on
`admin/support/customer-tickets`) and, on the storefront, three screens
(list, raise, detail-with-reply) under `account/support`, gated by a new
`@CustomerScope('support:read'|'support:write')` pair in
`CUSTOMER_SCOPE_CATALOG` so a personal API key can reach it exactly as
every other self-service resource does. On the admin side, a *second* nav
entry and a *second* pair of screens (`admin/support/customer-tickets`
list + detail) rather than a filter tab bolted onto doc 64's own
`/admin/support/tickets` — `CustomerSupportTicket` is a distinct Prisma
model with a distinct requester, so it is a distinct object with its own
queue, not a second view over the same one; the two screens are siblings
under the same permissions, not one screen wearing a toggle.

Two decisions beyond the document's own literal sketch:

1. **`reply()` is two methods, not one.** The document sketches a single
   reply path; `replyAsCustomer()` and `replyAsStaff()` split it because
   the two sides of the trust boundary need genuinely different
   visibility checks — Contact ownership on one side, staff
   assignment/`view_all` on the other — and because a customer's own reply
   while `AWAITING_CUSTOMER` auto-resumes the SLA clock (`IN_PROGRESS`),
   a transition only the customer side ever triggers. One method branching
   on `authorType` would blur exactly the distinction the document's own
   actor-model thesis insists on keeping sharp.
2. **The staff list batches its `Contact` name lookup, since the document
   names no shape for the queue row at all.** `listForStaff()` returning
   the bare `CustomerSupportTicket` (a `contactId`, not a name) would put
   an unresolved id in front of a triaging handler — the identical defect
   ADR-061 and ADR-064 already named for a bundle's component variant and
   a ticket's `assignedToUserId`. `listForStaff()` now batch-resolves every
   row's `Contact.name` in one extra query rather than one per row, the
   same N+1 discipline `getForStaff()`'s own `enrich()` already applies to
   a single ticket's messages.

`AWAITING_CUSTOMER` is the one state doc 64's internal ticket never
needed — a customer-support-specific holding state for "we are waiting on
the customer's own reply, not staff's" — and it is deliberately excluded
from the action-hub source's staleness detection in the `.handle` branch
(that clock belongs to the customer, not the assignee) while still
counted in the `.reassign` branch's orphan-detection query, matching the
document's own reasoning about whose inaction each query is meant to
surface.

### Reasoning

The document's own five lenses (`CLAUDE.md`'s "Feature scope") are answered
directly by the shape above, not worked around: the actor is a `Contact`
with a real `PERMISSION_CATALOG`-free authentication path (the storefront
customer session plus `@CustomerScope`, never `PermissionsGuard`); the
authority is doc 64's own three permissions, reused rather than
reinvented, so "whose rows, and which columns" stays answered by a query
this codebase already trusts; the act is a REQUEST the system may refuse
(a ticket, not a financial record) with its own forward-only state
machine plus the one named backward move; the money lens is `n/a` — this
feature writes no `JournalLine`; and the afterlife lens is a `CLOSED`
terminal state with no further undo, matching doc 64's own. The one place
this document's shape diverges from doc 64's is the trust boundary itself,
and that divergence — two controllers, two sets of storefront/admin
screens, one shared service layer and one shared action-hub source
underneath both — is the correct cost of getting `CLAUDE.md`'s "The actor
with three tables" lens right rather than papering over it with a second
`User`-shaped principal that would have been wrong the day a
never-yet-ordered customer tried to raise a ticket.

### Consequences

- A customer who has never placed an order can still raise a ticket —
  `raise()`'s own `upsertContact()` call guarantees a `Contact` exists
  before the ticket does, closing the gap doc 64's own model would have
  left open.
- A handler who loses `support.tickets.handle` never leaves a customer
  ticket silently orphaned any more than an internal one does — the same
  action-hub orphan-detection query now covers both `kind`s from one
  registered source.
- `docs/implementation/tasks-notifications-support/148-external-customer-support-portal.md`
  carries its own Status blockquote naming every real file and both
  decisions above, the same discipline ADR-064 applies to doc 64's own
  build.
- 51 tests across four new/changed spec files cover the document's own
  Acceptance criteria: a customer reaching only their own tickets (404,
  never 403, for someone else's), a staff reply notifying the customer
  through their own resolved contact channel, and `AWAITING_CUSTOMER` vs.
  `IN_PROGRESS` staying distinguishable through both the customer-reply
  auto-resume and the action-hub staleness split.
- `pnpm index` must be regenerated (new module surface, new routes, new
  scope keys, new screens) and `docs/implementation/README.md`'s own entry
  updated to state exactly what shipped — the fifth and final document in
  this batch's own "build all five" instruction.

### Status
**Accepted.**
