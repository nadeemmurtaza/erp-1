# ADR-012 — Cross-module references are bare scalars, not foreign keys

[← Decision log](../DECISIONS.md)


### Context
Module independence (ADR-003) is enforced for TypeScript imports. The Prisma
schema is the other place two modules can become inseparable, and a foreign key
is harder to remove than an import.

### Options Considered
- Normal Prisma relations across module schema files.
- Relations within a pack, scalars across packs.
- Bare scalar columns for every cross-module reference, validated in the service.

### Decision
**A bare scalar.** `Order.locationId`, `PosTerminal.locationId`,
`StockTransfer.sourceLocationId` and `PosReceipt.orderId` are plain strings; the
owning service checks existence at write time.

### Reasoning
A cross-module foreign key makes the two modules undeployable apart — the
constraint has to exist in the database whether or not the module is enabled,
which contradicts the allowlist that makes packs useful. It also becomes
impossible at chain scale, where the two tables can live in different databases
(ADR-009). Losing referential integrity at that boundary is the price; it is
paid deliberately, and the check moves into the service that owns the write.

### Consequences
- The database will not stop an orphaned reference. The owning service must, and
  its tests must cover it.
- A `JOIN` across the boundary is not available; reads assemble in the service.
- The same reasoning applies to order lines, which are snapshots rather than
  references, for a different reason — a price change must not rewrite history
  (`00-HOUSE-RULES.md` Rule 7).

### Status
Accepted.
