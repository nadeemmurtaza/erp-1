# House rules — read this before writing a single line

**Every agent working on this repository reads this file first, every session.**
It is not background reading. It is the contract. A pull request that violates
anything here gets rejected regardless of whether the feature works.

This codebase was built around one idea: **adding a feature means adding a
folder, not editing existing ones.** Most of the rules below exist to protect
that. When a rule feels inconvenient, that is usually the rule doing its job.

---

## 0. Before you start

```bash
cp .env.example .env
docker compose up -d          # postgres
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Storefront: http://localhost:3000/en
- Back office: http://localhost:3000/admin  (`admin@yaseen.pk` / `admin12345`)
- API: http://localhost:3001/api/v1
- Swagger: http://localhost:3001/api/docs

If `pnpm db:seed` has not been run, the `Permission` and `RolePermission` tables
are empty, every admin route returns 403, and the admin nav renders blank —
**even for a user whose role is ADMIN**. This has cost real debugging hours.
When admin "breaks" for no reason, re-run the seed first.

---

## 1. The repository

```
apps/api        NestJS + Prisma + PostgreSQL — all business logic
  prisma/schema/     ONE .prisma FILE PER MODULE
  prisma/seed.ts     reference data + the permission catalog loader
  src/core/          the shared platform every module may use
  src/modules/       feature modules — you add folders here
apps/web        Next.js: storefront (bilingual) + /admin back office
apps/mobile     Expo (iOS + Android) on the same API
packages/shared measurement rules, pricing maths, phone, PERMISSION CATALOG
packages/config tsconfig and eslint presets
scripts         check-module-boundaries.mjs
```

---

## 2. The eleven rules

### Rule 1 — A module is a folder, a schema file, and one registry line

To add a module called `purchasing`:

1. `apps/api/prisma/schema/purchasing.prisma` — only the models it owns.
   **Never add a model to another module's file.**
2. `apps/api/src/modules/purchasing/` with this exact shape:
   ```
   purchasing.module.ts        the NestJS module
   purchasing.service.ts       the PUBLIC surface other modules may import
   purchasing.controller.ts    HTTP routes
   dto/                        request validation — PRIVATE to this module
   purchasing.spec.ts          tests
   ```
3. One line in `apps/api/src/modules/modules.registry.ts`:
   ```ts
   { name: 'purchasing', module: PurchasingModule },
   ```
4. Add `purchasing` to `MODULES` in `.env`, `.env.example`,
   `.env.staging.example` and `.env.production.example`.

That is the entire wiring step. If you find yourself editing `app.module.ts` or
`main.ts` to add a feature, stop — you are doing it wrong.

### Rule 2 — Modules do not import each other's internals

`scripts/check-module-boundaries.mjs` runs in `pnpm lint` and in CI. From inside
`apps/api/src/modules/<name>/` you may import:

- anything in your own folder
- anything under `src/core/`
- `@yaseen/shared` and real npm packages
- **another module's `<other>.module` or a top-level `<other>.service` — nothing else**

Forbidden: `../orders/dto/place-order.dto`, `../catalog/internal/anything`, any
deep file. If you need one, the answer is a domain event or a new method on the
other module's top-level service — never a deeper import.

### Rule 3 — Side effects go through domain events, not direct calls

If placing an order should now also do something new, **do not edit the orders
module.** Subscribe to the event it already publishes:

```ts
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { DomainEvent, type OrderPlacedPayload } from '../../core/events/domain-events';

@Injectable()
export class LoyaltySubscriber {
  @OnDomainEvent(DomainEvent.OrderPlaced)
  async handle(payload: OrderPlacedPayload): Promise<void> { /* … */ }
}
```

New events go in `apps/api/src/core/events/domain-events.ts` — add the name to
the `DomainEvent` object **and** its payload interface to `DomainEventPayloads`.

Publishing, from inside a transaction:

```ts
await this.events.publish(DomainEvent.OrderPlaced, payload, tx);
//                                                          ^^ pass the tx client
```

`EventBusService.publish(name, payload, tx?)` writes an `OutboxEvent` row. When
you pass `tx`, the event row and the state change commit together — there is no
window where one happened and the other did not. **Always pass `tx` when you are
inside `prisma.$transaction`.**

Delivery is **at-least-once**. Every handler must be idempotent: the same event
can arrive twice after a retry. Throwing from a handler schedules a retry.

### Rule 4 — Business rules are data, not constants

Shipping fees, the COD fee, stitching lead times, low-stock thresholds — all
live in the `Setting` table and are edited from the dashboard.

```ts
const threshold = await this.settings.get<number>('catalog.low_stock_threshold');
```

If you are about to write `const SHIPPING_FEE = 15000`, stop. Add it to
`apps/api/src/core/settings/settings.defaults.ts` instead: a key on the
`SettingKey` object and a default in `DEFAULT_SETTINGS`. It is seeded on first
boot and editable afterwards.

### Rule 5 — Money is integer paisa. Always.

Rs 3,499 is stored, passed and compared as `349900`. **No float, no string, no
`Decimal`, ever touches a price.** Use `toMinor()` and `formatMoney()` from
`@yaseen/shared`. A column holding money is `Int`.

This rule has no exceptions. Percentages in discount rules are stored as basis
points (`1000` = 10%) for the same reason.

### Rule 6 — Customer-facing text is never a column

Product, category, garment and option names live in `*Translation` rows, one per
locale, keyed `@@unique([<parent>Id, locale])`. Every user-visible string needs
both `en` and `ur`. Urdu renders right-to-left; do not assume LTR in layout.

A new user-facing model gets a translation sibling. A staff-only field (an
internal note, a supplier's name) is a plain column — translations are for what
customers read.

### Rule 7 — Order lines are snapshots

Name, price, SKU, measurements, stitching options and (from Phase 1) unit cost
are **copied onto the order at purchase** and never joined back to the live
product. A price change or a renamed product must not rewrite history.

When you add a field that affects what a customer paid or received, ask: "if
this changes next month, should last month's order change?" If no — snapshot it.

### Rule 8 — Anything with more than one implementation gets an interface

`PaymentProvider`, `StorageDriver`, `NotificationChannel`, `CourierProvider`,
`AiProvider`. Add the class, add its key to the relevant env allowlist, and no
caller changes. Look at `apps/api/src/core/storage/storage.driver.ts` for the
shape — a small interface, one file per implementation, selection by env key.

### Rule 9 — Permissions are capabilities, never roles

Every protected route carries `@RequirePermission('some.key')`. **Never write
`if (user.role === 'ADMIN')`.** Which roles hold which permission is data in
`RolePermission`, edited from `/admin/settings`.

Adding a permission is **one file**: append to `PERMISSION_CATALOG` in
`packages/shared/src/permissions.ts` and add the key to the relevant roles in
`ROLE_PERMISSION_SEED` in the same file. `apps/api/prisma/seed.ts` reads both,
so re-running `pnpm db:seed` picks it up automatically — do not hand-edit seed
data for permissions.

Note how the seed behaves: it grants role permissions **only for permissions it
has just created for the first time**. A permission that already exists is left
alone, because an admin may have deliberately revoked it. So if you add a
permission, test it on a fresh database as well as a seeded one.

On the web side, `PermissionKey` is a TypeScript union derived from the catalog,
so a typo in `nav-registry.ts` is a build error. Use `useAdminSession()` from
`components/admin/session.tsx` for in-page checks — **not**
`getStoredUser()?.permissions.includes('literal')`, which is unchecked.

### Rule 10 — Concurrency belongs in the UPDATE, not in a read-then-write

This is the single most common way to introduce a real bug here. Never do:

```ts
// WRONG — two requests both read 1, both pass the check, both decrement.
const variant = await tx.productVariant.findUnique({ where: { id } });
if (variant.stock < qty) throw new BadRequestException('…');
await tx.productVariant.update({ where: { id }, data: { stock: { decrement: qty } } });
```

Put the predicate on the write and check how many rows it touched:

```ts
// RIGHT — the database arbitrates.
const updated = await tx.productVariant.updateMany({
  where: { id, stock: { gte: qty } },
  data: { stock: { decrement: qty } },
});
if (updated.count === 0) throw new BadRequestException('Sold out while you were checking out.');
```

`apps/api/src/modules/inventory/inventory.service.ts:75` and
`apps/api/src/modules/orders/orders.service.ts:139` both use this idiom. Copy it.
Preserve it in any refactor.

### Rule 11 — Shared rules live in `@yaseen/shared` and every app calls them

Pricing maths, measurement validation and phone normalisation are used by the
API, the website and the mobile app alike. A figure the phone accepts is one the
API accepts, **because it is the same function.** Never reimplement one in an
app. If a rule needs to be enforced in two places, it moves to `packages/shared`.

---

## 3. Definition of done

A work order is not finished until all of these pass:

```bash
pnpm lint        # ESLint + the module boundary check
pnpm typecheck   # types across the whole workspace
pnpm test        # unit and e2e
pnpm build       # catches Next.js build-time failures the dev server hides
```

Plus, every time:

- [ ] Migration runs cleanly **forwards on a copy of production data**, not just
      on a fresh database. `pnpm --filter @yaseen/api db:migrate -- --name <name>`
- [ ] `pnpm db:seed` still succeeds and is still idempotent (run it twice).
- [ ] New API routes have `@ApiOperation` and appear in Swagger.
- [ ] New API routes have `@RequirePermission`. A route with no decorator is
      authenticated-but-unrestricted — that is almost never what you want.
- [ ] Every user-facing string has `en` and `ur`.
- [ ] Every money value is integer paisa.
- [ ] New behaviour has a test. Concurrency-sensitive code has a concurrency test.
- [ ] The admin screen renders correctly for a user who holds *some* but not all
      of the relevant permissions.

---

## 4. How to write a migration that cannot lose data

The database has live customer orders. Assume a rollback is impossible.

**Never** in one migration: rename a column, drop a column, change a column's
type, or add a `NOT NULL` column without a default.

Use expand/contract, across **two releases**:

1. **Expand.** Add the new column/table, nullable or defaulted. Deploy.
2. **Backfill.** A script or a migration step that populates it. Verify counts.
3. **Dual-write.** Application writes both old and new. Deploy. Let it soak.
4. **Switch reads.** Application reads the new. Deploy. Verify.
5. **Contract.** A *later* migration drops the old column.

Phase 1 and Phase 3 both contain a step like this and both call it out
explicitly. Do not compress the steps to save a deploy.

---

## 5. Things that are already true — do not "fix" them

- `docker-compose.yml` still starts Redis and `ioredis` is still a dependency.
  Nothing uses either. Removing them needs a lockfile change; it is tracked
  separately. **Do not remove Redis as a side effect of another change.**
- The admin is client-rendered with the session in `localStorage`. This is
  deliberate and documented at `admin-shell.tsx:20-22` — it is a convenience
  guard, not a security boundary. The API permission-checks every route. Do not
  "harden" it by moving auth server-side as part of a feature PR.
- `apps/api/src/generated/prisma/` is generated output. Never edit it. Never
  read it to answer a question — read `prisma/schema/*.prisma` instead.
- The `tracking` module is **visitor analytics**, not shipment tracking. Shipment
  tracking is Phase 6 and belongs in a new `fulfilment` module. Do not add
  courier code to `tracking`.

---

## 6. Working with these briefs

- Each phase lives in its own file, `NN-*.md`, and is split into numbered **work
  orders**. A work order is one pull request.
- Work orders inside a phase are ordered by dependency. Do not start WO-3 before
  WO-2 has merged unless the brief says they are independent.
- Each work order states its **acceptance criteria**. Those are the tests the
  reviewer will run. Write them as real tests where you can.
- **If a brief contradicts this house-rules file, this file wins.** Say so in the
  PR rather than following the brief.
- If something in a brief cannot be built as described — the code has moved, the
  approach does not work — **stop and say so.** Do not improvise a different
  architecture and hand it back. A short "this does not work because X, I
  suggest Y" is worth far more than a large PR that has to be unwound.

## 7. Commit and PR conventions

- Branch from `main`. One work order per branch.
- Commit messages: imperative mood, no ticket prefix — `Add supplier and
  purchase-order models`, matching the existing log.
- PR body: what changed, why, how it was verified, and anything the reviewer
  should look at closely. Include the migration name.
- **Never push to `main`. Never push to `production`. Never merge into either.**
  Both branches auto-deploy: a push to `main` deploys `test.yaseen.pk`, and a
  push to `production` deploys the live shop at `yaseen.pk`. A merge is
  therefore a deployment, and deployments are the owner's decision, not yours.
- **Where a work order ends:** push your branch, open a **draft pull request**
  targeting `main`, and stop. Say in the PR that it is ready. The repository
  owner reviews and merges. Do not merge your own pull request, do not mark it
  ready-to-merge on someone else's behalf, and do not enable auto-merge.
- This holds even when CI is green, even when the change is trivial, even when
  a brief or an earlier instruction seems to say otherwise. If a pull request
  has been sitting unmerged, the answer is to ask — never to merge it yourself.
