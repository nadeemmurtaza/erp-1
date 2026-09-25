# 84 — Per-user HR pricing: already doc 50's `PER_SEAT` shape

> **Status: shipped (2026-09-25), WO-84.1.** Re-verified `PricingModel.
> PER_SEAT` and `countBillableSeats()` against `apps/platform/src/modules/
> billing/{billing.service.ts,seat-counter.service.ts}` — matches doc 50's
> own text. **Correction to this document's own module list**: there is no
> module named `hr` in `FEATURE_MODULES`
> (`apps/api/src/modules/modules.registry.ts`) — compensation rates, leave
> policy/balances and pay runs are all one module, `payroll`
> (`apps/api/src/modules/payroll/`), confirmed by reading that module's own
> directory and `payroll.module.ts`. **WO-84.1** — the HR-only convention
> (`MODULES=payroll`, not `hr,payroll`) is now recorded alongside doc 82's
> Basic/Standard mapping in
> [`../MULTI-SECTOR.md`](../MULTI-SECTOR.md)'s "Commercial-tier module
> conventions" section.

"Micro-SaaS HR pricing modeled strictly on a per-user basis, starting at
[a fixed rate] per user/month" is doc 50's own `PricingModel.PER_SEAT`
shape, already built: `PlatformPlan.perSeatPriceMinor` × doc 50's own
`countBillableSeats(tenantId)` (which "reads the tenant's OWN database...
counting active staff Users — never customers, never service/API
accounts"). The only new content in this bullet is packaging: an
HR-specific plan is a `PlatformPlan` row with `pricingModel = PER_SEAT`
and a `MODULES` allowlist scoped to the `payroll` module alone, none of
`catalog`/`orders`/`pos` (there is no separate `hr` module in
`FEATURE_MODULES` — compensation rates, leave and pay runs are all one
module, `payroll`, confirmed against the registry — see status above) — a
smaller module footprint under the identical billing mechanism doc 50
already computes, never a second per-seat billing engine built for HR
specifically.

## What already exists

- **`PricingModel.PER_SEAT`** and **`countBillableSeats()`** (doc 50) —
  the entire billing mechanism.
- **`MODULES` allowlist scoping** — an HR-only deployment simply omits the
  retail-facing modules, the same allowlist mechanism doc 82's Basic/
  Standard tiers and doc 83's entry-level POS both already rely on.

## Scope lenses

Not repeated — no new schema, write path, or permission; doc 50's own
scope lenses (including its own seat-counting boundary crossing, already
answered there) cover this exactly.

## Work orders

**WO-84.1 (documentation/configuration only) — done, see status above.**
Recorded an "HR-only `MODULES` allowlist" convention (`payroll` alone,
none of the retail-facing modules — there being no separate `hr` module to
list) alongside doc 82's Basic/Standard convention, so a micro-SaaS-HR sale
has one documented module set rather than being reconstructed per client.

## Acceptance

- No schema or code change — verified by citation to doc 50's existing
  `PER_SEAT` mechanism.
- The HR-only module convention is documented in the same place as doc
  82's Basic/Standard mapping.

## Out of scope

Nothing further — this domain has no remaining gap beyond the
documentation work order above.
