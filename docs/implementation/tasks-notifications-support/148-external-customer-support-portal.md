# 148 — Customer-facing support: doc 64's own named, unbuilt gap

> **Status: built (2026-09-27), WO-148.1–148.4, DECISIONS.md ADR-065.**
> `CustomerSupportTicket`/`CustomerSupportMessage`/`CustomerTicketStatus`/
> `SupportMessageAuthorType` (in the same `support.prisma` doc 64 owns),
> `CustomerSupportService`
> (`raise()`/`replyAsCustomer()`/`replyAsStaff()`/`assign()`/`transition()`/
> `listForStaff()`/`listMine()`/`getForStaff()`/`getForCustomer()`), a
> shared `SupportHandlersService` extracted from doc 64's own
> `SupportTicketsService` so "who holds `support.tickets.handle`" is one
> primitive for both ticket kinds, and `SupportTicketActionSource`
> extended (not duplicated) to also surface `CustomerSupportTicket` items
> under a `CUSTOMER_SUPPORT_TICKET` kind, are all real, at
> `apps/api/src/modules/customers/support/`. Keyed on `contactId`, never
> `raisedByUserId` — this document's own central actor-model thesis,
> restated: `raise()` finds-or-creates the caller's own `Contact` via
> `CrmService.upsertContact()` inside the same transaction as the ticket
> write (the `'support -> crm'` entry in `KNOWN_MODULE_COUPLINGS`), which
> closes this document's own "Contact creation timing gap" — a customer
> who has never ordered still gets a `Contact` the moment they raise a
> ticket.
>
> Three storefront screens (list, raise, detail-with-reply-and-reopen) at
> `apps/web/src/app/(storefront)/[locale]/(dashboard)/account/support/`,
> gated by a new `@CustomerScope('support:read'|'support:write')` pair so
> a personal API key can reach them exactly like every other self-service
> resource; two admin screens (list, detail-with-reply/assign/transition)
> at `apps/web/src/app/(admin)/admin/(app)/support/customer-tickets/`, a
> sibling to doc 64's own `support/tickets/` screens rather than a filter
> tab bolted onto them — `CustomerSupportTicket` is a distinct model with a
> distinct requester, so it is a distinct object with its own queue. Both
> admin screens reuse doc 64's own three handler permissions
> (`support.tickets.handle`/`.view_all`/`.reassign`) unchanged, per this
> document's own WO-148.3.
>
> Two decisions beyond this document's own literal sketch, both required
> to make its own stated requirements real — see `DECISIONS.md` ADR-065
> for the full reasoning: `reply()` is two methods
> (`replyAsCustomer()`/`replyAsStaff()`), not the one this document
> sketches, since the two sides of the trust boundary need genuinely
> different visibility checks and only a customer's own reply auto-resumes
> the SLA clock out of `AWAITING_CUSTOMER`; and `listForStaff()`
> batch-resolves every row's `Contact.name` in one extra query, since a
> bare `contactId` in a triage queue is the same unresolved-scalar defect
> ADR-061 and ADR-064 already named elsewhere. The built model also omits
> this document's own sketched `organizationId` column — this deployment
> has no row-level tenant column anywhere (ADR-040/044/046/049/060/062),
> the deployment itself is the tenant boundary, and `support.prisma`'s own
> header comment names the precedent.

Doc 64 built the internal staff help desk and named its own boundary
explicitly: "Customer-facing (external) support ticketing — this document
scopes the *internal* help desk... an external customer-support portal is
a distinct, separately-scoped capability with its own actor model
(`Contact`/`Party`, not `User`) if it is ever requested." This document is
that separately-scoped capability. It deliberately does not duplicate doc
64's own mechanism wholesale — the actor model, visibility rule, and
audience are genuinely different, so this is its own model, reusing doc
64's shape where it fits and diverging where the trust boundary requires.

## 1. A customer ticket, keyed to a `Contact`/`Party`, never a `User`

```prisma
model CustomerSupportTicket {
  id             String   @id @default(cuid())
  organizationId String
  contactId      String   // Party/Contact (doc's own "three tables" actor model), never a User
  orderId        String?  // optional — many tickets are order-specific ("where is my parcel")
  subject        String
  category       String   // free text/data-driven, same reasoning as doc 64's own TicketCategory
  status         CustomerTicketStatus @default(OPEN)
  priority       TicketPriority       // reuse doc 64's own enum — identical shape, no reason to diverge
  assignedToUserId String?            // a STAFF User handles it — the one place this crosses the actor boundary
  createdAt      DateTime @default(now())
  resolvedAt     DateTime?

  messages CustomerSupportMessage[]

  @@index([organizationId, status, assignedToUserId])
  @@index([contactId])
}

enum CustomerTicketStatus { OPEN  AWAITING_CUSTOMER  IN_PROGRESS  RESOLVED  CLOSED }

/// authorId is polymorphic by necessity: a customer's own message and a
/// staff reply share one thread, but come from opposite sides of the
/// trust boundary — authorType makes that explicit rather than inferring
/// it from which id column is non-null.
model CustomerSupportMessage {
  id          String   @id @default(cuid())
  ticketId    String
  authorType  SupportMessageAuthorType
  contactId   String?  // set when authorType = CUSTOMER
  userId      String?  // set when authorType = STAFF
  body        String
  createdAt   DateTime @default(now())

  ticket CustomerSupportTicket @relation(fields: [ticketId], references: [id])
}

enum SupportMessageAuthorType { CUSTOMER  STAFF }
```

`AWAITING_CUSTOMER` is the one status doc 64's own internal ticket never
needed — an internal ticket has no "waiting on the requester to reply"
holding state distinct from `IN_PROGRESS`, since the requester and the
handler are both staff on the same side of the trust boundary; a customer
ticket genuinely needs to distinguish "we're working on it" from "we're
waiting to hear back from the customer," since the two drive very
different SLA clocks.

## 2. The trust boundary this document exists to get right

- **A customer authenticates as a `Contact`, never a `User`** — doc 64's
  own "three tables" answer restated for a real, external actor: this
  ticket system is reachable from the customer portal (doc 07) under
  whatever session/authentication the storefront's own customer accounts
  already use, never `PermissionsGuard`'s own staff-facing
  `PERMISSION_CATALOG`.
- **A customer sees only their own tickets** — `contactId`-scoped,
  checked against the authenticated customer session, never a broader
  organizational visibility rule; this is the opposite direction from
  doc 64's own internal visibility (a support handler with
  `support.tickets.view_all` sees many staff tickets; no customer-facing
  equivalent of that permission exists, or should — a customer never
  sees another customer's ticket under any role).
- **Staff assignment reuses doc 64's own `support.tickets.handle`**
  permission and its own doc-44 action-hub registration for unassigned/
  stale tickets — the *staff* side of this ticket genuinely is the same
  actor pool and the same "who's handling what" queue doc 64 already
  built; only the *requester* side is new.

## Scope lenses

**The actor with three tables** — restated as this document's own central
answer: the requester is `Contact`/`Party` (doc 20's own three-table
framework applied to a customer instead of an employee), never `User`;
the handler is `User`, identical to doc 64.
**The principal with no permission key** — n/a: a `Contact` authenticates
via the existing customer-portal session, not `PermissionsGuard`.
**The grant that ends itself** — n/a: a customer's own ability to see
their tickets ends when their portal session/account access ends, per
the customer portal's own existing session lifecycle, not a new grant
this document introduces.
**Whose rows, and which columns** — a `CustomerSupportTicket` is visible
to its own `contactId` (customer side) or to a `User` holding
`support.tickets.handle`/`.view_all` scoped to the ticket's
`organizationId` (staff side) — never visible to any other customer.
**The threshold nobody approves alone / The toxic pair** — n/a: raising
or replying to a support ticket commits no money or stock.
**Authority and blast radius** — reassigning any customer ticket (not
just one's own) requires `support.tickets.reassign`, identical to doc
64's own split.
**Audience is a capability, not an address** — a new customer ticket
notifies whoever holds `support.tickets.handle` scoped to the ticket's
`organizationId`, reusing doc 64's own audience resolution unchanged; a
staff reply notifies the customer via whatever channel their own contact
preferences already specify (email/SMS/WhatsApp, per doc 33/101's own
registered channels) — never a hardcoded address.
**Request or record** — raising a ticket is a REQUEST (refusable —
empty subject); the resulting thread is a RECORD, immutable per message,
identical to doc 64's own classification.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity / Dry run before live** — n/a: no money or stock fact.
**Three silhouettes** — Solo: a handful of customer inquiries, likely
answered by the owner directly. Chain: real customer-support volume
across branches, where `AWAITING_CUSTOMER`'s own SLA-clock distinction
first matters. Organization: cross-brand customer support at scale.
**The absent collaborator** — with the customer portal (doc 07) off,
customers have no surface to raise a ticket from; with `support`
(doc 64's own module) off, no ticketing exists on either side.
**The second copy of the write** — n/a beyond ordinary create/reply
idempotency; no physical event to deduplicate.
**The hundred-thousandth row** — indexed by `[organizationId, status,
assignedToUserId]` (staff queue) and `contactId` (customer's own list),
bounded pagination on both.
**The reversal document / The undo fan-out / The version stamp** — n/a:
a ticket's own status transitions are its record; no reversal concept
beyond reopening (`RESOLVED` → `IN_PROGRESS`), identical to doc 64.
**The erasure the ledger cannot obey** — `contactId`/message authorship
holds a customer's own data; on a customer's deletion request, follows
whatever erasure basis this repository's own customer-data policy already
states, retained as an organizational support record where that basis
allows, pseudonymised otherwise — identical reasoning to every other
"retain for audit, pseudonymise the identity" answer in this document set.
**The failure path** — a ticket stuck `OPEN` past a configurable SLA
window surfaces to doc 44's own action hub, reusing doc 64's own
registered source rather than a second SLA mechanism.

## Work orders

**WO-148.1 — schema**: `CustomerSupportTicket`, `CustomerSupportMessage`,
`CustomerTicketStatus`, `SupportMessageAuthorType`, forward-only
migration.
**WO-148.2 — `CustomerSupportService`**: `raise()`, `reply()` (both
`CUSTOMER` and `STAFF` author paths), `assign()`, `transition()` — reusing
doc 64's own `assign()`/`transition()` shape where the state machine is
identical.
**WO-148.3 — permissions**: reuse doc 64's own
`support.tickets.handle/.view_all/.reassign`; no new staff-side
permission needed, since the handler pool is identical.
**WO-148.4 — UI**: a "contact support" entry point on the customer
portal (doc 07), a customer-facing ticket list/thread view, and a staff
queue view distinguishing customer tickets from doc 64's own internal
ones (likely one shared queue screen, filterable by ticket type, rather
than two separate screens for one handling team).

## Acceptance

- A customer can view and reply only to their own tickets, proven by a
  spec attempting cross-customer access.
- A staff reply notifies the customer through their own configured
  contact channel, never a hardcoded address.
- `AWAITING_CUSTOMER` and `IN_PROGRESS` are distinguishable in the staff
  queue view, driving separate SLA expectations.

## Out of scope

A public knowledge base / self-service FAQ deflection layer before a
ticket is raised — a real, valuable, and genuinely separate content
capability (closer to doc 08's own CMS) that could sit in front of this
ticketing system later; not built here.
