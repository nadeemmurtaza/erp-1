# 12h. Hardening record: Credit, receivables and the customer who owes

Adversarial review of [12-credit-receivables.md](12-credit-receivables.md) by the `harden:12:credit-receivables` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### The receipt that doesn't find its bill  — strong

**Question:** Name the field that ties a specific payment to the specific receivable it settles, and show the query that reports it as settled.

**Verified against:** posting-rules.subscriber.ts:133-136 (no contactId set on AR credit line); gl-reports.service.ts:233 (agedReceivables filters contactId not null)

### The status nobody checks  — strong

**Question:** Name the code path that reads a customer's credit-hold state before an order is placed, and which value blocks the sale.

**Verified against:** crm.prisma:8-14 (ContactStatus.BLOCKED), crm.dto.ts:16 (CONTACT_STATUSES), orders.service.ts place()/placeFromPos() (no contact.status read, verified by grep), permissions.ts:45 PERMISSION_CATALOG (payments.approve exists, no stop-supply key)

### One customer, two ledgers  — solid

**Question:** Name the single field or query that returns everything a buyer owes across both Contact-keyed and TradingPartner-keyed exposure.

**Verified against:** trading-partners.prisma (no contactId field, confirmed by grep); invoicing.prisma:25,58 (tradingPartnerId bare scalar) and header lines 2-5 (AR aging across every customer deferred)

## Killed (0)

_Nothing was killed._


## Citations corrected (1)

- Claimed posting-rules.subscriber.ts:134-137 for the AR credit line missing contactId; actual location is lines 133-136 (the postEntry lines array starts at 133, the cited creditMinor line is 136).

## Not modelled in this repo today

- No creditLimit or credit-hold field in any .prisma schema (confirmed by grep)
- No payment-terms field on customer/Invoice; paymentTerms exists only on supplier side (purchasing.prisma:29)
- No CreditNote/DebitNote model
- No customer statement or dunning schedule
- No per-payment-to-invoice allocation (aging.ts uses FIFO approximation, confirmed in its header comment)
- No enforcement of ContactStatus.BLOCKED at order placement; no stop-supply permission key in PERMISSION_CATALOG
- No shared key between Contact and TradingPartner
