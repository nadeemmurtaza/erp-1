# 131 — Versioned domain events: a naming convention for the one moment a shape must change

Doc 100 already establishes the transactional outbox as this repository's
event-driven backbone; doc 38's own WO-38.5 already specifies a contract
test per domain event, failing CI on an unannounced payload shape change.
Neither names what actually *happens* when a domain event's shape
genuinely needs to change — a new field a listener now requires, a field
being removed because it was wrong. This document is that one missing
convention.

## The convention: additive by default, a new event name when a break is unavoidable

```ts
// Adding a field is never a version bump — every existing subscriber
// already ignores fields it doesn't know about (ordinary object
// destructuring), so OrderPlacedPayload gaining a new optional field is
// non-breaking by construction. Doc 38's own contract test catches the
// case that actually matters: a subscriber that WOULD break silently.
interface OrderPlacedPayload {
  orderId: string;
  orderNumber: string;
  // ...existing fields unchanged
  loyaltyPointsEarned?: number; // NEW, optional — old subscribers unaffected
}

// A genuinely breaking change (a field's TYPE changes, a field is
// removed, or the event's own meaning changes) publishes under a NEW
// event name, never a mutated old one:
enum DomainEvent {
  OrderPlaced = 'order.placed',
  OrderPlacedV2 = 'order.placed.v2', // published alongside OrderPlaced during migration, never replacing it silently
}
```

Both versions publish for a defined migration window; every subscriber
migrates to `OrderPlacedV2` on its own schedule; `OrderPlaced` (v1) is
retired only once `docs/index/cross/events.md`'s own generated listing
confirms zero remaining subscribers — a mechanical, checkable retirement
condition, never a guess.

## Scope lenses

Not applicable in full — this is a naming/versioning convention, not a
new mechanism; doc 100's own transactional-outbox scope lenses already
cover the delivery guarantee this convention rides on unchanged.

## Work orders

**WO-131.1 (documentation only)** — record this convention in
`core/events`'s own README/header comment, so the next genuinely-breaking
event change has a stated pattern to follow rather than an ad hoc
decision made under deadline pressure.
**WO-131.2 — extend doc 38's WO-38.5 contract-test suite** to flag when a
`*V2`-suffixed event's predecessor has zero remaining subscribers (per
the generated `docs/index/cross/events.md`), as a signal it's safe to
retire — an informational CI note, never a blocking failure.

## Acceptance

- No schema or runtime change — this document only names a convention.
- The next domain-event shape change that requires a break follows this
  naming pattern, checkable by review against this document.

## Out of scope

A generic event-schema-versioning framework (automatic upcasting,
schema-registry tooling) — doc 109 already declines the larger event-
sourcing commitment this would be a piece of; this document's own plain
naming convention is deliberately the smaller, sufficient answer.
