# Start here

A one-page orientation for a person opening this repository for the first
time. It explains what the project is, where things live, and how to run it.
It does not replace the documents of record; it tells you which one to open.

## What this is

A business platform, not a single shop's software. One codebase serves small
shops through multinational groups, and the long-term aim is an ecosystem:
businesses publish products and services, control who can see them, and trade
with each other without re-typing data.

The principle behind every design decision: **a fact is entered once.** A
seller's price is the buyer's cost. A seller's stock going out is the buyer's
stock coming in. A product is described once and reused, not copied per
retailer.

Today's deployment is a clothing and stitching store for Pakistan (see
[`README.md`](./README.md)); the rest of the structure exists so other sectors
and brands are a new folder, not a fork.

## The map

| Folder                       | What it is                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`                   | The business backend (NestJS + PostgreSQL via Prisma). One module per business area: orders, inventory, purchasing, accounting, HR and more.                           |
| `apps/web`                   | The storefront and the admin back office (Next.js).                                                                                                                    |
| `apps/pos`                   | The point-of-sale till (Next.js), able to keep selling offline.                                                                                                        |
| `apps/mobile`                | The customer and staff mobile app (Expo).                                                                                                                              |
| `apps/platform`              | The control plane above all deployments: tenants, billing, hosting, the shared product reference, the marketplace. It never touches a client's business data directly. |
| `packages/shared`            | Code every app uses: brand values, money, types.                                                                                                                       |
| `packages/pos-core`          | Till logic shared by the POS and mobile.                                                                                                                               |
| `packages/desktop-runtime`   | Runs a deployment on one computer, including local Postgres and receipt printers.                                                                                      |
| `packages/config`            | Shared lint and TypeScript settings.                                                                                                                                   |
| `docs/`                      | All documentation (see below).                                                                                                                                         |
| `scripts/`                   | Repository checks and the index generator.                                                                                                                             |
| `deploy/` and `docker-*.yml` | Hosting and deployment files.                                                                                                                                          |

## Five ideas that explain the rest

1. **One brand per deployment.** Names, colours and currency come from
   `packages/shared/src/brand.ts`, never from literals in code.
2. **Modules are independent.** A module is a folder. Modules talk through
   domain events, never by importing each other. `pnpm boundaries` enforces it.
3. **Permissions, not roles.** Every route declares the permission it needs.
   What a person may do is data, not code.
4. **Money is whole numbers.** Always integer minor units, never decimals.
5. **Three separate questions.** _What kind of business_ is a module pack.
   _Which business_ is the brand. _Where it happened_ is a location on the
   record. Keep them apart.

## Where the documents are

| You want                                      | Open                                                                                                                                                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The rules everyone follows                    | [`CLAUDE.md`](./CLAUDE.md), then [`docs/implementation/00-HOUSE-RULES.md`](./docs/implementation/00-HOUSE-RULES.md)                                                                                        |
| Why a decision was made                       | [`docs/implementation/DECISIONS.md`](./docs/implementation/DECISIONS.md) (the index; each decision is its own file in `docs/implementation/decisions/`)                                                    |
| The product vision                            | [`PRD.md`](./PRD.md)                                                                                                                                                                                       |
| How it scales across sectors and chains       | [`docs/implementation/ENTERPRISE-SCALE.md`](./docs/implementation/ENTERPRISE-SCALE.md), [`MULTI-SECTOR.md`](./docs/implementation/MULTI-SECTOR.md), [`RETAIL-ERP.md`](./docs/implementation/RETAIL-ERP.md) |
| Build briefs, one per capability              | [`docs/implementation/README.md`](./docs/implementation/README.md)                                                                                                                                         |
| How screens must look and behave              | [`docs/design/README.md`](./docs/design/README.md)                                                                                                                                                         |
| How to add a feature                          | [`CONTRIBUTING.md`](./CONTRIBUTING.md)                                                                                                                                                                     |
| Security rules                                | [`docs/security/security-architecture.md`](./docs/security/security-architecture.md)                                                                                                                       |
| Where any file, route, table or permission is | [`docs/index/README.md`](./docs/index/README.md), or run `pnpm idx`                                                                                                                                        |

`Architecture.md`, `Design.md`, `Memory.md`, `Phases.md` and `Rules.md` at the
root are short signposts to the documents above. `AGENTS.md` and `GEMINI.md`
are generated copies of the agent instructions; do not edit them.

## Run it locally

```bash
pnpm install
cp .env.example .env     # then fill in values
pnpm services:up         # starts the local database and cache
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Before opening a pull request, run all three and expect zero errors:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

## State of the organization (honest)

This section lists known problems so they get fixed, not hidden. Status is
"planned" until a commit says otherwise.

| Area | Problem                                                                                                                 | Planned fix                                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root | Stray output files and one-off scripts were tracked.                                                                    | **Done:** removed.                                                                                                                                                    |
| Root | `apps/api/report.*.json` is a generated diagnostic report committed to the repo.                                        | Remove and ignore (needs owner confirmation).                                                                                                                         |
| Root | `README.md` described only the clothing store and listed stale phase status.                                            | **Done:** rewritten around the platform; security and mobile sections moved to `docs/security/` and `apps/mobile/`.                                                   |
| Docs | `DECISIONS.md` was one 9,500-line file.                                                                                 | **Done:** one file per decision in `docs/implementation/decisions/`, with `DECISIONS.md` as the complete index.                                                       |
| Docs | Document numbers 18 and 19 are each used by two unrelated briefs, and the numbered briefs are cited in about 70 places. | Planned: give the four briefs unique numbers and update every citation in one reviewed change.                                                                        |
| Docs | Five root signpost files add a hop without adding content.                                                              | Fold into this page once links are updated.                                                                                                                           |
| Code | 67 API modules sit in one flat folder.                                                                                  | Group by domain (sales, inventory, finance, people, platform) with no change to behaviour.                                                                            |
| Code | Partner trading sends whole invoice documents.                                                                          | Designed in `docs/implementation/integrations-connectivity/213-partner-fact-exchange.md` (send data facts; the receiver builds its own documents). Awaiting approval. |
| UI   | Visual quality is below the target.                                                                                     | Audit every main screen at the seven widths, then redesign against `docs/design/`.                                                                                    |

Each item becomes its own small, reviewed change. Nothing is moved or deleted
without the owner confirming it by name.
