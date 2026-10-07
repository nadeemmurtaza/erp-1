# ADR-054 — Doc 139 (WebSocket/SSE gateway) verified, deliberately left unbuilt; doc 157 (client `Idempotency-Key`) built, with `organizationId` dropped per ADR-044/040 and the sketch's non-atomic race guard corrected

[← Decision log](../DECISIONS.md)


### Context

Two more architecture-patterns documents needed inspection: doc 139 (a
WebSocket/SSE transport, proposed as a second front door onto doc 135's
`IntentRouter`, for a future agent/voice-session caller) and doc 157 (a
client-supplied `Idempotency-Key`, closing the one gap doc 117's own
domain-key strategy structurally cannot reach — the moment before a row
exists to key against, i.e. creating it in the first place).

### Decision — doc 139: verified, not built

`IntentRouterService` (`core/intent/intent-router.service.ts`) exists
exactly as doc 135 and doc 139 both assume — `register()`/`route()`/
`list()`, reusing `decideApiKeyAccess` so it can never drift from
`PermissionsGuard`'s own HTTP-path enforcement. No WebSocket/SSE dependency
(`@nestjs/websockets`, `@nestjs/platform-ws`, `socket.io`, `ws`) appears in
`apps/api/package.json`, and no gateway file exists anywhere in
`apps/api/src`. Doc 139's own WO-139.1 is explicit that `AgentSessionGateway`
is "named future work, scoped now, built once a real agent/voice integration
requirement exists" — no such requirement exists in this codebase today, so
building it now would be exactly the speculative functionality CLAUDE.md's
"No speculative functionality" section forbids, matching the identical
reasoning ADR-052 already applied to doc 128's deferred
`ShippingCarrier.getRate()`. Doc 139 is marked verified with no code change.

### Decision — doc 157: built, with three corrections to its own sketch

`IdempotencyKey` (Prisma model, `IdempotencyKeyStatus` enum),
`IdempotencyInterceptor` + `@IdempotentWrite(scope)` (registered globally
via `APP_INTERCEPTOR`, a no-op on any route without the decorator), and
`IdempotencyCron` (a nightly purge of `COMPLETED` rows older than 7 days,
plus a 5-minute-interval reaper for rows stuck `IN_PROGRESS` past 60
minutes — a crashed handler). Applied to the five routes the document names:
`orders.place` (`OrdersController.place()` — the document's own citation of
`.create()` does not exist), `pos.sale.create`
(`POST /admin/pos/shifts/:id/sales`), `fulfilment.shipment.create`
(`POST /admin/fulfilment/shipments` — the document's own citation of
`/orders/:id/shipments` does not exist), `wallet.purchase`
(`POST /wallet/purchase`), and `instalment.payment.record`
(`POST /admin/orders/:orderId/instalments/payments`).

Three corrections to the document's own sketch, each found by checking its
claims against the live codebase before writing code (the same discipline
ADR-052 established):

1. **No `organizationId`**, per ADR-044/ADR-040 — this deployment IS the
   tenant. The sketch's schema and its `req.user.organizationId` read
   cannot work: `OrdersController.place()`, the primary guarded route, is
   `@Public()` with `user?: AuthenticatedUser | undefined` (guest checkout,
   frequently no user at all), and no `AuthenticatedUser` in this codebase
   carries an `organizationId`. The shipped unique constraint is
   `(scope, key)` alone — already correct for a single-tenant deployment,
   the same correction repeated on `EntityAttribute`, `FormMetadata`,
   `MicroFrontendFragment` and `BpmnWorkflowDefinition` earlier this batch.
2. **The sketch's own race guard was not atomic.** Its
   `findUnique()`-then-`create()` sequence has a real TOCTOU gap under true
   concurrency. The shipped interceptor wraps `create()` in try/catch for
   Prisma's `P2002` unique-violation code instead, treating a genuine race
   as a 409 — correctly implementing the sketch's own stated intent ("the
   `@@unique` constraint is the actual race guard"), proven by
   `idempotency-key.constraint.spec.ts`'s real-database
   `Promise.allSettled` test issuing two truly concurrent creates for the
   identical `(scope, key)`.
3. **Real status-code recovery.** `Reflector.get(HTTP_CODE_METADATA, ...)`
   recovers each guarded route's actual configured status (defaulting to
   Nest's own 201 for `POST`) for a replayed response, rather than the
   sketch's hardcoded 200.

WO-157.5 (client changes) shipped as part of this same work, not deferred:
making the header required with no client update would have broken real
checkout, POS sales, and the two admin actions in production the moment
this merged. `apps/web`'s checkout page generates one key per checkout
attempt (a `useRef`, resent unchanged on retry); the admin "add tracking"
and "record instalment payment" actions do the same, the latter keyed to
the payment dialog's own open/close lifecycle; `apps/pos`'s till sale
generates its key *before* the first network attempt (not after a
failure), so if that attempt actually reaches the server but the response
is lost, the outbox-sync retry — which reuses the queued entry's own `id`
as the same key, per doc 157's own §2 — replays the recorded sale instead
of ringing it up twice. `wallet.purchase` has no client call site anywhere
in this codebase (the wallet module ships off by default per doc 155, with
no purchase UI built yet), so no client fix was needed there.

Seven pre-existing e2e suites that place orders
(`crm`, `customer-portal`, `giftkarta-checkout`, `orders`,
`payments-gateway`, `promotions-checkout`, `stitching`) needed a
`randomUUID()` `Idempotency-Key` header added to every `POST /orders` call
site once the header became required; all were fixed and re-verified
passing. `orders.e2e-spec.ts` gained a dedicated `idempotency
(Idempotency-Key)` block covering all four of doc 157's own acceptance
criteria plus the missing-header case.

### Reasoning

Doc 139 is the same lesson as ADR-052's doc 128 in miniature: a document
naming its own future work honestly, with a real gating condition
("once a real agent/voice integration requirement exists"), is verified
against that condition rather than built speculatively against it. Doc
157's `organizationId` correction is this batch's now-standard fix — the
sketch pattern of adding a tenant column reflexively, before checking
whether any caller of the guarded route even has one, keeps recurring
across independently-written documents, and keeps getting caught the same
way: read the actual controller and its actual `AuthenticatedUser` type
before writing the schema.

### Consequences

- Doc 139 is confirmed current — a future reader does not re-verify
  `IntentRouterService`'s existence, and does not build `AgentSessionGateway`
  without first confirming a real agent/voice caller exists to justify it.
- A double-tap on checkout, a POS terminal that times out and retries, or
  doc 48's offline-sync replay of a queued sale now collapses to one real
  `Order` row instead of two, across all five named routes.
- Every real client in this codebase that calls a now-guarded route was
  updated in the same change — the feature is reachable end to end, not
  backend-only.
- `AdminRequestOptions` (`apps/web/src/lib/admin-client.ts`) gained a
  generic `headers` passthrough, reusable by any future guarded admin
  action, not just these two.

### Status
**Accepted.**
