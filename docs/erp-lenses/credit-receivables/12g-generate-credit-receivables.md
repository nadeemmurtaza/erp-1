# 12g generate credit receivables

Output of the `gen:12:credit-receivables` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Credit, receivables and the customer who owes

## File

docs/erp-lenses/credit-receivables/12-credit-receivables.md

## Lenses

### The receipt that doesn't find its bill

**Question:** Name the field that ties a specific payment to the specific receivable it settles, and show the query that reports it as settled. If no such field exists, state what a payment against one of several open orders for the same customer resolves to today.

**Grounding:** posting-rules.subscriber.ts:134-137 (onPaymentSucceeded's Cr AR line sets no contactId), gl-reports.service.ts:233 (agedReceivables filters contactId not null), aging.ts header (admits FIFO approximation, no per-payment-to-invoice matching), payments.prisma:19 (Payment.orderId required bare scalar)

### The status nobody checks

**Question:** Name the code path that reads a customer's credit-hold state before an order is placed, and which value blocks the sale. If none exists, state the permission key and scope a 'stop supplying this customer' action would require, and who is allowed to reverse it.

**Grounding:** crm.prisma:8-14 (ContactStatus.BLOCKED exists), crm.dto.ts:16 (only other reference to BLOCKED, confirmed via repo-wide grep), orders.service.ts place()/placeFromPos() (never read Contact.status), absence of creditLimit anywhere in schema, PERMISSION_CATALOG (no stop-supply key, payments.approve is the only comparable boolean capability)

### One customer, two ledgers

**Question:** For a business buyer who both places storefront/POS orders and receives trading-partner invoices, name the single field or query that returns everything they owe across both. State whether Contact and TradingPartner ever resolve to the same row.

**Grounding:** crm.prisma (Contact backs Order.contactId and AR aging's counterparty key), trading-partners.prisma (TradingPartner has no contactId, confirmed via grep), invoicing.prisma:1-13,25,58 (Invoice/Quote carry only tradingPartnerId; file header states this MVP posts nothing to the ledger and defers full AR aging across every customer to a larger tranche)

## Absences

- No creditLimit, credit-hold, or held-order-at-limit concept anywhere in apps/api/prisma/schema/*.prisma
- No payment-terms field on a customer or Invoice (paymentTerms exists only on the supplier side, purchasing.prisma:29)
- No CreditNote or DebitNote model (invoicing.prisma's own header names CreditNote as deferred R18 scope)
- No customer statement and no dunning schedule/sequence
- No per-payment-to-invoice allocation (aging.ts explicitly approximates with FIFO because this does not exist)
- No enforcement of ContactStatus.BLOCKED at order placement, and no distinct stop-supply permission key in PERMISSION_CATALOG
- No shared key between Contact (storefront/POS identity) and TradingPartner (B2B invoicing identity)

