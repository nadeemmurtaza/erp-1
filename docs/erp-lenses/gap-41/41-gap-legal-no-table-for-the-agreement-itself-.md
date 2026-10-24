# 41. Legal — no table for the agreement itself (lease, franchise, supplier or B2B contract)

A corporate group runs on paper a shop never sees: the lease behind a branch,
the franchise agreement behind a franchisee's `Location`, the supplier or
B2B contract behind a `Party`/`TradingPartner`. Legal-hold (05) preserves an
existing record once litigation starts; supplier compliance-document expiry
(13) is scoped to onboarding a `Supplier`. Neither asks where the agreement
itself — its term, its renewal date, its governing law — lives, distinct
from the operational row it governs. At 100+ locations across timezones,
that gap surfaces as a dark storefront, not a warning.

## Lens: The agreement is not the row it governs

**Question:** Name the table that would hold a lease, franchise, supplier or
B2B contract's own term-start, term-end, renewal-notice-period and
governing-jurisdiction, and name the column on `Location`, `Party` or
`TradingPartner` a narrow build would be tempted to overload instead.
**Why:** `Location` (`apps/api/prisma/schema/inventory.prisma:76-112`) has
`address Json?`, `retailBrandId`, `originNodeId` — no term, no jurisdiction.
`TradingPartner` (`trading-partners.prisma:33-76`) has `invitedAt`/
`acceptedAt`, but those are the technical handshake's timestamps, not a
contract's dates. `Party` (`parties.prisma:15-41`) has `address String?`,
`taxId`, `notes` — free text, no structured term. None of the three has
anywhere for the paper to live.
**Worked example:** Narrow slice: a franchise `Location` is created per
lens 19 with `retailBrandId` and `address` set; nothing records that the
franchise agreement behind it expires in three years with 90 days' notice
under UAE law. Complete capability: an `Agreement` table (`kind`
LEASE|FRANCHISE|SUPPLIER|B2B, `locationId?`, `partyId?`,
`tradingPartnerId?`, `startsOn`, `endsOn`, `renewalNoticeDays`,
`governingJurisdiction`, `documentRef`) that any of the three optionally
point to, so a lease attaches to a `Location` and a supplier contract to a
`Party` without either model growing agreement-only columns.
**Done test:** `grep -n "model Agreement" apps/api/prisma/schema/*.prisma`
— today zero hits. The PR adds the model plus a nullable foreign key from
at least one of `Location`, `Party`, `TradingPartner`.
**Breaks without:** Across tailor shops, warehouses, in-transit sites and
100+ franchise stores, nobody can query which lease or which law governs a
given `Location`'s paperwork — the group finds out when the lease lapses
and the location goes dark, not sixty days before.

## Lens: The renewal nobody is watching

**Question:** Which scheduled job computes "agreements expiring within N
days" over the table above, which permission key gates seeing the result,
and what audience mechanism (not a hardcoded email address) receives it?
**Why:** The codebase already has the job pattern — `@Cron('0 3 * * *')`
in `apps/api/src/modules/supply-chain/purchasing/purchasing.cron.ts` and
`supply-chain-digest.cron.ts` — but nothing analogous exists for a legal
date, because there is no `Agreement` table for a cron to scan. This is
sharper than lens 13's "boolean is not a lifecycle": that one guards
*creating a PO* against an unapproved supplier; this one guards *nothing
at all* against a lease or franchise term nobody is watching, on an entity
with no compliance-document workflow to borrow from.
**Worked example:** Narrow slice: a spreadsheet someone remembers to check.
Complete capability: a daily cron reading `Agreement.endsOn -
renewalNoticeDays`, publishing a domain event consumed the way "Audience is
a capability, not an address" already requires — permission-and-scope, not
`store.supportEmail` — to whoever holds a new `legal.agreements.manage` key
at the right `AdminScope` level.
**Done test:** `grep -rn "Agreement" apps/api/src/modules --include=*.cron.ts`
— today no file exists to match. The PR names the cron file and the
permission key in `packages/shared/src/permissions.ts`.
**Breaks without:** At Org scale, a renewal date sixty days out is
indistinguishable from one that lapsed yesterday — both are equally
invisible — so the first signal a 100+-location group gets is an
operational failure, not a legal one.

## Not modelled yet

- No `Agreement`, `Lease` or `Contract` model anywhere in
  `apps/api/prisma/schema/*.prisma` — `Location`, `Party` and
  `TradingPartner` each carry only their own operational fields.
- No scheduled job for a legal date of any kind — the `@Cron` pattern
  exists (`purchasing.cron.ts`, `supply-chain-digest.cron.ts`) but nothing
  reads a term-end or renewal-notice date because none is stored.
- No permission key for managing or viewing agreements — the 50-key
  catalogue in `packages/shared/src/permissions.ts` has no `legal.*`
  namespace at all.

## Hardening record

**Kept:**
- *The agreement is not the row it governs* — grounded, falsifiable
  (`grep -n "model Agreement"` today returns zero hits), and demands a
  specific artifact (the table, its optional FKs) that no other lens in
  this repo's set requires.
- *The renewal nobody is watching* — grounded in the two real cron files
  and the real permission catalogue; explicitly scoped narrower than lens
  13's "boolean is not a lifecycle" (that one guards PO creation against an
  unapproved supplier; this one guards nothing at all, because no table
  exists for a cron to scan) and builds on, rather than restates, the
  Notifications cluster's "Audience is a capability not an address."

**Killed:**
- *Whose law governs this one* — reason: not an independent lens. Lens 1's
  own worked example already specifies `Agreement.governingJurisdiction` as
  a column on the new table; this lens's entire claim is that the same
  column, once it exists, should not instead be read off `BRAND.locale`.
  No engineer building the schema in lens 1 would derive a per-row contract
  fact from a global compile-time constant — the two facts (deployment
  locale vs. a specific lease's governing law) sit on visibly different
  objects from the start. The lens changes nothing an engineer would build
  beyond what lens 1 already forces, and its "why" reuses the identical
  single-compile-time-constant argument already made for `BRAND.locale` in
  `docs/erp-lenses/tax-jurisdiction-invoice/08-tax-jurisdiction-invoice.md` and
  `docs/erp-lenses/ground/00c-ground-money.md` without naming a scope difference
  from that prior use — it fails the "restates an existing point without
  naming the difference" test.

**Citations verified, none required correction:**
- `Location` model — `apps/api/prisma/schema/inventory.prisma:76`, fields
  `address Json?`, `retailBrandId String?`, `originNodeId String?` all
  confirmed present as described (model body runs to line 113; the file's
  "76-112" is off by one line, immaterial to the claim).
- `TradingPartner` model — `trading-partners.prisma:33`, fields
  `invitedAt`/`acceptedAt` confirmed present, confirmed to be connection
  handshake timestamps, not contract dates.
- `Party` model — `parties.prisma:15-41`, fields `address String?`,
  `taxId`, `notes` confirmed present, confirmed free text with no
  structured term field.
- `apps/api/src/modules/supply-chain/purchasing/purchasing.cron.ts` and
  `apps/api/src/modules/money/analytics/supply-chain-digest.cron.ts` both
  confirmed to exist and use `@Cron(...)`.
- `packages/shared/src/permissions.ts` confirmed to hold exactly 50
  permission keys (`grep -c "key: '"`) and zero `legal.*` keys.
- `AdminScope` confirmed to exist (`apps/api/src/core/auth/scope.guard.ts`).
- Lens 05 (`docs/erp-lenses/audit-evidence-hold/05-audit-evidence-hold.md`) and lens 13
  (`docs/erp-lenses/procurement-supplier-lifecycle/13-procurement-supplier-lifecycle.md`) confirmed to
  exist and to cover what this file says they cover — legal-hold on an
  existing record, and supplier-onboarding compliance documents,
  respectively, neither touching the agreement's own term/renewal/
  jurisdiction data.
