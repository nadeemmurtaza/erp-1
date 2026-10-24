# 20h. Hardening record: Customer service, cases and the SLA clock

Adversarial review of [20-service-cases-sla.md](./20-service-cases-sla.md) by the `harden:20:service-cases-sla` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### The complaint that isn't a record  — strong

**Question:** Name the model that gives a customer complaint a status, owner, due-by timestamp and FK to the Order/StockTransfer it concerns.

**Verified against:** Interaction/InteractionKind/FollowUpTask in crm.prisma; WRITE_OFF movement in transfers.service.ts receive() — all verified verbatim, no corrections needed.

### Compensation authority is a boolean, not a ceiling  — strong

**Question:** Name the field recording the authorized amount, the approver-ceiling check, and the resolution document (CreditNote/replacement Order/reversed Payment).

**Verified against:** payments.approve boolean permission; PaymentsService.refund() partial-amount support; PostingRulesSubscriber.onPaymentRefunded full-reversal-regardless-of-amount bug — rewritten after correcting a factual error about partial refunds.

### One case ID, or five unrelated tables  — solid

**Question:** Name the identifier that lets a reviewer pull every fact on one dispute across Interaction/InboundEmail/Payment/StockTransfer/AuditLog in one query.

**Verified against:** AuditLog schema and index verified; audit.record() adoption count corrected from '24 of 26 modules' to '10 of 25 module directories' (gap is larger than claimed).

## Killed (0)

_Nothing was killed._


## Citations corrected (2)

- Lens 2: claimed no partial-refund path exists; actual is PaymentsService.refund() (payments.service.ts:288) already accepts a partial `amount` and the controller labels it 'full or partial' — the real defect is that PostingRulesSubscriber.onPaymentRefunded (posting-rules.subscriber.ts:140-155) ignores payload.amount and always reverses the full ledger entries, so a partial refund overstates the GL reversal.
- Lens 3: claimed AuditService.record() is called from '24 of 26 modules'; actual count via grep is 10 of 25 top-level module directories under apps/api/src/modules (catalog, crm, identity-verification, inventory, measurements, orders, payments, pos, stitching, users) — the audit coverage gap is substantially larger than the original text stated.
