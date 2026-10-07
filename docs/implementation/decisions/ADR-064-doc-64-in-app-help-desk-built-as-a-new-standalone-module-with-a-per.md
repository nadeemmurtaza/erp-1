# ADR-064 — Doc 64 (in-app help desk): built as a new standalone module, with a per-instance transition-authority rule and a name-resolution step the document's own sketch does not specify

[← Decision log](../DECISIONS.md)


### Context

Doc 64 named a real, narrow gap: nothing in this repository lets a staff
member raise a support request from inside the product and have it
tracked, assigned and resolved. `AuditService` records what happened and
`NotificationsService` delivers a message, but neither is a ticket with a
lifecycle. The document scopes this deliberately narrow — internal only,
reusing every existing primitive (permissions, `AuditService`,
`NotificationsService`) rather than a second identity or messaging system,
and explicitly out of scope for the external, customer-facing case doc
148 covers separately with its own actor model.

### Decision — built: `SupportTicket`/`TicketMessage`, `SupportTicketsService`, an action-hub source, four permissions, three screens

`SupportTicket`/`TicketMessage`/`TicketStatus`/`TicketPriority` land in a
new `support.prisma`, in a new, fully standalone `apps/api/src/modules
/support/` module — the document's own "The absent collaborator" lens
already calls for this: nothing depends on it, and it depends on nothing.
`SupportTicketsService` implements `create()`/`reply()`/`assign()`/
`transition()`/`list()`/`get()`; `SupportTicketActionSource` registers
into doc 44's own action-hub registry rather than a bespoke SLA-breach
mechanism, gated by a new `SupportTicketSlaMinutes` setting (240 minutes,
one default window — per-priority tuning is the document's own named,
deferred extension). Four permissions
(`support.tickets.raise`/`.handle`/`.view_all`/`.reassign`) are seeded
exactly as the document's own authority lens describes: `raise` broadly to
every internal role (TAILOR/STAFF/ADMIN — never CUSTOMER, since this is
the internal desk), `handle`/`view_all` to STAFF/ADMIN, `reassign`
ADMIN-only, mirroring `notify.broadcast`'s own admin-only precedent for
the same shape of "the broad override that may act on anything." Three
admin screens (list, raise, detail-with-reply-thread) serve both a
requester's own view and a handler's queue from one list — the API's own
visibility scoping makes a separate "queue" screen unnecessary, the
document's own WO-64.5 notwithstanding.

Two decisions beyond the document's own literal sketch:

1. **Per-instance authority inside `transition()`, since the document
   names no separate permission for it.** WO-64.3 lists exactly four
   permissions, none named "who may change a ticket's status." The
   document's own prose gives the answer piecemeal — "the requester
   reopens because the issue recurred" for the one backward move,
   `support.tickets.reassign` for "who may reassign any ticket" — so
   `transition()` checks, per call: the current assignee, or a
   `support.tickets.reassign` holder (the same broad override), or, only
   for the RESOLVED → IN_PROGRESS reopen, the original requester. This is
   the same identity-check-inside-the-service shape doc 24's
   `NotifyService.decide()` already established for an authority
   `@RequirePermission` alone cannot express.
2. **A name-resolution step `get()` performs that the sketch does not
   mention.** `raisedByUserId`/`assignedToUserId`/`TicketMessage.authorId`
   are bare scalars with no Prisma relation (the same "erasure the ledger
   cannot obey" shape `MeetingInvitation.userId` already uses), so serving
   them raw to an admin screen would put an unresolved id in front of a
   reader — exactly what ADR-061 already named as a defect for a bundle's
   component variant id. `SupportTicketsService.get()` batch-resolves
   every id on a ticket to a display name in one extra query, split from
   the shared `findVisible()` helper `reply()` also uses, so a reply's own
   visibility check never pays for a lookup it never uses.

`notifyHandlers()` resolves "whoever currently holds `support.tickets
.handle`" via the identical `roleAssignments: { some: { role: { grants: {
some: { permission: { key } } } } } }` query `credit-terms.service.ts`'s
own `notifyHoldApplied()` already established — reused, not reinvented,
matching the document's own "audience is a capability, not an address"
lens with existing precedent rather than a new mechanism. The same query
shape (as a boolean check, and as a batch check against a candidate set)
resolves `assign()`'s own assignee-eligibility rule and the action-hub
source's "assignee lost the permission" detection — one primitive, three
call sites, never three.

### Reasoning

Both decisions are the same pattern this session keeps finding: a
document's sketch specifies intent narrowly (four permissions, a plain
`SupportTicket`/`TicketMessage` shape) while its own prose and its own
scope lenses state requirements the sketch's code never renders — an
authority rule in words only, a raw scalar the "Whose rows, and which
columns" lens already implies must resolve to *something* a reader can
read. Treating the prose and the lenses as normative, and the code block
as illustrative, is what this whole batch of documents keeps requiring,
and doc 64 is no exception. The `notifyHandlers()`/`assign()`/action-hub
overlap is worth naming on its own: three call sites needing "does this
user currently hold this permission key" is exactly the situation that
tempts a bespoke abstraction; reusing `credit-terms.service.ts`'s own
already-established, deliberately simple (role-grants-only, no
`OrgUnitGrant`/`UserPermission` override resolution) query is the correct
call — `CLAUDE.md`'s own "can the existing system already solve this?"
answered yes, three times, without inventing a fourth shape.

### Consequences

- A staff member with no elevated access can raise a ticket and know it
  reached someone; a handler who loses `support.tickets.handle` (role
  change, deactivation) never leaves an open ticket silently orphaned on
  them — it surfaces to a `support.tickets.reassign` holder through doc
  44's own action hub, proven by a spec simulating exactly that
  deactivation.
- `docs/implementation/tasks-notifications-support/64-help-desk-support-ticketing.md`
  carries its own Status blockquote naming every real file and both
  decisions above, the same discipline this session applies to every
  other document's own build.
- 26 new spec files' worth of tests cover the document's own Acceptance
  criteria directly: visibility (404, never 403, for an out-of-scope
  ticket), the forward-only state machine with its one allowed backward
  move, and per-instance transition authority.
- `pnpm index` must be regenerated (new module, new routes, new
  permissions, new screens) and `docs/implementation/README.md`'s own
  entry updated to state exactly what shipped.

### Status
**Accepted.**
