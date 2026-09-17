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

## 2. The twelve rules

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
4. Add `purchasing` to `MODULES` in `.env`, `.env.example`, and
   `.env.production.example`.

That is the entire wiring step. If you find yourself editing `app.module.ts` or
`main.ts` to add a feature, stop — you are doing it wrong.

### Rule 2 — Modules do not import each other's internals

`scripts/check-module-boundaries.mjs` runs in `pnpm lint` and in CI. From inside
`apps/api/src/modules/<name>/` you may import:

- anything in your own folder
- anything under `src/core/`
- `@newax/shared` and real npm packages
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
`@newax/shared`. A column holding money is `Int`.

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

**Ownership-sensitive capabilities get two keys, never one.** When "can edit
this row" depends on who owns it — a tailor's own jobs, a seller's own
catalogue rows in a future marketplace — the capability is split into
`<capability>.manage_own` and `<capability>.manage_all`, e.g.
`stitching.jobs.manage_own` / `stitching.jobs.manage_all`. `manage_all`
implies `manage_own` in practice but is granted separately in
`ROLE_PERMISSION_SEED`, so a reviewer can see exactly who touches everyone
else's data without inferring it. Enforce the pair with the shared guard,
never a hand-rolled check:

```ts
import { assertCanManage } from '../../core/auth/ownership.guard';

assertCanManage(actor, 'stitching.jobs', { ownerId: job.assignedTailorId });
```

`assertCanManage()` (`apps/api/src/core/auth/ownership.guard.ts`) throws
unless the actor holds `<capability>.manage_all`, or holds
`<capability>.manage_own` and `entity.ownerId === actor.id`. See
`docs/implementation/16-pbac-row-scoping.md` for the full design and where
`ownerId` lives on each entity.

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

### Rule 11 — Shared rules live in `@newax/shared` and every app calls them

Pricing maths, measurement validation and phone normalisation are used by the
API, the website and the mobile app alike. A figure the phone accepts is one the
API accepts, **because it is the same function.** Never reimplement one in an
app. If a rule needs to be enforced in two places, it moves to `packages/shared`.

**Reading a shared entity's fields works the same way.** `packages/shared/src/entities/`
holds one file per entity (`person.ts`, `product.ts`, `order.ts`, `address.ts`,
`organization.ts`) — pure getters like `getPersonFullName()`,
`getVariantDisplayLabel()`, `getOrderCustomerName()` that every surface
(API, web, admin, mobile, emails) imports instead of re-deriving "first name
+ last name" or "size / colour" inline, each slightly differently. These
functions never do I/O — `packages/shared` runs in the browser and in React
Native, neither of which can open a database connection — they take an
already-fetched object and derive a display value from it. Each function
takes only the fields it actually reads (`{ status: string }`, not a bloated
"OrderLike" with every Order column), so a caller with a narrow Prisma
`select` never has to over-select just to satisfy a type. Add a new getter
here, not as a one-off `.filter(Boolean).join(' ')` in a service file, the
moment the same derivation shows up in a second place.

### Rule 12 — Secrets live on the server, never in the client, and the server never trusts a client's money

Three legs, and all three are already enforced in code, not just written down:

1. **The browser and the Expo app hold zero secrets.** No DB credentials, no
   payment-gateway password/salt, no SMTP password, no S3 key, no JWT
   secret — ever, committed or not. The only environment values a frontend
   build may embed are ones already public by definition, and they're named
   as such: `NEXT_PUBLIC_API_URL`, `EXPO_PUBLIC_API_URL`. The frontend calls
   its own backend over authenticated HTTPS; it never talks to a database or
   a third party directly.
2. **Sensitive operations happen only on the backend**, which is the sole
   source of truth for them: authentication, computing a final
   price/total/tax/stock figure, permission checks
   (`assertCanManage`/`@RequirePermission`), every database write. A
   client-submitted total, discount or stock count is never trusted as an
   input to money math — `orders.service.ts` recomputes every figure
   server-side inside the transaction that decrements stock and discards
   whatever the client sent.
3. **Third-party calls that need a secret run only from the API**, reading
   the secret from an environment variable through
   `core/config/env.validation.ts` — never hardcoded, never committed.
   Inbound callbacks from those same third parties (a payment gateway
   webhook) are verified with a constant-time comparison
   (`timingSafeEqual`, `payments/providers/*.ts`), not `===` — a
   variable-time comparison leaks the secret one byte at a time to anyone
   timing the response.

Four things that carry the same principle further, already built and not to
be quietly dropped in a refactor: the API refuses to boot on a missing, too
short, or still-placeholder-in-production secret (`env.validation.ts`); a
secret is scoped behind the one interface that needs it (`PaymentProvider`,
`StorageDriver`, `NotificationChannel`) rather than read from `process.env`
in unrelated code; `AllExceptionsFilter` returns a fixed generic message on
the wire and logs the real stack trace server-side only; and CORS is an
explicit allowlist, auth endpoints are rate-limited, and `.env*` is
gitignored with only placeholder-valued `.example` templates committed.

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
      on a fresh database. `pnpm --filter @newax/api db:migrate -- --name <name>`
- [ ] `pnpm db:seed` still succeeds and is still idempotent (run it twice).
- [ ] New API routes have `@ApiOperation` and appear in Swagger.
- [ ] New API routes have `@RequirePermission`. A route with no decorator is
      authenticated-but-unrestricted — that is almost never what you want.
- [ ] Every user-facing string has `en` and `ur`.
- [ ] Every money value is integer paisa.
- [ ] New behaviour has a test. Concurrency-sensitive code has a concurrency test.
- [ ] The admin screen renders correctly for a user who holds *some* but not all
      of the relevant permissions.
- [ ] Anything that renders passes the interface gate in §8 — one job, opens on
      an overview, no literals, checked at all seven tiers, and the page makes
      the product look smaller than it is.

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
- **Branch name: `<pack>/<type>/<module>/[capability]-<slug>`.**

  ```
  core/feat/cart/b2b-wholesale-tiers
  apparel/fix/stitching/queue-validation
  books/feat/publishing/author-royalties
  web/feat/storefront/monochrome-reskin
  infra/chore/mcp/install-api
  ```

  `pack` is the module pack the work belongs to — `core`, a sector pack like
  `apparel`, or `web` / `mobile` / `infra` for work that is not an API module.
  `type` is the same vocabulary the commit log uses: `feat` `fix` `refactor`
  `perf` `test` `docs` `chore`. 
  `module` is the specific API module or frontend domain being edited.
  `capability` is optional (e.g., `b2b`, `b2c`, `c2c`). `slug` is kebab-case.

  **CRITICAL RULE:** Never name or rename a branch based purely on its old name or a ticket ID. You must **read the actual code, commits, and files changed** to determine what the branch is truly about, and name it accordingly.

  Pack first, so `git branch --list 'apparel/*'` is every apparel branch and git
  UIs render the tree. Slashes, not underscores — an underscored name is one
  opaque token to every tool you own.
- **There is one `main` and one `production`. There is no master branch per
  sector.** A sector is a pack of modules plus the `MODULES` allowlist, chosen at
  deploy time — not a branch. A branch is a point in time; a sector is a
  configuration; do not encode a configuration in time. See
  [`MULTI-SECTOR.md`](./MULTI-SECTOR.md) for the reasoning and for how to add a
  sector.
- Commit messages: imperative mood, no ticket prefix — `Add supplier and
  purchase-order models`, matching the existing log.
- PR body: what changed, why, how it was verified, and anything the reviewer
  should look at closely. Include the migration name.
- **Pushing to `main` is fine — it deploys `test.yaseen.pk`, not the live
  shop.** Push your branch's work straight to `main` once it passes the
  definition of done in §3; no PR-and-wait step is required for `main`.
- **`production` is different in the original `yaseenecom` repo: never push
  to it, and never merge into it.** There, `production` deploys the live
  shop at `yaseen.pk`, and that deployment is the owner's decision, not
  yours. Promoting `main` to `production` — by push, merge or PR — is
  something only the repository owner does, or does after explicitly asking
  you to.
- **This working copy (`nadeemmurtaza/erp-1`) is a disconnected clone — its
  `main` and `production` branches are wired to no deployment at all.** The
  caution above still binds in the original `yaseenecom` repo; here, pushing
  or merging into either branch is an ordinary git operation with no live
  consequence, and needs no extra confirmation beyond the definition of done.


---

## 8. Interface rules

These are the owner's, stated directly, and they bind every surface — admin,
storefront, customer account, mobile. A feature that works but violates one of
these is not done. They are repeated in the global agent instructions; this is
the copy a human reads.

### The seven laws

1. **No hardcoding.** No brand, locale or design literal in application code.
   Colour, radius, type step, currency, dial code, timezone, company name,
   support address — every one resolves through an import from
   `packages/shared/src/brand.ts`. The only exception is Newax's own
   attribution and the `@newax/*` package scope.
2. **Hide complexity in depth.** Power is never removed, only moved. Nothing
   is deleted to make a page calm; it goes one level down, where the person
   who wants it will look.
3. **It should feel like there are only a few features.** This is the test the
   other laws serve. A first-time user should perceive a small, obvious
   product. The depth is real, complete and reachable — it simply is not on
   screen until asked for. If a page makes the product look big, the page is
   wrong, not the product.
4. **Seven screens, no dead space.** Every layout is decided at all seven
   tiers (`xs` 280, `sm` 380, `fold` 640, `md` 768, `lg` 1024, `xl` 1280,
   `2xl` 1536), and none may waste the space it has. A phone layout centred in
   a field of white at 1536px reads as broken, not calm.
5. **One main job per page.** If a page has two jobs it is two pages. A second
   job never earns its place by being "related".
6. **No clutter at all.** Not "little clutter". A page ships when nothing
   visible could be removed without harming the job.
7. **Overview first, detail on click.** Every surface opens on the summary.
   Detail arrives when asked for, never on load.

### Which mechanism hides what

| The detail is | Use |
|---|---|
| parts of one object | `SectionRail` — all present, sparse, jump to any |
| separate tasks on one object | `Tabs` — one at a time |
| rare, advanced or destructive | `Disclosure`, closed by default |
| a different object | its own page |
| history, audit, raw payloads | its own view, never inline |

Everything comes from `apps/web/src/components/ui`. A page that invents its own
visual language is the thing these rules exist to prevent.

### Before you open a PR touching UI

- purpose identifiable in two seconds, primary action obvious
- it opens on an overview; no detail shown that was not asked for
- checked at all seven tiers; none of them wastes its space
- no brand, locale or design literal in the file
- built from the shared primitives, not page-local utility strings
- **the page makes the product look small**

That last one is what to actually judge by. The rest is how it is achieved.
