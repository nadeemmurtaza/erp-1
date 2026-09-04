# Contributing

The point of this codebase's structure is that **adding a feature means adding a
folder, not editing existing ones**. This document is how you do that.

## Layout

```
apps/
  api/       NestJS + Prisma + PostgreSQL — all business logic
    prisma/schema/     one .prisma file per module
    src/core/          the shared platform every module may use
    src/modules/       feature modules — add folders here
  web/       Next.js storefront + /admin back office
  mobile/    Expo app (phase 2)
packages/
  shared/    Zod schemas, measurement definitions, pricing maths
  config/    tsconfig and eslint presets
```

## Adding a module

Say you are adding `reviews`.

**1. Its data.** Create `apps/api/prisma/schema/reviews.prisma` with only the
models that module owns. Do not touch another module's file. Then:

```bash
pnpm --filter @yaseen/api db:migrate -- --name add_reviews
```

**2. Its code.** Create `apps/api/src/modules/reviews/` with the usual shape:

```
reviews/
  reviews.module.ts        the NestJS module
  reviews.service.ts       the public surface other modules may import
  reviews.controller.ts    HTTP routes
  dto/                     request validation — private to this module
  reviews.spec.ts          tests
```

**3. Register it.** Add one line to
`apps/api/src/modules/modules.registry.ts`:

```ts
{ name: 'reviews', module: ReviewsModule },
```

and add `reviews` to `MODULES` in `.env`. That is the whole wiring step.

## The rules that keep this working

**Modules do not import each other's internals.** A module may import another
module's `<name>.module` or a top-level `.service` — nothing else. No reaching
into `../orders/dto/…`. `pnpm boundaries` enforces this and CI runs it.

**Side effects go through domain events, not direct calls.** If placing an order
should now also award loyalty points, do not edit the orders module. Subscribe
to the event it already publishes:

```ts
@Injectable()
export class LoyaltySubscriber {
  @OnDomainEvent(DomainEvent.OrderPlaced)
  async handle(payload: OrderPlacedPayload) { … }
}
```

Events are published through the **transactional outbox**: `EventBusService.publish()`
takes the transaction client, so the event row is written in the same
transaction as the state change. Delivery is **at-least-once**, so every handler
must be idempotent — the same event can arrive twice after a retry.

**Business rules are data, not constants.** Shipping fees, the COD fee, stitching
lead times and measurement fields all live in the database and are edited from
the dashboard. If you are about to write `const SHIPPING_FEE = …`, add a setting
in `core/settings/settings.defaults.ts` instead.

**Anything that will have more than one implementation gets an interface.**
`PaymentProvider`, `StorageDriver`, `NotificationChannel`, `CourierProvider`.
Add the class, add its key to the relevant env allowlist, and no caller changes.

**Money is integer paisa.** Rs 3,499 is `349900`. Never a float, never a string.
Use `toMinor` / `formatMoney` from `@yaseen/shared`.

**Customer-facing text is never a column.** It is a `*Translation` row, one per
locale. Every product, category and garment needs both `en` and `ur`.

**Order lines are snapshots.** Name, price, measurements and stitching options
are copied onto the order at purchase and never joined back to the live product.

**The rules live in `@yaseen/shared`, and every app calls them.** Pricing,
measurement validation and phone normalisation are used by the API, the website
and the mobile app alike — a figure the phone accepts is one the API accepts,
because it is the same function. Never reimplement one of them in an app.

**The mobile app has its own message catalogue** (`apps/mobile/src/i18n/`),
because its screens differ from the website's. The domain words a customer sees
in both places — the stitching stages, the order statuses — must stay worded
identically; nobody should have to learn two vocabularies for one shop. There is
a test that keeps the two languages in step.

## Before you push

```bash
pnpm lint        # includes the module boundary check
pnpm typecheck
pnpm test
```

All three run in CI against a real Postgres, so a green local run is a green PR.

## Local setup

```bash
cp .env.example .env
docker compose up -d              # postgres, minio
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The seed prints the sign-in details for the admin, staff, tailor and customer
accounts.
