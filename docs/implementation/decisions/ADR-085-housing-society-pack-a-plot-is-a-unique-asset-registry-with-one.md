# ADR-085 — Housing society pack: a plot is a unique-asset registry with one writer, outside `InventoryService`; the booking lifecycle is an append-only `BookingTransaction` record set

[← Decision log](../DECISIONS.md)


### Context

Docs 220–230 (`housing-society/`) specify a sector pack for housing societies:
plots and files, bookings, transfers, merges, rebooks, refunds, installments,
receipts, accounting, complaints, visitors, and Excel import. Two modelling
questions needed an answer before any schema: is a plot stock, and how is a
booking changed after it exists.

### Options Considered

1. **Plot as a product variant moved by `InventoryService.move()`.** Rejected:
   that service guards counted quantity; a plot is unique and has ownership,
   not a count. Forcing it through stock would blur the one-writer invariant.
2. **Plot as its own registry with one writer, `PlotRegistryService`, using
   predicate-on-write status changes (chosen).**
3. **Edit the booking row on transfer/merge/rebook.** Rejected: history is
   lost and an undo becomes guesswork.
4. **Append-only `BookingTransaction` rows, current state derived and checked
   against them (chosen).**

### Decision

Options 2 and 4. All money goes through core `accounting`, `receivables` and
`payments`; people through `Party`; complaints through `support`/`tasks`. No
second ledger, people table or ticketing system. Industry-specific: the pack is
gated by `MODULES`, core never imports it.

### Parameters

Late-fee defaults (10-day grace, 2%/month simple, 25% cap, nightly 02:00 run),
complaint SLAs (24 h acknowledge, 5 working days resolve, 24 h urgent), import
limits (25 MB / 200,000 rows, 500-row chunks, 30-day staging purge, 5 uploads/h)
are proposals in `Setting`, versioned and audited, to confirm per client.

### Reasoning

Keeps one writer per invariant, keeps one books-of-record, and lets every
future service (maintenance billing, utilities, dealers, online payments)
attach without changing the booking or ledger shape.

### Consequences

Plot status needs a replay check against `PlotStatusEvent`. Revenue-recognition
policy must be recorded per client. The meaning of "SAMs" in the source feature
list is assumed, pending the owner.

### Status

Proposed. Nothing built.
