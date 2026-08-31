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
| Dashboard metrics + CRM — customers, enquiries, follow-ups | Done |
| Stitching operations — own-fabric bookings, tailor queue, progress tracking | Done |
| Expo mobile app — shop, cart, checkout, measurements, tracking, tailor queue | Done |
| Email — self-hosted Stalwart mail server, multi-domain, webmail (SnappyMail) | Done |

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
apps/mobile     Expo (iOS + Android) on the same API
packages/shared measurement rules, pricing maths, phone normalisation
packages/config tsconfig and eslint presets
scripts         module boundary check
```
# Updated Tue Aug 25 18:59:43 CEST 2026
