# 20g generate service cases sla

Output of the `gen:20:service-cases-sla` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Customer service, cases and the SLA clock

## File

docs/erp-lenses/service-cases-sla/20-service-cases-sla.md

## Lenses

### The complaint that isn't a record

**Question:** Name the model that gives a customer complaint a status, an owner, a due-by timestamp and a foreign key to the specific Order or StockTransfer it concerns — and say what happens today when Interaction.kind = COMPLAINT (crm.prisma) is used instead.

**Grounding:** Interaction (crm.prisma:116), InteractionKind.COMPLAINT (crm.prisma:106-114), FollowUpTask (crm.prisma:187), transfers.service.ts receive() WRITE_OFF path

### Compensation authority is a boolean, not a ceiling

**Question:** For a case resolved by refund, replacement or goodwill credit, name the field that records the authorized amount, the approving rank's ceiling it was checked against, and the document the resolution produced.

**Grounding:** payments.approve (packages/shared/src/permissions.ts), Payment.refundAmount/refundedAt (payments.prisma:36-37), payment.refunded full-reversal-only rule, absence of CreditNote/DebitNote model

### One case ID, or five unrelated tables

**Question:** Given a single customer dispute, name the one identifier that lets a reviewer pull every fact touching it — Interaction, InboundEmail, Payment, Order/StockTransfer, and AuditLog rows — in one query.

**Grounding:** Interaction/InboundEmail (crm.prisma), Payment (payments.prisma), StockTransfer (transfers.prisma), AuditLog (core.prisma:220), AuditService.record() opt-in at 24 of 26 modules

## Absences

- No ServiceCase/Complaint/Ticket/Dispute model anywhere in apps/api/prisma/schema
- No SLA-policy model and no dueAt/slaDueAt field on anything
- No escalation ladder or rank to escalate a case up to
- No CreditNote/DebitNote or replacement-order-from-case model
- No case identifier threaded through Interaction, InboundEmail, Payment, StockTransfer or AuditLog

