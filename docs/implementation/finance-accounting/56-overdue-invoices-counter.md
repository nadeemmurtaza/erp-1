# 56 — The overdue-invoices counter

> **Status (2026-09-25): built, WO-56.1–56.2.** `overdueInvoicesSummary()`
> (`apps/api/src/modules/tradingpartners/invoice.service.ts`) is exactly
> the read-time query this doc specifies, exposed at `GET
> /admin/invoices/overdue-summary`
> (`invoices.controller.ts`), proven by a spec computing the same
> `count`/`totalMinor`/`oldestDueDate` independently. The UI is a counter
> tile on the trading-partners dashboard linking through to the filtered
> invoice list — WO-56.2's own "click the number" requirement — invisible
> when `tradingpartners` is off, matching the doc's own acceptance
> criterion. The mobile staff self-service tile named in WO-56.2 was not
> added: doc 52's own mobile app shell has no existing trading-partner
> surface to host it on today, and adding one is a separate, larger
> capability this work order did not open.

`Invoice.dueDate` and `InvoiceStatus` (`ISSUED`/`PAID`/`VOID`) already
exist (doc 18's trading-partner network). Nothing computes "overdue" from
them anywhere in this codebase — a real, small gap, not a missing model.
"Overdue" is a derived state (`status: ISSUED` and `dueDate` in the past),
never its own column: storing it would drift the moment a day passes with
no write to update it, exactly the kind of stale, silently-wrong figure
`CLAUDE.md`'s own "click the number" lens exists to prevent.

## 1. Overdue is computed at read time, always

```ts
async overdueInvoicesSummary(): Promise<{ count: number; totalMinor: number; oldestDueDate: Date | null }> {
  const overdue = await this.prisma.invoice.findMany({
    where: { status: 'ISSUED', dueDate: { lt: new Date() } },
    select: { totalMinor: true, dueDate: true },
    orderBy: { dueDate: 'asc' },
  });
  return {
    count: overdue.length,
    totalMinor: overdue.reduce((sum, i) => sum + i.totalMinor, 0),
    oldestDueDate: overdue[0]?.dueDate ?? null,
  };
}
```

No cron, no materialised column, no cache with an invalidation strategy to
maintain — the query is cheap over `Invoice`'s existing `[status]` index
(extended with `dueDate` once real volume justifies the composite, per
`EXPLAIN ANALYZE`, not assumed up front) and correctness never drifts,
because there is nothing stored to go stale.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: a read over doc 18's own existing
`Invoice`/`TradingPartner` actors.
**Whose rows, and which columns** — scoped to the caller's own
organization/brand exactly as every other `tradingpartners` figure
already is, behind the existing `tradingpartners.invoices.view`
permission — no new key.
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — n/a: a read with no write, no authority to bound.
**Audience is a capability, not an address** — n/a: a dashboard/mobile
widget, not a notification (an "overdue invoice ageing" *alert*, as
opposed to this counter, would follow doc 24/33's own audience-resolution
rule if ever built — named below, not this document's own scope).
**Request or record** — n/a: a pure computed read.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved** — n/a: this counter
posts nothing; it reads what `Invoice` already recorded.
**The second legal entity** — scoped per `organizationId` exactly as
`Invoice` already is.
**Dry run before live** — the function above already is the entire
"preview": there is no separate live/preview distinction to draw for a
pure read with no side effect.
**Three silhouettes** — Solo: perhaps zero trading-partner invoices ever;
the tile shows zero, cheaply. Chain: a real AR-ageing signal per branch's
own trading relationships. Organization: cross-brand overdue totals,
volume (next lens) starts to matter.
**The absent collaborator** — with `tradingpartners` off, the tile does
not render (`MOD-1`), never shows a stale or zero-by-coincidence figure.
**The second copy of the write** — n/a: no write at all.
**The hundred-thousandth row** — bounded by `Invoice`'s own existing
`[status]` index; an organization with genuinely tens of thousands of
open invoices gets the composite `[status, dueDate]` index named above
rather than a full-table scan — a real, stated performance-engineering
consideration per the repository's own table, not assumed free at any
scale.
**The reversal document / The undo fan-out / The version stamp** — n/a:
nothing here is written or reversed; paying or voiding the underlying
invoice (doc 18's own existing actions) is what removes it from this
count, automatically, on the very next read.
**The erasure the ledger cannot obey** — n/a: no personal data beyond
what `Invoice`/`TradingPartner` already carry under doc 18's own rules.
**The failure path** — n/a beyond an ordinary query failure, surfaced as
the tile's own error state (design-system's "every state shipped" rule),
never silently showing a stale zero.

## Work orders

**WO-56.1 — `overdueInvoicesSummary()`** read, org/brand-scoped.
**WO-56.2 — UI**: a counter tile on the trading-partners/finance
dashboard and on doc 52's staff self-service mobile home screen (the
promotional list's own "directly on the primary mobile interface" —
this is doc 52's own app shell, not a fourth mobile surface), with
`count`/`totalMinor`/`oldestDueDate` and a link to the filtered invoice
list behind it (`CLAUDE.md`'s own click-the-number rule).

## Acceptance

- The counter's `count`/`totalMinor` match a direct, independent query of
  `ISSUED` invoices past their `dueDate`, proven by a spec computing both
  separately.
- Paying or voiding an invoice removes it from the count on the very next
  read, with no cache to invalidate.
- The tile is invisible when `tradingpartners` is off.
- At a stated large invoice volume, the query resolves from an index,
  never a sequential scan (`EXPLAIN ANALYZE`-verified).

## Out of scope

Automated overdue-invoice reminder notifications to the trading partner —
a real, separate capability (doc 33's channels, doc 36's outbound
connector, or doc 18's own outbound delivery path could each carry it),
named here as a natural next step, not built as part of a counter tile.
Ageing buckets (0-30/31-60/61-90 days overdue) — a real, richer report
than a single counter; named as a future extension of the identical
underlying query, not built here.
