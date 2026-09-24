<!-- POINTER FILE — not the source of truth, never edited to reorder or add a phase here. -->

# Phases

The build's phased dependency order — and the reasoning for that order —
is documented in one place:
[`docs/implementation/README.md`](./docs/implementation/README.md), under
**"Dependency order"**.

In short, restated here only as an index, not as the source:

```
1  Inventory, Purchasing & Cost   ──┬──> 4  Finance ──┐
   (cost price is the keystone)     │                 │
                                    ├──> 6  Shipping & Returns ──┐
                                    │                            │
2  Admin shell ──> 3  Variants & SEO ──┬──> 5  Promotions ───────┼──> 7  Portal
                                       │                         │
                                       └──> 8  Content & Search ─┴──> 9  AI

10 (bom + finance's expense half) sits alongside Phase 1, not after it.
```

**Phase 1 is first because cost price is the keystone** — without a cost
per unit there is no margin, no P&L, and no way to know whether a discount
is profitable. The full reasoning for every dependency arrow, plus the
phase-by-phase work-order breakdown, is in `docs/implementation/README.md`
itself — never duplicated here.

**Numbers 11 onward** are not phases in the original nine-phase sense —
they are individually-numbered implementation documents (`docs/implementation/11-*.md`
through the current highest number), each with its own status, work
orders, and acceptance criteria, added as real requirements were found.
`docs/implementation/README.md`'s own routing table is the current,
authoritative list of every one of them — this file does not re-list them,
since that table is regenerated in spirit (kept current by hand, same
discipline) every time a new document is added, and a second copy here
would drift.

**How a work order actually runs** — one branch per work order, dependency
order within a phase, `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
before it's done — is also in `docs/implementation/README.md`, under
"How a work order runs."

**This file exists only so "Phases.md" is findable by name.** The real,
current phase and work-order breakdown lives in
`docs/implementation/README.md`.
