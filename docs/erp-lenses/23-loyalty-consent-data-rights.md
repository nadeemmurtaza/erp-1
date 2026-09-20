# 23. Loyalty, consent and the customer data

At corporate scale, "the customer" is a legal relationship with obligations
attached, not a row. Consent must be provable per channel and purpose, not
inferred from one flag. Points issued are money the business owes, not a
counter. And a request to erase or export data lands on a ledger built, by
design, to never change — so the feature has to say what happens at that
collision before it is built, not after a regulator asks.

## Lens: Consent is a matrix, not a switch

**Question:** For a new communication feature, name every channel (email, SMS, WhatsApp, push, in-app) and purpose (transactional, marketing, service, research) it will send through, and for each pair say which field records the customer's consent and what existing customers default to today.

**Why:** `User.marketingEmailOptOut` (core.prisma:35) is the entire consent model: one boolean, one channel, no purpose distinction — transactional mail shares the address but skips the check, and only `marketing-automation.cron.ts` reads it. `Contact` (crm.prisma:16-45), whose own `source` field lists "whatsapp" and "instagram" as origins, carries zero consent columns for those channels. `DeviceToken` (core.prisma:388) stores push tokens with no consent field at all.

**Worked example:** Narrow slice: a "send push notification" feature that sends to every `DeviceToken` on file. Complete capability: a consent table keyed by (subject, channel, purpose), checked before send, defaulted to opt-out for every pre-existing channel, with that default itself recorded as a fact, not silence.

**Done test:** `grep -rn "consent" apps/api/prisma/schema/*.prisma` names a table with channel and purpose columns, not just `marketingEmailOptOut`; the PR shows the send path querying it before `DeviceToken`/`Contact`.

**Breaks without:** A WhatsApp or push campaign ships against `Contact`/`DeviceToken` with no consent check at all — every guest and B2B contact gets marketing on a channel nobody asked about, undetectable until a regulator or the customer asks which box they ticked.

## Lens: The liability with no account

**Question:** When a loyalty or points feature is built, name the ledger account it posts to on accrual and on redemption or expiry, and which of the seven existing posting rules in `posting-rules.subscriber.ts` it extends versus adds as an eighth.

**Why:** No loyalty model exists anywhere in the schema (`grep -ri loyalty apps/api/prisma/schema` returns nothing), and `CHART_OF_ACCOUNTS` (chart-of-accounts.ts) has exactly thirteen accounts, none for points. A point issued at sale is a discount owed on a future sale — a liability — not a counter next to `Contact.lifetimeValue`. Posting the sale's full revenue today and giving away inventory later with no matching entry understates every balance sheet the moment the feature ships.

**Worked example:** Narrow slice: `User.loyaltyPoints Int`, incremented on `order.placed`, decremented on redemption. Complete capability: `loyalty_points.earned`/`redeemed` domain events, an eighth posting rule beside the seven in `accounting.service.ts` that debits Sales Revenue and credits a new Loyalty Points Liability account at issue, reverses it at redemption or expiry, and is idempotent via `findPostedEntry(source, sourceRef)` like the rest.

**Done test:** `grep -n "Loyalty" apps/api/src/modules/accounting/chart-of-accounts.ts` returns a liability row; the posting-rules subscriber shows a matching `@OnDomainEvent` handler.

**Breaks without:** The balance sheet understates liabilities by every point outstanding — real money an auditor finds and finance never provisioned for, at a scale where thousands of daily transactions make the gap compound fast.

## Lens: The request the ledger cannot obey

**Question:** When a customer exercises a data-deletion or export right, name every table that still holds their identifying data once the `User` row is gone, and for each one say whether it cascades, nulls the reference, or must retain the value unchanged.

**Why:** `User` deletion cascades onto `RefreshToken`, `UserRoleAssignment`, `UserPermission` and `DeviceToken` (`onDelete: Cascade`, core.prisma:88,342,285-286,398) but only `SetNull`s `Order.userId` and `AuditLog.actorId` (orders.prisma:81, core.prisma:230) — and `JournalLine.contactId` (accounting.prisma:189) is a bare scalar, not even a relation, on rows the `forbid_journal_line_mutation` trigger (migration `20260917070552_add_accounting_ledger`) forbids ever updating or deleting. No export or erasure endpoint exists anywhere in `apps/api/src/modules/users/` (`users-admin.controller.ts`, `users-admin.service.ts`, `dto/user.dto.ts` are the only files there).

**Worked example:** Narrow slice: a "delete my account" button that deletes the `User` row and stops. Complete capability: an erasure record naming which fields were nulled, which rows were deliberately left as an orphaned id inside the immutable ledger for statutory retention, and the legal basis for each retention — written down per table, not discovered later.

**Done test:** the PR includes a table, one row per affected model, with an action column (cascade / null / retain-immutable) and a legal basis for every retain; `grep -rn "erasure\|dataExport" apps/api/src/modules/users/` finds the new code.

**Breaks without:** An erasure request either silently misses tables it should reach, or is attempted against `JournalLine` and produces an unbalanced, gap-numbered ledger — the exact outcome the immutability trigger exists to prevent.

## Not modelled yet

- A consent record with channel and purpose — today there is one boolean (`User.marketingEmailOptOut`) and no consent field at all on `Contact` or `DeviceToken`.
- Any loyalty or points model, and any ledger account for a points liability — the schema and the thirteen-account chart have neither.
- A data-subject request model (erasure, export, rectification), and any endpoint that produces one — `apps/api/src/modules/users/` has no such controller or service today.

## Hardening record

**Kept (3 of 3):**

- **Consent is a matrix, not a switch** — distinct from WO-22's "Audience is a capability, not an address" (that lens fixes internal-alert routing to permission+scope; this one fixes external customer consent per channel+purpose, a different subject and a different table). Verified: `User.marketingEmailOptOut` is the sole consent field (core.prisma:35, a bare boolean); `Contact` (crm.prisma:16-45) has a `source` field listing `"whatsapp"`/`"instagram"` but zero consent columns; `DeviceToken` (core.prisma:388-401) has no consent field.
- **The liability with no account** — verified: `grep -ri loyalty apps/api/prisma/schema` returns nothing; `CHART_OF_ACCOUNTS` (chart-of-accounts.ts:20-32) has exactly 13 rows, none named Loyalty; `posting-rules.subscriber.ts` has exactly 7 `@OnDomainEvent` handlers; `AccountingService.findPostedEntry(source, sourceRef)` (accounting.service.ts:176) is the real idempotency guard cited.
- **The request the ledger cannot obey** — verified and one citation corrected (below); `forbid_journal_line_mutation` trigger confirmed in migration `20260917070552_add_accounting_ledger/migration.sql:221`; `apps/api/src/modules/users/` confirmed to contain no erasure/export code (`grep -rn "erasure\|dataExport"` returns nothing).

**Killed:** none — all three lenses cite real, currently-true gaps in this repo and each forces a specific artifact (a consent table with channel+purpose columns, an eighth posting rule plus a chart-of-accounts row, a per-table retention disposition list) that a narrow build would omit.

**Corrections:**

- Claimed `User` deletion cascades onto `RefreshToken`, `UserRoleAssignment` and `UserPermission` at `core.prisma:88,342,398`. Actual: line 398 is `DeviceToken`'s cascade relation, not `UserPermission`'s — `UserPermission.user` cascades at core.prisma:285 (its `permission` relation at 286). `DeviceToken` also cascades on delete (core.prisma:398), which the original text omitted; corrected line now reads `core.prisma:88,342,285-286,398` and names `DeviceToken` as the fourth cascading model.
- Claimed `JournalLine.contactId` at `accounting.prisma:191`. Actual: the field is declared at line 189; 191 is a comment line about the header documentation. Corrected to 189.
