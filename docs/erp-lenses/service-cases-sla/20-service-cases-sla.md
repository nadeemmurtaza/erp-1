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

**Why:** `payments.approve` (`packages/shared/src/permissions.ts:83`) is a
flat boolean capability with no amount ceiling. `PaymentsService.refund()`
(`payments.service.ts:288-334`) does take an `amount` argument — the
controller doc comment even says "full or partial" — and sets
`Payment.refundAmount`/`refundedAt` (`payments.prisma:36-37`); but that
amount carries no reason code, no case link and no approver-vs-limit
check, and the ledger side does not honour it:
`PostingRulesSubscriber.onPaymentRefunded` (`posting-rules.subscriber.ts:140-155`)
calls `AccountingService.reverseEntry()` on the full original receipt and
sale entries regardless of `payload.amount`, so a $200 partial refund
still reverses a $1,000 sale in the ledger. No `CreditNote`/`DebitNote`
model exists anywhere in the schema. This differs from lens 04's threshold
question, which asks what amount band a document type needs approved:
this one asks what the case-resolution artifact itself must contain to
trace back to the complaint that caused it, and what stops a partial
refund from posting as a full reversal.

**Worked example:** Narrow slice: an agent holding `payments.approve`
calls `refund(actorId, paymentId, 20000)` on a PKR 100,000 order;
`Payment.refundAmount` is set to 20000 but `onPaymentRefunded` reverses
the entire 100,000 sale and receipt entries. Complete capability: the case
records the offer type, the amount, the approver's rank compared against
a ceiling for that rank, a `CreditNote` (or replacement `Order`) created
from the case, and a ledger reversal scaled to the refunded amount — not
a full reversal triggered by a partial `Payment` field.

**Done test:** The PR names the column holding the authorized amount and
the approver-ceiling comparison; `grep -n "reverseEntry" apps/api/src/modules/money/accounting/posting-rules.subscriber.ts`
today shows `onPaymentRefunded` never reads `payload.amount` before
reversing — the PR must change that or add the partial-amount ledger
entry it is missing.

**Breaks without:** An agent with a blanket `payments.approve` grant can
authorize any refund at any branch with no ceiling and no second
signature, and the compensation leaves no document a finance or legal
reviewer can trace back to the case that caused it.

## Lens: One case ID, or five unrelated tables

**Question:** Given a single customer dispute, name the one identifier
that lets a reviewer pull every fact touching it — the `Interaction`, the
`InboundEmail` thread, the refunded `Payment`, the `Order` or
`StockTransfer` it concerns, and the `AuditLog` rows — in one query.

**Why:** `Interaction`, `InboundEmail` (`crm.prisma:142`), `Payment`
(`payments.prisma`), `StockTransfer` (`transfers.prisma`) and `AuditLog`
(`core.prisma:220`, indexed on `[entity, entityId]`) share no common case
identifier. Nothing writes an `entity: 'ServiceCase'` row today because no
such entity exists, and `audit.record()` is only called from 10 of the 25
module directories under `apps/api/src/modules` (`catalog`, `crm`,
`identity-verification`, `inventory`, `measurements`, `orders`,
`payments`, `pos`, `stitching`, `users` — confirmed by grep; `accounting`,
`cart`, `transfers` and eleven others never call it), so even the audit
half of the trail has gaps a subpoena would find. This is a linkage gap,
not a repeat of lens 05's DB-immutability question.

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

## Hardening record

**Kept (3):**

- *The complaint that isn't a record* — verified against `crm.prisma`
  (`Interaction`, `InteractionKind`, `FollowUpTask`) and
  `transfers.service.ts:225-238` (`receive()`'s `WRITE_OFF` movement). No
  changes needed; citations were accurate as written.
- *Compensation authority is a boolean, not a ceiling* — sharpened. The
  original claimed "no partial-refund path"; the actual gap is sharper and
  worse: `PaymentsService.refund()` already accepts a partial `amount`,
  but `PostingRulesSubscriber.onPaymentRefunded` reverses the full ledger
  entries regardless, so a partial refund silently overstates the reversal
  in the general ledger. Rewritten to name that mismatch precisely.
- *One case ID, or five unrelated tables* — kept, with the audit-coverage
  citation corrected (see below). The underlying claim — no shared case
  identifier across `Interaction`/`InboundEmail`/`Payment`/`AuditLog` — was
  verified true by schema inspection.

**Killed:** none. All three lenses name a real, currently-missing model or
a real code path that behaves differently than a narrow build would
assume, and each demands an artifact (a model name, a column, a scaled
ledger entry) rather than a yes/no.

**Corrections:**

- Lens 2 claimed `payment.refunded` "posts `reverseEntry()` as a full
  reversal only — no partial-refund path." Actual: `PaymentsService.refund()`
  (`payments.service.ts:288`) takes an `amount` parameter and the
  controller documents it as "full or partial" (`payments.controller.ts:108`);
  the missing piece is that `onPaymentRefunded`
  (`posting-rules.subscriber.ts:140-155`) never reads `payload.amount` and
  always reverses the full original entries — corrected to describe the
  actual defect (partial payment refund, full ledger reversal) rather than
  a nonexistent missing feature.
- Lens 3 claimed "`AuditService.record()` is called by hand from only 24
  of 26 modules." Actual: `apps/api/src/modules` has 25 top-level module
  directories, and only 10 of them (`catalog`, `crm`,
  `identity-verification`, `inventory`, `measurements`, `orders`,
  `payments`, `pos`, `stitching`, `users`) contain any call to
  `audit.record()` or import `AuditService` outside test files — corrected
  the count, which makes the coverage gap larger than originally claimed,
  not smaller.
