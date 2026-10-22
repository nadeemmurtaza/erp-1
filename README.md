# Business platform

An ERP and commerce platform built as **one universal core plus sector packs**.
The same codebase runs a single shop, a chain with many branches, or a group of
brands, and a new sector or brand is a new folder or a new value, not a fork.

Its first deployment is **Yaseen**, a store for stitched and unstitched clothing
and tailoring services in Pakistan: PKR, Cash on Delivery, local couriers, and a
bilingual English/Urdu storefront. A customer can buy a ready-made piece, buy
fabric and have it stitched to their saved measurements, or send their own cloth
for a stitching job and follow its progress. Staff run the catalogue, orders,
tailor queue, stock, purchasing and accounts from one back office.

## Part of the NEWAX ecosystem

This is one of several connected NEWAX repos. See [`ECOSYSTEM.md`](ECOSYSTEM.md)
for what this repo owns, what it must never own, and the rules for how it
talks to the others — in particular, several modules under
`apps/api/src/modules/customers` and `system` are slated to move out to
other repos (nID, Communicator); see `ECOSYSTEM.md` for the full list.

New here? Read [`START-HERE.md`](./START-HERE.md) first. It is one page, written
for people, and says what lives where.

## Where it is heading

The aim is more than an ERP: a network in which businesses of any size publish
products and services, choose who may see them, and trade with each other
without re-entering data. A seller's price becomes the buyer's cost, and stock
moves on both sides from one fact, entered once.

| Piece                                                                        | State                                                                                                                               |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Publish a product or service to a shared marketplace, with upsert and delist | Built (off by default)                                                                                                              |
| One shared product record per barcode, reused instead of copied per retailer | Built on the platform app; retailers still keep local rows                                                                          |
| Trading-partner network: an invite handshake and pushed product alerts       | Built; the buyer-side automation is not                                                                                             |
| Seller event creates the buyer's purchase order, receipt, cost and stock     | Planned, designed in [`213-partner-fact-exchange.md`](./docs/implementation/integrations-connectivity/213-partner-fact-exchange.md) |
| Public discovery feed and a map of live stock and prices                     | Planned                                                                                                                             |

The design notes are in
[`docs/implementation/b2b-wholesale-multientity/165-cross-tenant-marketplace-directory.md`](./docs/implementation/b2b-wholesale-multientity/165-cross-tenant-marketplace-directory.md)
and
[`docs/implementation/integrations-connectivity/18-trading-partner-network.md`](./docs/implementation/integrations-connectivity/18-trading-partner-network.md).

## Run it

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

The seed creates a small realistic catalogue, garment types with their
measurement fields, stitching options, and four **development-only** accounts:

| Role     | Sign in              | Password        |
| -------- | -------------------- | --------------- |
| Admin    | `admin@yaseen.pk`    | `admin12345`    |
| Staff    | `staff@yaseen.pk`    | `staff12345`    |
| Tailor   | `tailor@yaseen.pk`   | `tailor12345`   |
| Customer | `ayesha@example.com` | `customer12345` |

Never use these anywhere reachable from the internet. Set `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD` to override the admin account.

Customers can sign in with a phone number as well as an email; `0300 1234567`,
`+92 300 1234567` and `03001234567` all resolve to the same account.

With no Docker, point `DATABASE_URL` at any PostgreSQL 16 you already run. The
mobile app has its own instructions in [`apps/mobile/README.md`](./apps/mobile/README.md).

## What exists today

The API is a set of independent modules, grouped by domain under
[`apps/api/src/modules/`](./apps/api/src/modules/README.md).

| Domain        | Capabilities                                                                                                                                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sales         | Cart, checkout and orders (COD and bank transfer, pluggable gateways), tills and offline-capable POS, pricing, promotions, gift cards, wallet, loyalty, reviews and wishlists, shipping and tracking, stitching jobs and saved measurements, B2B accounts |
| Merchandising | Catalogue with variants and bilingual content, collections, content pages, search and recommendations, campaigns, custom fields                                                                                                                           |
| Supply chain  | Inventory with locations and a stock ledger, purchasing and goods receipts, inter-branch transfers, production and bills of materials, planning, trading partners, marketplace, resilience                                                                |
| Money         | Double-entry accounting, receivables, settlements, finance and order economics, tax, bank facilities, reports and analytics                                                                                                                               |
| People        | HR, payroll, attendance, organization and department structure, tasks                                                                                                                                                                                     |
| Customers     | CRM, parties, support, notifications and preferences, on-site messaging                                                                                                                                                                                   |
| System        | Users and permissions, settings, feature flags, identity verification, managed services, the AI layer, workflow engine                                                                                                                                    |

Around the API sit the storefront and back office (`apps/web`), the till
(`apps/pos`), the mobile app (`apps/mobile`) and the multi-tenant control plane
(`apps/platform`). Per-capability build status is in
[`docs/implementation/README.md`](./docs/implementation/README.md); where any
route, table or permission lives is in [`docs/index/`](./docs/index/README.md).

## The rules that bind everyone

[`CLAUDE.md`](./CLAUDE.md) is the contract for every contributor, human or
agent, and [`docs/implementation/00-HOUSE-RULES.md`](./docs/implementation/00-HOUSE-RULES.md)
is its long form. A change that only works by breaking them is rejected even
when the feature works. The short version:

1. **A module is a folder, a schema file and one registry line.**
2. **Modules never import each other's internals.** Side effects cross through
   domain events. `pnpm boundaries` enforces it.
3. **Business rules are data, not constants.** Fees and lead times live in the
   `Setting` table.
4. **Money is an integer in minor units** (`349900` is Rs 3,499). No floats.
5. **Customer-facing text is a row, not a column**, in both English and Urdu.
6. **Order lines are snapshots**, never joined back to the live product.
7. **Anything with more than one implementation gets an interface**
   (`PaymentProvider`, `StorageDriver`, `NotificationChannel`, `CourierProvider`).
8. **Permissions are capabilities, never roles.** Every route declares
   `@RequirePermission`.
9. **Concurrency belongs in the write**, as a predicate on the `UPDATE`.
10. **Shared rules live in `@newax/shared`** and every app calls them.

**Branches:** there is one `main` and one `production`, and no branch per sector.
A sector is a `MODULES` allowlist chosen at deploy time. See
[`MULTI-SECTOR.md`](./docs/implementation/MULTI-SECTOR.md).

**`production` belongs to the owner.** Never push to it or merge into it without
being asked, even when CI is green. The owner's own repository deploys `main` to
the test site and `production` to the live shop; a disconnected clone such as
`nadeemmurtaza/erp-1` triggers no deployment, as `CLAUDE.md` explains.

### Definition of done

```bash
pnpm lint        # ESLint, the module boundary check and the repo's other checks
pnpm typecheck   # types across the whole workspace
pnpm test        # unit and end-to-end tests, against a real Postgres
pnpm build       # catches Next.js build failures the dev server hides
```

The four commands pass, plus migrations run forward on a copy of production data,
the seed is still idempotent, every route has `@RequirePermission`, every
user-facing string has `en` and `ur`, and concurrency-sensitive code has a
concurrency test. The full list is in `00-HOUSE-RULES.md` §3.

## Design decisions worth knowing

**Text is bilingual by structure.** Product and category names live in
`*Translation` rows keyed by locale, so adding a language needs no migration.
Urdu renders right-to-left.

**Measurement fields are database rows, not code.** Staff add "cuff width" from
the dashboard and every measurement form picks it up. One validator in
`@newax/shared` enforces the rules everywhere.

**Modules talk through events.** Placing an order publishes `order.placed`
through a transactional outbox; the CRM, stitching and notification modules
subscribe. See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

**Email is a channel, not a feature.** Order confirmations, receipts and status
changes go out through the same `NotificationChannel` interface as push and log
channels, driven by outbox events. See [`docs/email.md`](./docs/email.md).

**Payments are pluggable.** Cash on Delivery and bank transfer are live;
JazzCash and Easypaisa sit behind `PaymentProvider` and switch on through the
`PAYMENT_PROVIDERS` allowlist once merchant credentials exist.

**Secrets never reach a browser or a phone.** Every sensitive decision and every
third-party call happens on the API. See
[`docs/security/security-architecture.md`](./docs/security/security-architecture.md).

## Commands

| Command               | What it does                                                                           |
| --------------------- | -------------------------------------------------------------------------------------- |
| `pnpm dev`            | Runs every app in watch mode                                                           |
| `pnpm build`          | Builds everything                                                                      |
| `pnpm test`           | Unit and end-to-end tests                                                              |
| `pnpm lint`           | ESLint plus the module boundary and repository checks                                  |
| `pnpm typecheck`      | Types across the workspace                                                             |
| `pnpm check:overflow` | Boots the real stack and sweeps every route at the seven screen widths; its own CI job |
| `pnpm db:migrate`     | Creates and applies a migration                                                        |
| `pnpm db:seed`        | Loads the sample catalogue                                                             |
| `pnpm db:reset`       | Drops, re-migrates and re-seeds                                                        |
| `pnpm idx`            | Looks up a route, permission, table, event or rule without opening files               |

## Read next

| You want                                      | Open                                                                                                                                                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A one-page tour of the repository             | [`START-HERE.md`](./START-HERE.md)                                                                                                                                                                         |
| To add a feature                              | [`CONTRIBUTING.md`](./CONTRIBUTING.md)                                                                                                                                                                     |
| Why something was decided                     | [`docs/implementation/DECISIONS.md`](./docs/implementation/DECISIONS.md)                                                                                                                                   |
| Every build brief, in reading order           | [`docs/implementation/README.md`](./docs/implementation/README.md)                                                                                                                                         |
| How screens must look and behave              | [`docs/design/README.md`](./docs/design/README.md)                                                                                                                                                         |
| How sectors, brands and branches fit together | [`docs/implementation/MULTI-SECTOR.md`](./docs/implementation/MULTI-SECTOR.md), [`ENTERPRISE-SCALE.md`](./docs/implementation/ENTERPRISE-SCALE.md), [`RETAIL-ERP.md`](./docs/implementation/RETAIL-ERP.md) |
| Security rules                                | [`docs/security/security-architecture.md`](./docs/security/security-architecture.md)                                                                                                                       |
| Transactional email                           | [`docs/email.md`](./docs/email.md)                                                                                                                                                                         |
| The brand wordmark                            | [`docs/brand/README.md`](./docs/brand/README.md)                                                                                                                                                           |
| Deployment history                            | [`DEPLOYMENT.md`](./DEPLOYMENT.md) (describes the retired Swarm and Caddy setup; production now runs on Coolify)                                                                                           |

## Repository layout

```
apps/api         NestJS + Prisma + PostgreSQL: all business logic
apps/web         Next.js storefront and /admin back office
apps/pos         Next.js point of sale, able to keep selling offline
apps/mobile      Expo (iOS and Android) on the same API
apps/platform    Control plane: tenants, billing, hosting, shared product
                 reference, marketplace
packages/shared  Brand values, money, measurement rules, phone normalisation
packages/pos-core        Till logic shared by the POS and mobile
packages/desktop-runtime Runs a deployment on one computer
packages/config  tsconfig and eslint presets
scripts          Repository checks and the index generator
docs/            Rules, build briefs, design system, security, generated index
```
