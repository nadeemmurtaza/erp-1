# 157 — Preventing the double transaction: a client `Idempotency-Key`, closing the one gap doc 117's domain keys structurally cannot reach

> **Status: shipped, 2026-09-26.** Built with five corrections to this
> document's own sketch, found while verifying its claims against the live
> codebase before writing code:
> 1. **No `organizationId`** (ADR-044/ADR-040 — this deployment IS the
>    tenant). The sketch's `IdempotencyKey.organizationId` and its
>    `req.user.organizationId` read cannot work: the primary guarded route
>    (`OrdersController`'s real `place()` method) is `@Public()` with
>    `user?: AuthenticatedUser | undefined` — guest checkout, frequently no
>    user at all — and no `AuthenticatedUser` in this codebase carries an
>    `organizationId`. The unique constraint is `(scope, key)` alone, which
>    is already correct for a single-tenant deployment.
> 2. **Corrected route names.** `OrdersController.create()` does not exist —
>    the real guest-checkout method is `place()`. `POST /orders/:id/shipments`
>    does not exist — the real route is `POST /admin/fulfilment/shipments`
>    (body-carried `orderId`, not a path param).
> 3. **The sketch's race guard was not actually atomic.** Its own
>    `findUnique()`-then-`create()` sequence has a real TOCTOU gap under true
>    concurrency; the shipped `IdempotencyInterceptor` instead wraps
>    `create()` in try/catch for Prisma's `P2002` unique-violation code,
>    treating a genuine race as a 409 — realizing the sketch's own stated
>    intent ("the `@@unique` constraint is the actual race guard") correctly.
>    Proven by `idempotency-key.constraint.spec.ts`'s real-DB
>    `Promise.allSettled` test.
> 4. **Real status-code recovery for replay.** `Reflector.get(HTTP_CODE_METADATA, ...)`
>    recovers each route's actual configured status (defaulting to Nest's own
>    201 for POST), rather than assuming 200 as the sketch did — so a replay
>    carries the same status the original response did.
> 5. **WO-157.5 (client changes) is not optional scaffolding — it shipped.**
>    Making the header required with no client changes would have broken
>    real checkout in production the moment this merged. `apps/web`'s
>    checkout page, the admin "add tracking" and "record instalment payment"
>    actions, and `apps/pos`'s till sale (both the immediate attempt and the
>    outbox-sync retry, sharing one key generated *before* the first attempt
>    so a lost response replays instead of duplicating) all now send
>    `Idempotency-Key`. `wallet.purchase` has no client call site anywhere in
>    this codebase — the wallet module ships off by default (doc 155) with
>    no purchase UI built yet — so nothing there needed a client fix.
>
> All 5 guarded routes verified end to end in `orders.e2e-spec.ts`'s own
> `idempotency (Idempotency-Key)` block, plus the 7 pre-existing e2e suites
> that place orders, updated to send the now-required header. See
> `DECISIONS.md` ADR-053.

**Idempotency**, stated the way it was put to me: an operation that can be
applied more than once without changing the result beyond the first
application — the elevator button that stays "called" no matter how many
extra times it's pressed. This repository already has a real, working
answer to that for one whole class of write — but not for all of them,
and the gap is a specific, confirmed one, not a vague concern.

## What already exists — and exactly why it can't cover this case

Doc 117 already answers "how does this repository stay idempotent"
in full, and its own worked table is real: `OrderEconomics` upserts on
`orderId`, `BulletinAcknowledgement` is unique on
`(bulletinId, employeeId)`, `findPostedEntry(source, sourceRef)` guards
every GL posting. Every one of those works because **the row already
exists** — a second `OrderStatusChanged` for the same order has an
`orderId` to key on. That mechanism cannot, structurally, protect the one
moment there is no existing row to key against yet: **creating the order
in the first place.**

Confirmed by reading the code: `OrdersController.create()`
(`orders.controller.ts:37`, a bare `@Post()`) takes an order-creation DTO
and calls straight through to `OrdersService.create()` — no client-
supplied identifier, no lookup for "have I seen this exact request
before," nothing. A double-tap on a checkout button, a POS terminal that
times out waiting for a response and retries the same sale, or a mobile
app's own automatic retry-on-flaky-network (doc 48's offline desktop node
queuing a sale for later sync is the sharpest version of this) all hit
this endpoint twice for what is, in the real world, **one** transaction —
and today, that means two real orders, two real stock decrements through
`InventoryService.move()`, and potentially two real payment captures.
This is the literal "double transaction" this document exists to close.

## The mechanism: a client-supplied key, checked before the write ever runs

```prisma
// core.prisma — additive
enum IdempotencyKeyStatus {
  IN_PROGRESS
  COMPLETED
}

model IdempotencyKey {
  id             String               @id @default(cuid())
  organizationId String
  scope          String               // "orders.create", "pos.sale.create" — one per guarded route
  key            String               // client-supplied, opaque
  requestHash    String               // sha256 of the request body — catches key reuse with a DIFFERENT payload
  status         IdempotencyKeyStatus @default(IN_PROGRESS)
  responseStatus Int?
  responseBody   Json?
  createdAt      DateTime             @default(now())
  completedAt    DateTime?

  @@unique([organizationId, scope, key])
  @@index([createdAt])   // cleanup sweep, §3
}
```

```ts
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const key = req.header('Idempotency-Key');
    const scope = Reflect.getMetadata(IDEMPOTENCY_SCOPE, ctx.getHandler());
    if (!scope) return next.handle();          // route not in the guarded allowlist — unchanged behaviour
    if (!key) throw new BadRequestException('Idempotency-Key header is required for this request.');

    const requestHash = sha256(JSON.stringify(req.body));
    const organizationId = req.user.organizationId;

    // The @@unique constraint is the actual race guard: two concurrent
    // requests with the same key both attempt this insert, and the
    // database — not application logic — lets exactly one through.
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { organizationId_scope_key: { organizationId, scope, key } },
    });

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException('This Idempotency-Key was already used with a different request body.');
      }
      if (existing.status === 'IN_PROGRESS') {
        throw new ConflictException('This request is already being processed.');
      }
      return of(new HttpResponse(existing.responseStatus!, existing.responseBody)); // replay, never re-execute
    }

    await this.prisma.idempotencyKey.create({
      data: { organizationId, scope, key, requestHash, status: 'IN_PROGRESS' },
    });

    try {
      const result = await firstValueFrom(next.handle());
      await this.prisma.idempotencyKey.update({
        where: { organizationId_scope_key: { organizationId, scope, key } },
        data: { status: 'COMPLETED', responseStatus: 200, responseBody: result as object, completedAt: new Date() },
      });
      return of(result);
    } catch (err) {
      // A genuine failure (validation error, declined payment) must stay
      // retryable under the SAME key — delete the row rather than caching
      // a failure forever.
      await this.prisma.idempotencyKey.delete({ where: { organizationId_scope_key: { organizationId, scope, key } } });
      throw err;
    }
  }
}
```

```ts
export const IDEMPOTENCY_SCOPE = Symbol('idempotency-scope');
export const IdempotentWrite = (scope: string) => SetMetadata(IDEMPOTENCY_SCOPE, scope);

// orders.controller.ts
@Post()
@IdempotentWrite('orders.create')
create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthenticatedUser) { /* unchanged */ }
```

The client (storefront checkout, the POS terminal, the mobile app)
generates one UUID **at the moment the user acts** — when the checkout
button is first tapped, or when a POS sale is first rung up offline —
and resends the identical key on every retry of that same action, never a
fresh one. This is the entire contract; nothing else about the request
changes.

## 1. Named allowlist, not a global behaviour change

`IdempotentWrite(scope)` is opt-in, per route — applied only where a
duplicate write is a real financial/stock fact, not everywhere:

| Route | Scope |
|---|---|
| `POST /orders` | `orders.create` |
| POS till sale creation (doc 31) | `pos.sale.create` |
| `POST /orders/:id/shipments` | `orders.shipment.create` |
| Doc 155's wallet `PURCHASE` | `wallet.purchase` |
| Doc 151's instalment payment recording | `instalment.payment.record` |

A `GET`, and any `PUT`/`PATCH` that is already idempotent by its own HTTP
semantics (replacing a row by its own existing id), needs none of this —
this document only closes the gap for `POST` requests that mint a new
fact with no pre-existing key to protect it, exactly where doc 117's own
domain-key strategy structurally cannot reach.

## 2. The offline case is the sharpest version of the same problem

Doc 48's offline desktop node queues a sale locally and syncs it later;
doc 30's field-attendance/geofencing case has the same shape for a
clock-in queued offline. Both already need a client-generated identifier
at the moment of the original action for their own sync/replay logic —
this document names the requirement explicitly: **that identifier is the
same `Idempotency-Key`**, generated once, at creation time on the device,
never regenerated on a later sync retry. A terminal that syncs the same
locally-queued sale twice (a real, named risk of any offline-first
design) collapses to one order, not two, for the identical reason a
double-tap does.

## 3. Cleanup — a key only needs to live as long as a client might retry

```ts
@Cron('0 3 * * *')
async purgeExpiredIdempotencyKeys(): Promise<void> {
  // 7 days comfortably exceeds any realistic offline-sync window (doc 48)
  // or client retry backoff; kept short because responseBody duplicates
  // data that already lives in the created Order/Sale row.
  await this.prisma.idempotencyKey.deleteMany({
    where: { createdAt: { lt: subDays(new Date(), 7) }, status: 'COMPLETED' },
  });
}
```

An `IN_PROGRESS` row is never swept by this job — one stuck at
`IN_PROGRESS` past a short timeout (say 60 seconds) means its own request
handler crashed without reaching the `catch` block; a separate, narrower
watchdog reaps only those, since a `COMPLETED` row still has a real cached
response worth serving for the full 7 days.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: `IdempotencyKey` carries no new actor;
it is scoped to whichever authenticated principal (`User`, `ApiClient`,
doc 48's own POS terminal identity) already calls the guarded route.
**Whose rows, and which columns** — `IdempotencyKey.organizationId` scopes
every lookup exactly as every other table in this repository already
requires; no cross-tenant key collision is possible by construction.
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — n/a: this is a request-deduplication mechanism, not an
authorization decision; it runs after `PermissionsGuard`, never in place
of it.
**Audience is a capability, not an address** — n/a: no notification of
its own.
**Request or record** — the interceptor's own write (`IdempotencyKey`
itself) is a REQUEST in the narrowest sense (refusable — key reuse with a
different body is refused with 409); the underlying business write it
guards keeps whatever classification its own document already gave it
(an order is a REQUEST, refusable on stock/payment grounds, unchanged).
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity** — n/a: this document adds no money or stock fact of its own; it
only prevents an existing one from being written twice.
**Dry run before live** — n/a: there is nothing to preview; the
interceptor either passes a request through once or replays an already-
computed response.
**Three silhouettes** — identical mechanism at all three editions; the
`organizationId` scope on the unique constraint is what makes it correct
unchanged at Organization scale, where many tenants' clients could
otherwise collide on the same UUID space.
**The absent collaborator** — n/a: `IdempotencyInterceptor` is core
infrastructure, not an optional module; a route with no `IdempotentWrite`
decorator behaves exactly as it does today, an explicit and visible
opt-in rather than a silent global change.
**The second copy of the write** — this document's own entire subject:
the two real moments named throughout (a UI double-tap; an offline
terminal replaying a queued sale on reconnect) and the mechanism — the
`@@unique([organizationId, scope, key])` constraint — making the second
attempt a replay, never a second insert.
**The hundred-thousandth row** — `IdempotencyKey.createdAt` is indexed for
the nightly purge; the table stays small by design, since completed rows
older than 7 days are deleted, never accumulated indefinitely.
**The reversal document / The undo fan-out** — n/a: this document
prevents an unwanted duplicate from being created at all; it is not a
mechanism for reversing one that already was.
**The version stamp** — n/a: an `IdempotencyKey`'s own behaviour never
changes retroactively; a key from before this document existed simply
never existed, and its route ran unguarded, as it always had.
**The erasure the ledger cannot obey** — `IdempotencyKey.responseBody` may
contain a customer's own order data; it is deleted by the 7-day purge
regardless of any later user-erasure request, so no separate erasure path
is needed for it specifically.
**The failure path** — a route's handler throwing deletes the
`IN_PROGRESS` row in the same `catch`, so a genuine failure is retryable
under the identical key rather than being permanently cached as stuck.

## Work orders

**WO-157.1 — schema**: `IdempotencyKey`, forward-only migration.
**WO-157.2 — `IdempotencyInterceptor`** + `IdempotentWrite()` decorator,
registered globally but a no-op on any route without the decorator.
**WO-157.3 — apply `@IdempotentWrite(...)`** to the routes named in §1's
table.
**WO-157.4 — the nightly purge cron** + a narrower, short-timeout watchdog
for rows stuck `IN_PROGRESS`.
**WO-157.5 — client changes**: `apps/web`'s checkout, `apps/pos`'s sale
submission, and doc 48's offline sync queue each generate one UUID per
logical action and resend it unchanged on every retry of that action.

## Acceptance

- Two concurrent `POST /orders` requests with the identical
  `Idempotency-Key` and body produce exactly one `Order` row, proven by a
  spec issuing both requests in parallel.
- The same key resent with a **different** body is refused with 409,
  proven by a spec.
- A request that fails mid-handler (e.g. a declined payment) can be
  retried under the same key and succeed, proven by a spec.
- A route with no `@IdempotentWrite()` decorator is entirely unaffected —
  no header required, no behaviour change.

## Out of scope

A generic idempotency requirement on every `POST` route in the API —
explicitly rejected as unnecessary ceremony for routes with no real
duplicate-write risk (an admin toggling a boolean flag gains nothing from
this and only adds friction); this document scopes the mechanism to
routes that mint a real financial or stock fact, per §1's own named
allowlist. Client SDK generation for the `Idempotency-Key` header — a
real but separate concern for doc 34's own API-client documentation, not
this document's own scope.
