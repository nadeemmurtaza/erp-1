# 23g generate loyalty consent data rights

Output of the `gen:23:loyalty-consent-data-rights` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Loyalty, consent and the customer data

## File

docs/erp-lenses/loyalty-consent-data-rights/23-loyalty-consent-data-rights.md

## Lenses

### Consent is a matrix, not a switch

**Question:** For a new communication feature, name every channel (email, SMS, WhatsApp, push, in-app) and purpose (transactional, marketing, service, research) it will send through, and for each pair say which field records the customer's consent and what existing customers default to today.

**Grounding:** User.marketingEmailOptOut (apps/api/prisma/schema/core.prisma:35, single boolean, email-only); Contact (apps/api/prisma/schema/crm.prisma:16-45, source includes whatsapp/instagram but zero consent columns); DeviceToken (core.prisma:388, push tokens, no consent field); apps/api/src/modules/merchandising/marketing/marketing-automation.cron.ts as the only reader of the boolean

### The liability with no account

**Question:** When a loyalty or points feature is built, name the ledger account it posts to on accrual and on redemption or expiry, and which of the seven existing posting rules in posting-rules.subscriber.ts it extends versus adds as an eighth.

**Grounding:** No loyalty model anywhere in apps/api/prisma/schema/*.prisma (grep -ri loyalty returns nothing); CHART_OF_ACCOUNTS in apps/api/src/modules/money/accounting/chart-of-accounts.ts has exactly 13 accounts, none for points; AccountingService.postEntry / posting-rules.subscriber.ts's seven @OnDomainEvent rules and findPostedEntry(source, sourceRef) idempotency pattern

### The request the ledger cannot obey

**Question:** When a customer exercises a data-deletion or export right, name every table that still holds their identifying data once the User row is gone, and for each one say whether it cascades, nulls the reference, or must retain the value unchanged.

**Grounding:** User onDelete Cascade on RefreshToken/UserRoleAssignment/UserPermission vs SetNull on Order.userId and AuditLog.actorId (core.prisma:88,342,398, orders.prisma:81, core.prisma:230); JournalLine.contactId as a bare scalar (apps/api/prisma/schema/accounting.prisma:191) on rows the forbid_journal_line_mutation trigger (migration 20260917070552_add_accounting_ledger) forbids updating or deleting; no erasure/export endpoint found under apps/api/src/modules/system/users/

## Absences

- A consent model with channel and purpose dimensions - today there is exactly one boolean (User.marketingEmailOptOut) and no consent field at all on Contact or DeviceToken
- Any loyalty/points model and any chart-of-accounts entry for a points liability - grep for 'loyalty' across the Prisma schemas returns nothing, and CHART_OF_ACCOUNTS has 13 accounts, none for points
- A data-subject request model (erasure/export/rectification) and any controller or service producing one - apps/api/src/modules/system/users/ has no such code today

