# 41g generate gap

Output of the `gen:gap:41` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Legal — no table for the agreement itself (lease, franchise, supplier or B2B contract)

## File

docs/erp-lenses/gap-41/41-gap-legal-no-table-for-the-agreement-itself-.md

## Lenses

### The agreement is not the row it governs

**Question:** Name the table that would hold a lease, franchise, supplier or B2B contract's own term-start, term-end, renewal-notice-period and governing-jurisdiction, and name the column on Location, Party or TradingPartner a narrow build would be tempted to overload instead.

**Grounding:** Location (inventory.prisma:76-112: address Json?, retailBrandId, originNodeId), TradingPartner (trading-partners.prisma:33-76: invitedAt/acceptedAt are handshake timestamps), Party (parties.prisma:15-41: address String?, taxId, notes) — none has anywhere for a contract's own dates or jurisdiction to live.

### The renewal nobody is watching

**Question:** Which scheduled job computes 'agreements expiring within N days' over the Agreement table, which permission key gates seeing the result, and what audience mechanism (not a hardcoded email) receives it?

**Grounding:** The @Cron pattern already exists (purchasing.cron.ts:28, supply-chain-digest.cron.ts:36/124/190) but nothing analogous scans a legal date because no Agreement table exists; distinct from lens 13's PO-time supplier-approval guard, and reuses the prior 'Audience is a capability, not an address' lens rather than restating it.

### Whose law governs this one

**Question:** When an agreement's governing jurisdiction differs from this deployment's own locale, which column on the Agreement row holds that value, and what stops it from being read off BRAND.locale instead?

**Grounding:** packages/shared/src/brand.ts's BRAND.locale is documented elsewhere in this workflow's ground truth as 'a single compile-time constant' already reused for base currency across every posting rule; at Org scale a franchise/lease's governing law is a per-row fact, not the deployment's one locale.

## Absences

- No Agreement, Lease or Contract model anywhere in apps/api/prisma/schema/*.prisma
- No scheduled job for any legal date (term end, renewal notice) — the @Cron pattern exists but nothing to scan
- No legal.* permission namespace in packages/shared/src/permissions.ts's 50-key catalogue

