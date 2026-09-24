# 120 — Decoupled integration engines: the third citation of doc 36 in two batches

"Utilize externalized hyperautomation workflows to visually map and adapt
third-party API connections, isolating your primary system from external
service deprecations or sudden API version changes" is, for a third time
across this document set (doc 36 itself, doc 102's n8n note, doc 108's
3PL-webhook composition), doc 36's own `OutboundConnector` mechanism. This
document adds one piece of reasoning not yet stated explicitly: **why the
connector pattern itself already delivers "isolation from external
service deprecations," not just "a way to call external services."**

## Why `OutboundConnector` already isolates this repository from a third party's own breaking changes

`OutboundConnector.payloadTemplate` is the isolation boundary: this
repository's own domain events (`OrderStatusChanged`, `OrderPlaced`)
never change shape to accommodate a specific external vendor's API — the
*template* is what maps the canonical event onto whatever shape a given
vendor's API version expects. When a vendor deprecates a field or ships a
breaking API version, the fix is a `payloadTemplate` edit on the affected
`OutboundConnector` row — a configuration change, never a code change to
`OrdersService` or any other domain service, and never a change that
could affect any *other* connector subscribed to the same event. This is
doc 18's own canonical-JSON reasoning (doc 103's own citation, "prevents
vendor lock-in"), restated for outbound integrations instead of inbound
trading partners — the identical shape, both directions.

## Scope lenses

Not repeated — doc 36's own scope lenses already answer every lens for
this exact mechanism.

## Work orders

None beyond doc 36's own already-specified work orders. This document
adds no new schema or mechanism.

## Acceptance

- No schema or code change — verified by citation to doc 36's existing
  `payloadTemplate` design and doc 18/103's own vendor-lock-in reasoning.

## Out of scope

Nothing further — this domain has no remaining gap; this note exists so
this batch's own "Infrastructure Portability" heading has a citable
answer, since the underlying mechanism (doc 36) does not change with the
promotional framing.
