# 23h. Hardening record: Loyalty, consent and the customer data

Adversarial review of [23-loyalty-consent-data-rights.md](./23-loyalty-consent-data-rights.md) by the `harden:23:loyalty-consent-data-rights` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### Consent is a matrix, not a switch  — strong

**Question:** Name every channel/purpose pair a new communication feature sends through and which field records consent for each, plus the default for existing customers.

**Verified against:** User.marketingEmailOptOut (core.prisma:35, bare boolean); Contact (crm.prisma:16-45) has source listing whatsapp/instagram but no consent columns; DeviceToken (core.prisma:388) has no consent field — all verified by direct read.

### The liability with no account  — strong

**Question:** Name the ledger account a loyalty/points feature posts to on accrual and redemption, and which of the 7 existing posting rules it extends vs. adds as an 8th.

**Verified against:** grep -ri loyalty returns nothing; CHART_OF_ACCOUNTS has exactly 13 rows (verified); posting-rules.subscriber.ts has exactly 7 @OnDomainEvent handlers (verified); findPostedEntry at accounting.service.ts:176 (verified).

### The request the ledger cannot obey  — strong

**Question:** For a data-deletion/export request, name every table still holding the customer's identifying data once User is gone, and whether it cascades, nulls, or must retain.

**Verified against:** Cascade/SetNull behavior verified across core.prisma, orders.prisma, accounting.prisma; forbid_journal_line_mutation trigger confirmed in migration 20260917070552; no erasure/export code in apps/api/src/modules/users/ confirmed by grep.

## Killed (0)

_Nothing was killed._


## Citations corrected (2)

- Claimed User deletion cascades onto RefreshToken, UserRoleAssignment and UserPermission at core.prisma:88,342,398. Actual: line 398 is DeviceToken's cascade relation, not UserPermission's; UserPermission.user cascades at core.prisma:285 (permission relation at 286). Also added that DeviceToken itself cascades on User delete (line 398), which the original prose omitted entirely.
- Claimed JournalLine.contactId at accounting.prisma:191. Actual: the field is declared at line 189; line 191 is a documentation comment for a different field (counterpartyBrandId), not contactId's declaration. Corrected to 189.
