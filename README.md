# Yaseen — Clothing Store & Stitching Services

An online store for **stitched and unstitched clothing** plus **stitching
(tailoring) services**, built for Pakistan: PKR, Cash on Delivery, local
couriers, and a bilingual English/Urdu storefront.

A customer can buy a ready-made piece, buy unstitched fabric and tick "get it
stitched" against their saved measurements, or send their own cloth for a
standalone stitching job — and follow the tailoring progress. Staff run the
catalogue, orders, tailor queue and customer relationships from one back office.

## Read this before touching anything

**[`docs/implementation/00-HOUSE-RULES.md`](./docs/implementation/00-HOUSE-RULES.md)
is the contract.** Every agent and every contributor reads it first, every
session — not background reading, the thing a pull request is rejected against
regardless of whether the feature works. What follows here is the summary; that
file is the source of truth, and where the two disagree, it wins.

### The rule that matters most: `production` is the owner's alone

> **Pushing to `main` is fine — push your branch straight to it once it's
> ready, no PR needed. `production` is different: never push to it, never
> merge into it. This holds even when CI is green, even when the change is
> trivial.**

`main` auto-deploys to `test.yaseen.pk` — low stakes, so a direct push is the
normal workflow. `production` auto-deploys to the **live shop** at
`yaseen.pk`, so promoting `main` to `production` — by push, merge or PR — is
a deployment decision that belongs to the repository owner, not to whoever is
at the keyboard. Only the owner pushes, merges or opens a PR into
`production`, or explicitly asks for it to happen. If `production` needs to
move and that hasn't been said, the answer is to ask — never to push or merge
it yourself.

### The eleven house rules, in one line each

Full detail, code samples and the reasoning for each are in
[`00-HOUSE-RULES.md`](./docs/implementation/00-HOUSE-RULES.md) §2.

1. **A module is a folder, a schema file, and one registry line.** Nothing else
   changes to add a feature — see [CONTRIBUTING.md](./CONTRIBUTING.md).
2. **Modules do not import each other's internals** — only another module's
   `<name>.module` or a top-level `<name>.service`. `pnpm boundaries` enforces it.
3. **Side effects go through domain events, not direct calls** — subscribe to
   `DomainEvent.OrderPlaced` and friends; never edit the module that publishes.
4. **Business rules are data, not constants** — shipping fees, COD fee, lead
   times live in the `Setting` table, edited from `/admin/settings`.
5. **Money is integer paisa, always** — `toMinor()` / `formatMoney()` from
   `@yaseen/shared`. No float, no string, no `Decimal` ever touches a price.
6. **Customer-facing text is never a column** — `*Translation` rows, `en` and
   `ur`, always both.
7. **Order lines are snapshots** — name, price, measurements, unit cost are
   copied at purchase and never joined back to the live product.
8. **Anything with more than one implementation gets an interface** —
   `PaymentProvider`, `StorageDriver`, `NotificationChannel`, `CourierProvider`.
9. **Permissions are capabilities, never roles** — `@RequirePermission('x')`,
   never `if (user.role === 'ADMIN')`.
10. **Concurrency belongs in the UPDATE, not in a read-then-write** — put the
    predicate on the write and check the row count; never read-check-write.
11. **Shared rules live in `@yaseen/shared` and every app calls them** — pricing,
    measurement validation, phone normalisation. Never reimplemented per app.

### The module-pack seam

The platform is a **universal commerce core** plus sector **packs** (today:
`core` and `apparel`). A core module may never import a pack module; a pack
module may never import another pack's module; packs talk to core only through
domain events, one direction. `scripts/check-module-boundaries.mjs` enforces
this in `pnpm lint` and in CI, module-by-module, against the map in
`apps/api/src/modules/module-packs.ts`. Full reasoning, the current pack list,
and the one outstanding violation being paid down (`cart` → `measurements`) are
in [`docs/implementation/MULTI-SECTOR.md`](./docs/implementation/MULTI-SECTOR.md).

**There is one `main` and one `production`. There is no master branch per
sector** — a sector is a `MODULES` allowlist chosen at deploy time, not a
branch. See the same file for why, and for branch-naming convention
(`<pack>/<type>/<slug>`, e.g. `apparel/feat/measurements-size-chart`).

### Definition of done

Before anything is called finished:

```bash
pnpm lint        # ESLint + the module boundary check
pnpm typecheck   # types across the whole workspace
pnpm test        # unit and end-to-end, against a real Postgres
pnpm build       # catches Next.js build-time failures the dev server hides
```

All four run in CI, so a green local run is what clears a change to go
straight to `main` — but green CI is never, by itself, a reason to push or
merge into `production`. Plus, every time: migrations
run forward on a copy of production data (never just a fresh database); the
seed still succeeds and is still idempotent; every new route has
`@RequirePermission` and `@ApiOperation`; every user-facing string has both
`en` and `ur`; every money value is integer paisa; concurrency-sensitive code
has a concurrency test. Full checklist in
[`00-HOUSE-RULES.md`](./docs/implementation/00-HOUSE-RULES.md) §3.

## Documentation map

| Document | What it covers |
|---|---|
| [`README.md`](./README.md) | This file — what the store is, how to run it, the rules, and the doc index. |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | How to add a module day-to-day: layout, the rules that keep boundaries clean, pre-push checks. |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | ⚠️ Describes the retired Docker Swarm / Caddy / systemd deployment. Kept for history; production now runs on Coolify. |
| [`docs/email.md`](./docs/email.md) | **Current.** Transactional email on this shop's own Stalwart mail server: setup, DNS/SPF/DKIM/DMARC, the notification-channel architecture, deliverability practices. |
| [`docs/brand/README.md`](./docs/brand/README.md) | The locked wordmark: which SVG for which use, colour, clear space, what not to do to it. |
| [`docs/implementation/README.md`](./docs/implementation/README.md) | Index and reading order for the phase briefs below; the dependency graph between phases. |
| [`docs/implementation/00-HOUSE-RULES.md`](./docs/implementation/00-HOUSE-RULES.md) | **The contract.** Read first, every session. The eleven rules, definition of done, the no-data-loss migration procedure, branch/PR/push conventions. |
| [`docs/implementation/MULTI-SECTOR.md`](./docs/implementation/MULTI-SECTOR.md) | How one repo serves clothing, grocery, pharmacy, etc. — packs vs. branches, why there's one `main`/one `production`, the full sector/business-model taxonomy and the core blockers (B1–B7) any second sector hits. |
| [`docs/implementation/01-inventory-purchasing-cost.md`](./docs/implementation/01-inventory-purchasing-cost.md) | Phase 1 (**shipped**) — suppliers, purchase orders, goods receipts, the unified stock ledger, cost price, COGS, reorder points, slow movers, stock counts. |
| [`docs/implementation/02-admin-shell.md`](./docs/implementation/02-admin-shell.md) | Phase 2 — shared admin primitives (DataTable, PageHeader, Modal, FilterBar), command palette, error states. |
| [`docs/implementation/03-variants-sku-seo.md`](./docs/implementation/03-variants-sku-seo.md) | Phase 3 — **WO-3.1 shipped** (Blocker B2: the bilingual `ProductOption`/`ProductOptionValue` data model, additive alongside `size`/`color`, with a verified backfill script). SKU templates, the sectioned product editor, enforced alt text, the SEO publish gate, JSON-LD, sitemap, hreflang, redirects remain unbuilt. |
| [`docs/implementation/04-finance.md`](./docs/implementation/04-finance.md) | Phase 4 — expenses, order economics, profit and loss, cash flow, month-end close. |
| [`docs/implementation/05-promotions-giftcards.md`](./docs/implementation/05-promotions-giftcards.md) | Phase 5 — discount rules engine, promo codes, gift cards, store credit. |
| [`docs/implementation/06-shipping-fulfilment-returns.md`](./docs/implementation/06-shipping-fulfilment-returns.md) | Phase 6 — shipping zones/rates, courier providers, shipments and manifests, tracking automation, returns/RMA, RTO. |
| [`docs/implementation/07-customer-portal.md`](./docs/implementation/07-customer-portal.md) | Phase 7 — portal shell, tracking timeline, self-service returns, reviews, wishlist, loyalty, mobile parity. |
| [`docs/implementation/08-content-marketing-search.md`](./docs/implementation/08-content-marketing-search.md) | Phase 8 — CMS, collections and merchandising, full-text search, campaigns, abandoned cart. |
| [`docs/implementation/09-ai-layer.md`](./docs/implementation/09-ai-layer.md) | Phase 9 — alt text and SEO generation, size recommendation, forecasting, COD risk, semantic search, WhatsApp assistant. |
| [`docs/implementation/10-admin-dashboard.md`](./docs/implementation/10-admin-dashboard.md) | Phase 10 (runs alongside, not after) — the admin dashboard rebuild, the `finance` and `bom` modules. |
| [`docs/implementation/11-client-handover-model.md`](./docs/implementation/11-client-handover-model.md) | Planning doc — the master-platform-plus-client-handover model: one blueprint repo, stripped-down private repos per client, and why per-client branches/submodules/npm packages were rejected. |
| [`docs/implementation/12-extractor-script-spec.md`](./docs/implementation/12-extractor-script-spec.md) | Planning doc — spec for `scripts/sync-client.mjs` (not yet built), which would generate/upgrade a client's stripped-down repo from this one. |
| [`docs/implementation/13-email-service-plan.md`](./docs/implementation/13-email-service-plan.md) | Planning doc — the *business* case for reselling white-labelled, self-hosted email (Stalwart + SnappyMail) to agency clients. For how *this* shop's email actually works, see `docs/email.md` instead. |
| [`docs/implementation/14-managed-services-module.md`](./docs/implementation/14-managed-services-module.md) | Planning doc — scope for the `agency` (Master Platform) and `managed-services` (client-side) modules that back the agency-managed billing/hosting dashboard named in doc 11. Not built yet — see "When to actually build this" in the doc. |
| [`docs/implementation/15-tax-module.md`](./docs/implementation/15-tax-module.md) | Blocker B4 (`MULTI-SECTOR.md`), **shipped** — a `tax` module with a selectable inclusive/exclusive pricing mode, `/admin/tax`. `tax.enabled=false` by default. |
| [`docs/implementation/16-pbac-row-scoping.md`](./docs/implementation/16-pbac-row-scoping.md) | Blocker B5 — **the shared ownership guard is shipped**: `assertCanManage()` generalizes the `manage_own`/`manage_all` pattern (stitching jobs is the reference call site). The rest — an actual marketplace, `Product.sellerId`, row-filtered list endpoints — is only worth building once a marketplace model is real. |
| [`docs/implementation/17-inventory-locations.md`](./docs/implementation/17-inventory-locations.md) | Blocker B6 — **shipped**: a `Location` dimension on stock (`ProductVariant.stock` is now a denormalized, concurrency-safe SUM over `VariantLocationStock`), byte-identical for every deployment's single `MAIN` location today. Multi-location admin UI and fulfilment routing wait on an actual second location or O2O plan. |

## What is here today

| Area | State |
|---|---|
| Monorepo, Docker Compose, CI | Done |
| Core platform — event outbox, settings, storage, notifications, audit, auth | Done |
| Catalogue API — products, fabrics, services, variants, images, bilingual content | Done |
| Measurements — garment types, editable measurement fields, saved profiles | Done |
| Admin API — product/service CRUD, stock, categories, CSV bulk import | Done |
| Bilingual storefront — browsing, filters, product pages | Done |
| Back office — catalogue overview, product editor, categories, garments, import | Done |
| Cart and the stitching add-on | Done |
| Checkout, orders, COD and bank transfer, order management | Done |
| Dashboard metrics + CRM — customers, enquiries, follow-ups | Done |
| Stitching operations — own-fabric bookings, tailor queue, progress tracking | Done |
| Expo mobile app — shop, cart, checkout, measurements, tracking, tailor queue | Done |
| Email — self-hosted Stalwart mail server, multi-domain, webmail (SnappyMail) | Done |
| Inventory & purchasing (Phase 1) — stock ledger, weighted-average cost, COGS snapshot, suppliers, purchase orders, goods receipts, reorder/slow-mover job, stock counts | Done |
| Admin nav — declared 11-group order, icons, one level of nesting, module-gated items | Done |
| Reports — order, sales-by-day, stock, stock valuation, purchases-by-supplier, stock ledger, slow-movers exports | Done |

## Running it

Requires Node 22 and pnpm 10.

```bash
cp .env.example .env
docker compose up -d          # postgres, redis, minio
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Storefront: <http://localhost:3000/en> (or `/ur`)
- Back office: <http://localhost:3000/admin>
- API: <http://localhost:3001/api/v1>
- API docs: <http://localhost:3001/api/docs>
- Health: <http://localhost:3001/api/v1/health/ready>

The seed creates a small realistic catalogue (lawn suits, khaddar, ready-to-wear,
menswear), garment types with their measurement fields, stitching style options,
and four accounts:

| Role | Sign in | Password |
|---|---|---|
| Admin | `admin@yaseen.pk` | `admin12345` |
| Staff | `staff@yaseen.pk` | `staff12345` |
| Tailor | `tailor@yaseen.pk` | `tailor12345` |
| Customer | `ayesha@example.com` | `customer12345` |

Customers can sign in with a phone number as well as an email — `0300 1234567`,
`+92 300 1234567` and `03001234567` all resolve to the same account.

### Without Docker

If a PostgreSQL 16 and Redis are already running locally, skip
`docker compose up` and point `DATABASE_URL` and `REDIS_URL` at them.

### The mobile app

```bash
pnpm --filter @yaseen/mobile start        # then scan the QR code with Expo Go
```

It talks to the same API. Point it at one with `EXPO_PUBLIC_API_URL`; with
nothing set it uses `http://localhost:3001/api/v1`, except on Android, where the
emulator reaches the host on `10.0.2.2`. A phone on your wi-fi needs your
machine's LAN address rather than localhost:

```bash
EXPO_PUBLIC_API_URL="http://192.168.1.20:3001/api/v1" pnpm --filter @yaseen/mobile start
```

Sign in with any of the seeded accounts above — a tailor lands on their queue
rather than the shop.

**Push notifications** tell a customer when their garment moves on. Add
`expo_push` to `NOTIFICATION_CHANNELS` to switch them on; the app registers the
handset on sign-in, and no provider credentials are needed. Delivery has not been
exercised against a real handset — that needs a device and an EAS project id in
`app.json`.

Store builds go through EAS, with development, preview and production profiles in
`apps/mobile/eas.json`:

```bash
cd apps/mobile
npx eas build --profile preview --platform android
npx eas build --profile production --platform all
```

## Design decisions worth knowing

**Money is integer paisa.** Rs 3,499 is stored as `349900`. No floats touch a
price, anywhere.

**Text is bilingual by structure.** Product and category names live in
`*Translation` rows keyed by locale, not in columns, so adding a language needs
no migration. Urdu renders right-to-left.

**Measurement fields are database rows, not code.** Staff add "cuff width" from
the dashboard and every measurement form — website, admin, and later the mobile
app — picks it up immediately. One validator in `@yaseen/shared` enforces the
rules everywhere.

**Modules talk through events, not imports.** Placing an order publishes
`order.placed` through a transactional outbox; the CRM, stitching and
notification modules subscribe. Adding a module is a folder plus one line in the
registry — enforced by `pnpm boundaries` in CI. See
[CONTRIBUTING.md](./CONTRIBUTING.md).

**Customer email is a channel, not a feature.** Order confirmations, payment
receipts, status changes and stitching updates all go out through the same
`NotificationChannel` interface as the log and push channels, in English and
Urdu, driven by the events the outbox already publishes — so adding an email is
a `notifications.send()` call, and moving from our own mail server to a relay is
four environment variables. See [docs/email.md](./docs/email.md).

**Payments are pluggable.** Cash on Delivery and bank transfer are live.
JazzCash and Easypaisa sit behind the same `PaymentProvider` interface and are
switched on through the `PAYMENT_PROVIDERS` env allowlist once merchant
credentials exist — a config change, not a rewrite.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Runs every app in watch mode |
| `pnpm build` | Builds everything |
| `pnpm test` | Unit and end-to-end tests |
| `pnpm lint` | ESLint plus the module boundary check |
| `pnpm typecheck` | Types across the workspace |
| `pnpm db:migrate` | Creates and applies a migration |
| `pnpm db:seed` | Loads the sample catalogue |
| `pnpm db:reset` | Drops, re-migrates and re-seeds |

## Where the project is going

[`docs/implementation/`](./docs/implementation/) holds the build instructions for
ten phases — inventory and purchasing, the admin shell, custom variants and SEO,
profit and loss, promotions and gift cards, shipping and returns, the customer
portal, content and search, the AI layer, and the admin dashboard rebuild —
plus [`MULTI-SECTOR.md`](./docs/implementation/MULTI-SECTOR.md) on running more
than one sector from this one repository, and seven planning docs (11–17) —
four on a possible future master-platform-plus-client-handover model, three
scoping the multi-sector blockers B4–B6. See the
[documentation map](#documentation-map) above for what each one covers, and
start with [`00-HOUSE-RULES.md`](./docs/implementation/00-HOUSE-RULES.md) — the
contract every contributor, human or agent, works to.

## Repository layout

```
apps/api        NestJS + Prisma + PostgreSQL — all business logic
apps/web        Next.js storefront + /admin back office
apps/mobile     Expo (iOS + Android) on the same API
packages/shared measurement rules, pricing maths, phone normalisation
packages/config tsconfig and eslint presets
scripts         module boundary check, DNS/deliverability check
docs/           this repo's rules, phase briefs and setup guides — see the
                documentation map above
```
