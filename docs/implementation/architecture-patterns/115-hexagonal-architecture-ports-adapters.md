# 115 — Ports and adapters: already the shape of every extension point this repository has, named formally for the first time

> **Status: corrected (2026-09-26).** This document's own mapping table
> cited `FiscalComplianceProvider`, `EdiTranslator` and `OutboundConnector`
> (with its `OAuth2TokenProvider`) as already-real ports, and
> `FbrProvider`/`PraProvider` as their adapters — verified false: none of
> these five exist anywhere in `apps/api/src`, and their originating
> documents (15, 18, 36) carry no `Status:` note — all are unbuilt
> proposals. `PaymentProvider`, `StorageDriver`, `AiProvider`,
> `NotificationChannel`, `VectorStore` and their adapters
> (`StripeProvider`, an `S3StorageDriver`, `EmailChannel`/`SmsChannel`)
> are all verified real. The corrected table below cites only what
> exists; this document's own thesis (the repository already has the
> hexagonal shape, informally) stands on those five ports alone.

"Separate your core domain and business logic entirely from the
presentation layer and the external infrastructure layer. Define explicit
contracts (Ports) that dictate what the application can do, and utilize
Adapters at the system edges to translate these contracts into specific
HTTP requests, database queries, or external tool calls. Ensure the
application layer remains completely unaware of whether it is being
triggered by a traditional web frontend, a REST API endpoint, or an
autonomous voice agent" is the formal academic name — Hexagonal
Architecture — for a pattern this repository has already independently
arrived at, module by module, cited under a different name in doc 36:
**"Every external system this repository has ever integrated with fits
one of three shapes... write a typed interface once a real, repeated need
exists."**

## The mapping, made explicit

| Hexagonal term | This repository's own equivalent |
|---|---|
| **Port** (a contract the domain defines) | `PaymentProvider`, `StorageDriver`, `AiProvider`, `NotificationChannel`, `VectorStore` — every one of these is a TypeScript interface the *domain* (a service) defines and calls, never a concrete implementation the service imports directly |
| **Adapter** (a concrete implementation at the edge) | `StripeProvider`, an `S3StorageDriver`, `EmailChannel`/`SmsChannel` — each a class implementing its own port, registered rather than hardcoded, exactly `MULTI-SECTOR.md`'s own "adding a provider is a new class, never a rewrite of a caller" |
| **The application core, trigger-agnostic** | A NestJS service method — `OrdersService.createFromPos()`, `AnalyticsService.summary()` — is called identically whether the caller is `OrdersController` (HTTP), a domain-event subscriber, or a future MCP tool adapter (doc 116) — the service itself never branches on "who called me" |
| **Driving vs. driven adapters** | A NestJS `Controller` (HTTP in) and a `PaymentProvider` implementation (payment gateway out) are exactly hexagonal architecture's own "driving" (primary) and "driven" (secondary) adapter kinds, already structurally separate in this codebase's own `controller`/`service`/`provider` layering |

"The application layer remains completely unaware of whether it is being
triggered by a traditional web frontend, a REST API endpoint, or an
autonomous voice agent" is already true for every service method in this
repository: `OrdersService` has no idea whether its caller is
`OrdersController`, a cron job, or (per doc 116) a future MCP tool
adapter — it receives typed arguments and returns a typed result, exactly
hexagonal architecture's own core promise.

## What this document adds: naming, not architecture

This repository did not need to adopt "Hexagonal Architecture" as a
capital-letter pattern to already have it — NestJS's own dependency-
injection model plus this repository's own "extension point, never a
hard import" discipline (`CLAUDE.md`'s own module-independence rule)
produces the identical shape. This document's only contribution is
naming the correspondence explicitly, so a future contributor familiar
with the formal pattern recognizes it immediately rather than
rediscovering it module by module.

## Scope lenses

Not repeated — every cited port/adapter pair that actually exists already
carries its own complete scope-lens treatment in its own originating
document (the payment/storage/AI/notification/vector-store provider
interfaces cited above).

## Work orders

None. This document is a naming exercise; the architecture it names is
already fully built.

## Acceptance

- No schema or code change — verified by citation to the five existing
  provider/adapter interfaces above and the controller/service/provider
  layering already used throughout `apps/api`.

## Out of scope

A formal refactor renaming existing interfaces to use "Port"/"Adapter"
terminology — no functional benefit; the pattern is already correctly
implemented under this repository's own existing names.
