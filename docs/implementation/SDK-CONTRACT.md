# SDK contract — building a pack against this platform without touching core

`resilience-scalability/37-scalability-future-upgrades.md` §3 (WO-37.4). This
is the actual, published reference a client's own development team or a
third-party vendor reads before writing a sector pack against this
codebase — the contract `scripts/check-module-boundaries.mjs` already
enforces internally, restated here as a real interface rather than left as
tribal knowledge encoded only in a lint script.

**The rule, in one sentence:** a pack may depend on any `core` extension
point or subscribe to any stable domain event; it may never import another
pack's internals; and it never self-registers — `module-packs.ts` and
`modules.registry.ts` stay in this repository, so a pack *proposes*, this
repository's own admin *decides*. See `MULTI-SECTOR.md` for the full
reasoning; this document exists to be the checklist and reference table, not
to re-argue it.

**A pack is never a third-party app, and a third-party app is never a pack**
(`DECISIONS.md` ADR-073). "A third-party vendor" above means a vendor
contracted to contribute a pack through this repository's own review and
deployment. It never means a developer submitting to the App Directory. A
directory app is always a remote service NEWAX calls and is called by over
HTTP, and nothing from it runs in any NEWAX process —
[`integrations-connectivity/184-app-platform-overview-and-remote-only-decision.md`](./integrations-connectivity/184-app-platform-overview-and-remote-only-decision.md)
§2. No pack is ever registered from directory data.

## 1. The extension-point interfaces

Each one is a stable seam: implement the interface, register the new class
where its own module already lists implementations, add its key to the
relevant env allowlist. Nothing else in the codebase changes — no core file
is edited to add a fifth payment provider or a third AI vendor.

### `PaymentProvider` — `apps/api/src/modules/payments/payment-provider.ts`

```ts
interface PaymentProvider {
  readonly key: string; // matches the PAYMENT_PROVIDERS allowlist
  readonly labelEn: string;
  readonly labelUr: string;
  readonly descriptionEn: string;
  readonly descriptionUr: string;
  readonly requiresCode?: boolean;
  initiate(ctx: PaymentContext): Promise<PaymentInitiation>;
  handleCallback(payload: unknown, headers: Record<string, string>): Promise<PaymentCallbackResult>;
}
```

`PaymentContext` carries the order amount (paisa), customer contact detail,
and optionally `contactId`/`purchaseOrderReference` for a B2B buyer.
`PaymentCallbackResult.verified` must be `false` whenever the callback did
not prove it came from the gateway (a bad or missing signature) — the
service refuses an unverified callback outright and writes nothing, in
either direction.

### `AiProvider` — `apps/api/src/core/ai/ai-provider.ts`

```ts
interface AiProvider {
  readonly key: string; // matches the AI_PROVIDERS allowlist
  readonly supportsEmbeddings: boolean;
  readonly supportsVision: boolean;
  complete(input: CompletionInput): Promise<CompletionResult>;
  embed?(texts: string[]): Promise<EmbeddingResult>;
  describeImage?(imageUrl: string, prompt: string): Promise<DescribeImageResult>;
}
```

Never called directly by a pack — every call goes through `AiService`,
which enforces the two rules that govern this entire layer: every call is
logged against `AiUsageLog` (cost/tokens) and stopped once the monthly
budget is spent, and every call has a timeout with the pre-AI behaviour as
its own fallback. A pack that needs an AI capability calls `AiService`, and
runs correctly with the AI layer entirely absent — CLAUDE.md's own "AI-driven
means every capability sits behind an interface it can be built and shipped
without" applies to a pack exactly as it applies to core.

### `NotificationChannel` — `apps/api/src/core/notifications/notification-channel.ts`

```ts
interface NotificationChannel {
  readonly name: string;
  supports(message: NotificationMessage): boolean; // has a phone, an email…
  send(message: NotificationMessage): Promise<void>;
}
```

`NotificationMessage.template` is a string key ("order.confirmed"), never a
literal subject/body baked into a pack — the same "no hardcoded copy" rule
Law 1 states for application code generally.

### `StorageDriver` — `apps/api/src/core/storage/storage.driver.ts`

```ts
interface StorageDriver {
  readonly name: string;
  put(input: PutFileInput): Promise<StoredFile>;
  delete(key: string): Promise<void>;
  urlFor(key: string): string;
  get(key: string): Promise<Buffer>;
  signedUrlFor(key: string, expiresInSeconds: number): Promise<string>;
}
```

### `VectorStore` — `apps/api/src/modules/rag/vector-store.ts`

```ts
interface VectorStore {
  upsertChunks(chunks: DocumentChunkInput[]): Promise<void>;
  query(embedding: number[], filter: VectorQueryFilter, topK: number): Promise<VectorQueryHit[]>;
}
```

`filter` is applied as a predicate INSIDE the query, never a post-filter —
a pack implementing a second vector backend must honor that or a
cross-organization document leak is one query away.

### `FeatureFlagsService.isEnabled()` — `apps/api/src/core/feature-flags/feature-flags.service.ts`

Not an extension point a pack implements, but one every pack may call: `isEnabled(key, organizationId): Promise<boolean>`
lets a pack stage its own new capability the same way core does — see
37-scalability-future-upgrades.md §2. A pack never reads `FeatureFlag` rows
directly; it goes through this service, exactly the "one writer per
invariant" rule the platform already applies to stock.

## 2. The domain-event catalogue's stable subset

The full catalogue lives in `apps/api/src/core/events/domain-events.ts`,
whose own header already states the versioning rule an external integrator
must know: **adding a field to an event's payload is never a version bump**
(every subscriber already ignores a field it does not destructure); a
genuinely breaking change (a field's type changes, a field is removed, the
event's own meaning changes) publishes under a **new name**
(`OrderPlaced` → `OrderPlacedV2`) alongside the original for a defined
migration window, never a silent mutation of the existing one.

Below is a judged subset — not the whole enum, because not every event is
equally safe to build a pack against long-term. Two worked examples, then
the table:

- **`order.placed` is safe.** It is this platform's oldest, most-subscribed
  event (loyalty, CRM, replication, analytics, fulfilment all already
  depend on its shape), which is exactly the pressure that keeps a payload
  additive-only in practice — nobody can afford to break it. `example-hello-
  world-pack` (§3 below) is built against this one for that reason.
- **`user.sso_user_provisioned` is NOT safe yet.** Its own doc comment in
  `domain-events.ts` says so directly: "Recorded; nothing subscribes yet."
  An event with zero internal subscribers has never been pressure-tested
  against a real consumer's expectations — its shape could still change the
  first time this repository itself needs to react to it.

| Event | Safe to build against long-term? | Why |
|---|---|---|
| `order.placed` | Yes | Oldest, most-subscribed event in the catalogue; effectively frozen by its own internal consumers. |
| `order.status_changed` | Yes | Drives fulfilment, notifications and replication already; a status enum is a stable, documented shape. |
| `order.cancelled` | Yes | Same reasoning as the two above — a terminal state every consumer already depends on. |
| `payment.succeeded` / `payment.failed` / `payment.refunded` | Yes | The financial event trio every `PaymentProvider` already publishes through; changing their shape would break checkout itself. |
| `catalog.product_published` | Yes | Fires once, on the documented transition (`DRAFT`→`ACTIVE`) — a narrow, stable contract by its own doc comment. |
| `catalog.product_price_changed` | Yes | Narrowly scoped (fires only on an actual `basePrice` change) and already load-bearing for pricing/analytics subscribers. |
| `inventory.stock_replenished` | Yes | The one signal an "unblock a waiting order line" subscriber needs — stable because `InventoryService.move()` is the one writer of it. |
| `purchasing.goods_received` | Yes | Backs `SupplierResilienceService`'s own lead-time observations (doc 144) — an external supplier-integration pack has a real reason to build on this. |
| `fulfilment.shipment_status_changed` | Yes | Drives customer notifications and RTO tracking already; a stable status shape. |
| `user.registered` | Yes | Long-standing, drives CRM contact creation; stable payload (id, email, name). |
| `user.sso_user_provisioned` | No | Its own doc comment: "nothing subscribes yet" — unpressure-tested, could still change shape. |
| `notification.sent` | No | Generic internal delivery-log fact, not a business event a pack should react to — react to the business event that CAUSED the notification instead. |
| `analytics.supplier_digest_ready` | No | An internal scheduling signal for one specific digest cron, not a general-purpose fact. |
| `finance.order_economics_computed` | No | A derived/recomputable internal figure (doc 4's own margin engine); its computation method is expected to change as the engine matures. |
| `email.reply_received` | No | An internal CRM-inbox mechanic, not a stable business fact — its shape is tied to the inbox implementation, not a domain concept. |

When in doubt, prefer subscribing to an event with multiple existing
internal subscribers over one with zero — the same signal the two worked
examples above use.

## 3. The module-registration checklist

`MULTI-SECTOR.md`'s own "Adding a new sector" section is the document of
record; restated here only as the checklist an external team runs, in order:

1. Decide what is genuinely sector-specific. If the answer is "products,
   orders, stock and customers," no new module is needed — a `MODULES`
   entry and some settings are enough.
2. For each thing that really is specific: a folder under
   `apps/api/src/modules/<name>/`, its own `prisma/schema/<name>.prisma`
   (additive only, forward-only migrations, never touching a `core` table),
   one line in `modules.registry.ts`, one entry in every `.env*.example`
   file's `# Available:` line (`scripts/check-env-templates.mjs` fails the
   build otherwise).
3. Add the module to `MODULE_PACKS` (`module-packs.ts`) under the new pack
   name — never `'core'`.
4. Add the pack name to the `PackName` union in the same file.
5. Wire the pack to core through domain events or an extension point only.
   Wanting to import a core service and change it is the signal an
   extension point is missing from core — that gap gets filed as its own
   work order against core, never worked around with a direct import.
6. Deploy with the new `MODULES` value. Never a new git branch (`CLAUDE.md`'s
   "One `main`, one `production`").

**The test that the seam held:** switch the new pack off in `MODULES`, boot
the API, and confirm the shop still works end to end. `example-hello-world-
pack` below is built and lint-checked as exactly this proof, permanently, in
CI — not a one-time manual check.

## 4. The reference pack — proof, not prose

`apps/api/src/modules/example-hello-world-pack/` is a real, minimal pack
built strictly to this document: `HelloWorldListener` subscribes to
`DomainEvent.OrderPlaced` (§2 above — deliberately the safest, most-
pressure-tested event in the catalogue) through `@OnDomainEvent`, logs one
line, and does nothing else — no database table, no controller, no import
of any other module's internals. It is registered:

- In `module-packs.ts` under its own pack name, `'example'` — never
  `'core'` — so `check-module-boundaries.mjs`'s DIRECTION rule ("a pack
  module may never import another pack's module") actually applies to it,
  the same as it would to a real third-party sector pack.
- In `modules.registry.ts` with `offByDefault: true` — a demonstration,
  never enabled in a real client's `MODULES=` list, discoverable on every
  `.env*.example` template's `# Available:` line per
  `check-env-templates.mjs`'s own discoverability rule.

Its name says what it is: a genuine "hello world," never mistaken for
production scope. `pnpm lint` (which runs `check-module-boundaries.mjs`)
passing with this pack present, and zero edits to any core module file to
add it, is doc 37's own stated acceptance criterion for WO-37.4 — verified
on every commit that touches it, not asserted once and left to rot.
