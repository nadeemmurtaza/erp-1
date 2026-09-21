# 41h harden gap

Output of the `harden:gap:41` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Legal — no table for the agreement itself (lease, franchise, supplier or B2B contract)

## File

docs/erp-lenses/41-gap-legal-no-table-for-the-agreement-itself-.md

## Kept

### The agreement is not the row it governs

**Question:** Name the table that would hold a lease/franchise/supplier/B2B contract's own term-start, term-end, renewal-notice-period and governing-jurisdiction, and name the column on Location, Party or TradingPartner a narrow build would overload instead.

**Strength:** strong

**Citations:** Location (inventory.prisma:76), TradingPartner (trading-partners.prisma:33), Party (parties.prisma:15-41) all verified: none has a structured term/contract-date field.

### The renewal nobody is watching

**Question:** Which scheduled job computes agreements expiring within N days, which permission key gates seeing the result, and what audience mechanism receives it?

**Strength:** solid

**Citations:** purchasing.cron.ts and supply-chain-digest.cron.ts verified to exist and use @Cron; permissions.ts verified to have 50 keys and no legal.* namespace; AdminScope verified to exist in scope.guard.ts.

## Killed

### Whose law governs this one

**Reason:** Not an independent lens: lens 1's own worked example already specifies Agreement.governingJurisdiction as a column on the new table, so this lens adds nothing an engineer would build beyond what lens 1 already forces. Its 'why' also reuses the identical single-compile-time-constant argument already made about BRAND.locale in docs/erp-lenses/08-tax-jurisdiction-invoice.md and 00c-ground-money.md without naming a scope difference from that prior use.

## Corrections

- None required — all citations checked out as claimed (Location, TradingPartner, Party field lists; the two cron files; the 50-key permission catalogue with no legal.* namespace; AdminScope's existence; lenses 05 and 13's actual scope). One immaterial line-range note: Location model body runs 76-113, file cited 76-112 (off by one, no claim depends on the exact end line).

