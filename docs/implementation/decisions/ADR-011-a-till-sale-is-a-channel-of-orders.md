# ADR-011 — A till sale is a channel of `orders`

[← Decision log](../DECISIONS.md)


### Context
A point of sale could reasonably be its own subsystem with its own records. Every
report, refund path and ledger posting then has to know about two of everything.

### Options Considered
- A parallel `PosSale` model alongside `Order`.
- A shared abstract sale with two subtypes.
- `Order` with a `channel` discriminator and additive nullable columns.

### Decision
**A channel of `orders`.** `Order.channel` is `WEB` or `POS`, with
`locationId`, `terminalId` and `shiftId` null for every web order.

### Reasoning
Two order systems means two of every report, two refund flows, two posting
rules, and a permanent question about which one a given figure came from. One
model with a discriminator keeps a single fulfilment queue, a single revenue
number and a single returns path, and costs four nullable columns.

Long-form: `RETAIL-ERP.md` R11.

### Consequences
- `POS_SALE` is a distinct `StockMovementReason` from `SALE`, so a ledger read
  can tell the channel apart without joining `Order`.
- The POS module can be absent entirely and `orders` is unaffected.
- Nullable columns carry a real obligation: any query that assumes `locationId`
  is present is wrong for every web order.

### Status
Accepted.
