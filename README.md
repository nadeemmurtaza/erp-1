# Yaseen — Clothing Store & Stitching Services

An online store for **stitched and unstitched clothing** plus **stitching
(tailoring) services**, built for Pakistan: PKR, Cash on Delivery, local
couriers, and a bilingual English/Urdu storefront.

A customer can buy a ready-made piece, buy unstitched fabric and tick "get it
stitched" against their saved measurements, or send their own cloth for a
standalone stitching job — and follow the tailoring progress. Staff run the
catalogue, orders, tailor queue and customer relationships from one back office.

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
| Dashboard metrics + CRM | Planned |
| Tailor production tracking | Planned |
| Expo mobile app | Planned |

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

## Repository layout

```
apps/api        NestJS + Prisma + PostgreSQL — all business logic
apps/web        Next.js storefront + /admin back office
packages/shared measurement rules, pricing maths, phone normalisation
packages/config tsconfig and eslint presets
scripts         module boundary check
```
