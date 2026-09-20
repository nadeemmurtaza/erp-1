# 20. Customer service, cases and the SLA clock

At shop scale a complaint is a phone call somebody remembers to act on. At
corporate scale it is a record with a clock, an owner and a paper trail,
tied to the order or transfer it is about, that a regulator, an ombudsman
or a court can be handed. The codebase today has a `COMPLAINT` tag on a
free-text `Interaction` row and nothing else — no status, no due date, no
link to the order, no compensation ceiling, no case id anything else can
point at. These lenses force that gap into the open before a feature is
built on top of it.

## Lens: The complaint that isn't a record

**Question:** Name the model that gives a customer complaint a status, an
owner, a due-by timestamp and a foreign key to the specific Order or
StockTransfer it concerns — and say what happens today when
`Interaction.kind = COMPLAINT` (`crm.prisma`) is used instead.

**Why:** `Interaction` (`crm.prisma:116`) is `{contactId, leadId, kind,
body: String, actorId, occurredAt}` — `COMPLAINT` is one value of
`InteractionKind` (`crm.prisma:106-114`), with no status, no `dueAt`, no
`orderId`, no `transferId`. `FollowUpTask` (`crm.prisma:187`) does carry
`assigneeId`/`dueAt`/`isDone`, but it links only to `contactId`/`leadId`,
never to the Order or StockTransfer the complaint is about, and has no
severity or SLA policy. A dispute over a transfer shortfall — posted as
`WRITE_OFF` inside `receive()` in `transfers.service.ts` — produces a
stock movement, never a case a customer or branch can track.

**Worked example:** Narrow slice: log the complaint as an
`Interaction{kind: COMPLAINT, body}` against the `Contact`, done. Complete
capability: a `ServiceCase` row with `contactId`, an optional `orderId` or
`transferId`, `status` (OPEN/ASSIGNED/ESCALATED/RESOLVED/CLOSED),
`severity`, `dueAt` computed from an SLA policy, `ownerId`, and a recorded
resolution — so "who is this about, on what order or transfer, and when
is it due" is one query, not a read of free-text `Interaction` bodies.

**Done test:** `grep -n "model " apps/api/prisma/schema/*.prisma` today
returns no model with both a status enum and a `dueAt`/`slaDueAt` field
plus an `orderId` or `transferId` column; the PR must add one and the
grep must find it.

**Breaks without:** Complaints stay unsearchable free text with no due
date; a transfer-shortfall dispute has no linked case at all, so "what did
you do about complaint X and by when" has no query, only a pile of chat
logs and a stock movement tagged `WRITE_OFF`.

## Lens: Compensation authority is a boolean, not a ceiling

**Question:** For a case resolved by refund, replacement or goodwill
credit, name the field that records the authorized amount, the approving
rank's ceiling it was checked against, and the document — a credit note,
a replacement order, or a reversed `Payment` — the resolution produced.

**Why:** `payments.approve` (`packages/shared/src/permissions.ts`) is a
flat boolean capability with no amount ceiling. `Payment.refundAmount` /
`refundedAt` (`payments.prisma:36-37`) record that a refund happened but
carry no reason, no case link and no approver-vs-limit check;
`payment.refunded` posts `reverseEntry()` as a full reversal only — no
partial-refund path, and no `CreditNote`/`DebitNote` model exists anywhere
in the schema. This differs from lens 04's threshold question, which asks
what amount band a document type needs approved: this one asks what the
case-resolution artifact itself must contain to trace back to the
complaint that caused it.

**Worked example:** Narrow slice: an agent holding `payments.approve`
clicks refund; `Payment.refundedAt` is set. Complete capability: the case
records the offer type, the amount, the approver's rank compared against
a ceiling for that rank, and a `CreditNote` or replacement `Order` created
from the case — not a `Payment` field flipped with nothing pointing back
at the complaint.

**Done test:** The PR names the column holding the authorized amount and
the approver-ceiling comparison; `grep -rn "refundAmount"
apps/api/src/modules/payments` today shows it is only ever set, never
compared against a per-rank limit.

**Breaks without:** An agent with a blanket `payments.approve` grant can
authorize any refund at any branch with no ceiling and no second
signature, and the compensation leaves no document a finance or legal
reviewer can trace back to the case that caused it.

## Lens: One case ID, or five unrelated tables

**Question:** Given a single customer dispute, name the one identifier
that lets a reviewer pull every fact touching it — the `Interaction`, the
`InboundEmail` thread, the refunded `Payment`, the `Order` or
`StockTransfer` it concerns, and the `AuditLog` rows — in one query.

**Why:** `Interaction`, `InboundEmail` (`crm.prisma`), `Payment`
(`payments.prisma`), `StockTransfer` (`transfers.prisma`) and `AuditLog`
(`core.prisma:220`, indexed on `[entity, entityId]`) share no common case
identifier. Nothing writes an `entity: 'ServiceCase'` row today because no
such entity exists, and `AuditService.record()` is called by hand from
only 24 of 26 modules — so even the audit half of the trail has gaps a
subpoena would find. This is a linkage gap, not a repeat of lens 05's
DB-immutability question.

**Worked example:** Narrow slice: a support-ticketing feature that stores
its own case list, linked only to `Contact`. Complete capability: a case
carries a stable id referenced by every touchpoint — `AuditLog.entityId`,
the refunded `Payment`, the reopened `Order`, the escalation
`Interaction` — so the whole timeline is one query away.

**Done test:** The PR includes a query, index or FK that, given one case
id, returns matching rows from at least `Interaction`/`InboundEmail`,
`Payment` and `AuditLog` without a free-text join; it names the columns
added.

**Breaks without:** A regulator, ombudsman or court asking for the full
record of one complaint gets an analyst manually cross-referencing
timestamps across unrelated tables, and any unaudited call site along the
way is invisible until it is subpoenaed.

## Not modelled yet

- No `ServiceCase`/`Complaint`/`Ticket`/`Dispute` model anywhere in
  `apps/api/prisma/schema` — a complaint is one `Interaction` row with a
  free-text body and no status or clock.
- No SLA-policy model and no `dueAt`/`slaDueAt` field on anything —
  nothing computes when a case is late.
- No escalation ladder or rank to escalate a case up to (the same absence
  domain 02 names for roles/ranks generally, inherited here as "no one to
  escalate to").
- No `CreditNote`/`DebitNote` or replacement-order-from-case model; a
  compensation decision leaves only `Payment.refundAmount` with no reason
  or ceiling check.
- No case identifier threaded through `Interaction`, `InboundEmail`,
  `Payment`, `StockTransfer` or `AuditLog` — the trail a regulator would
  read must be assembled by hand today.
