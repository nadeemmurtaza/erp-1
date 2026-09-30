# ADR-010 — In-transit stock is a Location, not a flag

[← Decision log](../DECISIONS.md)


### Context
Stock moving between branches is neither at its source nor its destination, and
it can be in that state for days. It has to stay countable and auditable
throughout.

### Options Considered
- A status field on the transfer, with quantities held on the transfer rows.
- A boolean or enum on the stock row.
- A real `Location` of type `IN_TRANSIT`, created per transfer.

### Decision
**A `Location`.** Each dispatch creates its own in-transit location, holding
exactly the quantity currently between two real places.

### Reasoning
Everything `VariantLocationStock` and the stock ledger already do for a real
location — balances, movements, valuation, variance — comes free for goods on a
truck, with no schema change and no cross-database constraint. A flag would have
required every one of those to learn a second way of counting, and would have
left the in-transit quantity outside the ledger it belongs in.

Long-form: `RETAIL-ERP.md` R4; `17-inventory-locations.md`.

### Consequences
- The in-transit row is never deleted after the transfer completes: it is the
  transfer's ledger anchor, and every `TRANSFER_OUT`/`TRANSFER_IN` movement
  references it.
- `LocationType` must be excluded wherever "real, staffed places" are listed —
  the API is explicit about never returning an in-transit bucket as a location.
- A short receipt writes the difference off from the in-transit location rather
  than letting it vanish.

### Status
Accepted.
