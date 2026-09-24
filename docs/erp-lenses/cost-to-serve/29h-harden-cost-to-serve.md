# 29h. Hardening record: What the feature costs at corporate volume (cost-to-serve)

Adversarial review of [29-cost-to-serve.md](./29-cost-to-serve.md) by the `harden:29:cost-to-serve` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### The cost that multiplies by location  — strong

**Question:** For a single-unit sale, name every location the posting transaction reads or aggregates over besides the one that sold the unit, and state whether that count grows with the SKU's location count or stays fixed.

**Verified against:** inventory.service.ts:220-304 (applyMovement) and its recompute at :296-304, both verified verbatim.

### The report that recomputes from scratch  — strong

**Question:** For a figure a user can click to refresh (trial balance, P&L, balance sheet), name the columns its underlying query filters or groups on, and state which of those columns has a database index today.

**Verified against:** gl-reports.service.ts:37,74,146 and accounting.prisma JournalLine @@index([accountId]) at line 203, JournalEntry indexes (periodId, source+sourceRef, status) at 147-149 with no date index; settings.service.ts:6 cache scope confirmed.

### The write that doesn't chunk  — strong

**Question:** For a background job that must touch every row of a corporate-scale table, name the number of rows it inserts/updates in its single transaction and state whether that number is bounded by anything other than how many rows currently match.

**Verified against:** stock-count.service.ts:92-120 confirmed unchunked; inventory.prisma StockCount model (191-212) confirmed to have no locationId field; transfers.service.ts 20_000ms transaction timeouts confirmed at lines 163, 292, 335.

## Killed (0)

_Nothing was killed._


## Citations corrected (0)

_Every citation checked out as written._


## Not modelled in this repo today

- No hallucinated or stale citation was found across all three lenses; every file path, line range, model field, and method name checked against the current repo state matched exactly, including narrow claims (JournalLine's single index at exactly line 203, and StockCount having zero locationId columns).
