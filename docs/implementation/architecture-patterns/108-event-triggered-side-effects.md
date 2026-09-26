# 108 — "Fulfillment Complete triggers a 3PL webhook": the event hook is real; the outbound delivery mechanism is not built

> **Status: corrected (2026-09-26).** This document's original title and
> text claimed the full capability ("triggers a webhook") was "already doc
> 36's own worked mechanism" — verified false: `OutboundConnector` and
> `ConnectorDelivery` do not exist anywhere in `apps/api/src` or
> `apps/api/prisma`, and doc 36 itself carries no `Status:` note — it is
> an unbuilt proposal, its own schema block still marked "new:
> connectors.prisma." What is real: `DomainEvent.OrderStatusChanged`
> genuinely fires on every transition, including to `DELIVERED`, per
> `orders.service.ts`'s own `ALLOWED_TRANSITIONS` table (doc 106). What is
> not real: nothing today delivers that event as an outbound HTTP call to
> a 3PL or WMS endpoint — there is no generic outbound connector, and no
> bespoke 3PL/WMS subscriber has been built either. The capability the
> bullet actually asks for ("autonomously triggers a webhook") does not
> exist in this codebase today. Building doc 36's own `OutboundConnector`
> is separate, larger work and is not undertaken here.

"Attach independent, decoupled hooks to state transitions so that reaching
a 'Fulfillment Complete' state autonomously triggers a webhook to a
third-party logistics (3PL) provider or warehouse management system"
names a real, useful capability this repository has exactly half of: the
state-transition hook point is real (an event fires); the outbound
delivery half — turning that event into an HTTP call to an external
endpoint — is not built. This document states both honestly rather than
citing the unbuilt half as already composed.

## What is real today

A status transition to `DELIVERED` (this repository's own closest
equivalent to "Fulfillment Complete," per `orders.service.ts`'s own
`ALLOWED_TRANSITIONS` table) already fires `DomainEvent.OrderStatusChanged`
through the real transactional outbox (doc 100). Any *future* subscriber —
a generic outbound connector once doc 36 is built, or a narrower, bespoke
listener written for one specific 3PL/WMS integration — can react to this
event without any change to `OrdersService` itself. That hook point is the
one real, load-bearing fact this document can cite.

## What is not built

There is no mechanism today that turns `OrderStatusChanged` (or any other
domain event) into an outbound HTTP call to an arbitrary third-party
endpoint. Doc 36's own `OutboundConnector`/`ConnectorDelivery` schema,
which would provide exactly this generically, is a proposal only. Until
either that is built, or a specific 3PL/WMS partner's webhook contract is
known and a narrow, purpose-built subscriber is written for it, "Fulfillment
Complete triggers a 3PL webhook" is not something this repository can
actually do.

## Scope lenses

Deferred — no mechanism is built by this document. The event-publishing
half's own scope lenses are already covered where `OrderStatusChanged` is
itself documented; the outbound-delivery half's scope lenses belong to
whichever document eventually builds doc 36's connector or a bespoke
subscriber, not to this corrected coverage note.

## Work orders

None here. Either doc 36's own `OutboundConnector` (schema, dispatcher
extension, admin UI) is built as its own, separately-scoped work, or a
specific 3PL/WMS integration is written as a narrow, purpose-built
subscriber once a real partner and its webhook contract are known — never
a bespoke `3PLNotifier` class built ahead of a real integration, and never
assumed to already exist because this document names the pattern.

## Acceptance

- No schema or code change from this document.
- This document's own text makes no claim that outbound webhook delivery
  already works — only that the event hook point (`OrderStatusChanged`)
  does.

## Out of scope

Building doc 36's own generic outbound connector, or a bespoke 3PL/WMS
integration client — both are real, separate, larger work not undertaken
here; this document only corrects the record on what exists today.
