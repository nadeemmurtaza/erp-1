# 108 — "Fulfillment Complete triggers a 3PL webhook": already doc 36's own worked mechanism

"Attach independent, decoupled hooks to state transitions so that reaching
a 'Fulfillment Complete' state autonomously triggers a webhook to a
third-party logistics (3PL) provider or warehouse management system" is,
mechanism for mechanism, doc 36's `OutboundConnector` (cited again this
batch at doc 102 for n8n) combined with the state-transition events
`OrdersService`'s own `ALLOWED_TRANSITIONS` (doc 106) already publishes.
A status transition to `DELIVERED` (this repository's own closest
equivalent to "Fulfillment Complete," per `orders.service.ts`'s own
`ALLOWED_TRANSITIONS` table) already fires `DomainEvent.OrderStatusChanged`
— doc 36's `OutboundConnector.subscribedEvents` already lists exactly this
kind of domain event as its trigger, delivering to any `targetUrl`
(a 3PL's own webhook endpoint, a WMS's own ingest URL) through the
identical retried, templated delivery mechanism doc 102 already cites for
n8n.

## The mapping, stated once

```
Order transitions to DELIVERED
  → DomainEvent.OrderStatusChanged published (existing, unchanged)
  → OutboundConnector with subscribedEvents including OrderStatusChanged (doc 36)
  → payloadTemplate maps the canonical event onto whatever shape the 3PL/WMS expects
  → HTTP POST to targetUrl, retried on failure via the same OutboxDispatcher backoff (doc 100)
```

No new mechanism — this is doc 36's own outbound connector, doc 106's own
state-transition events, and doc 100's own event-driven architecture,
composed exactly as each already specifies independently.

## Scope lenses

Not repeated — doc 36's own scope lenses already answer every lens for
this exact composition; this document introduces nothing new.

## Work orders

None beyond doc 36's own already-specified work orders (schema, dispatcher
extension, admin UI). A specific 3PL/WMS integration is configured as an
`OutboundConnector` row once a real partner and its webhook contract are
known — never a bespoke `3PLNotifier` class built ahead of a real
integration.

## Acceptance

- No new schema beyond doc 36's own `OutboundConnector`/
  `ConnectorDelivery`.
- A connector subscribed to `OrderStatusChanged` fires exactly once per
  qualifying transition, retried on failure per doc 36's own existing
  backoff policy.

## Out of scope

A bespoke, hardcoded 3PL/WMS integration client — doc 36's generic,
template-driven connector already serves any such target identically to
n8n or Zapier; a dedicated typed client is only worth building per doc
36's own stated rule ("write a typed interface once a real, repeated need
exists") if one specific 3PL relationship becomes stable and heavily used
enough to justify it.
