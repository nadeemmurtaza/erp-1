# 14 — Managed Services Module (Agency Billing & Hosting Dashboard)

**Read `00-HOUSE-RULES.md` and `11-client-handover-model.md` first.**

> **Status: scoped, not built.** `11-client-handover-model.md` §5.2 and
> `12-extractor-script-spec.md` both name a `managed-services` module as the
> reason an agency-managed client pays monthly instead of self-hosting. It
> does not exist — no module folder, no Master-Platform-side API, no
> registry. `scripts/sync-client.mjs` currently only generates an
> `AGENCY_API_KEY` and prints a reminder to register it somewhere; there is
> nowhere to register it yet. This brief exists so that work has a shape
> before the first agency-managed client is sold, not because it should be
> built now — see "When to actually build this" at the end.

## Why this is two modules, not one

`11-client-handover-model.md` talks about "the `managed-services` module" as
a single thing the Extractor either keeps or deletes. In practice it is two
modules on two different deployments, because they do different jobs and one
of them must never leave this repository:

| Module | Runs on | Extracted to a client repo? |
|---|---|---|
| `agency` | The Master Platform only (this Blueprint, run by the agency itself) | **Never.** Not requestable via `--modules`; holds every client's data. |
| `managed-services` | A client's extracted repo, agency-managed tier only | Yes, when `--modules` includes it. Deleted for self-hosted deliveries (already correct in `sync-client.mjs`). |

`agency` owns the client registry, usage measurement and billing state.
`managed-services` is a thin consumer: one admin page that asks `agency`
"what does my account look like" and renders the answer. All the real
complexity — and every byte of another client's data — stays on the Master
Platform.

## The load-bearing scope decision: where usage numbers actually come from

`11-client-handover-model.md` §5.2 reads as if the client's own deployed app
measures its usage and reports it upward. **That's backwards for the
agency-managed tier, and worth fixing before anyone starts building.**

An agency-managed client's database and mailbox already live on the agency's
own infrastructure — `13-email-service-plan.md` and `docs/email.md` describe
one Coolify host running the shared Postgres cluster and the Stalwart mail
server, with each client getting an isolated logical database and mail
domain on it. The Master Platform doesn't need the client's app to phone
home with its own storage size — **it can read `pg_database_size()` and
Stalwart's per-domain send counts directly, because it already hosts both.**

That has three consequences for the design below:
- The `agency` module needs a **registry mapping each client to its
  database name and mail domain on the agency's own infra** — not a webhook
  the client's app calls.
- `managed-services` (client-side) never measures anything. It only **pulls**
  its own numbers for display, authenticated by its `AGENCY_API_KEY`.
- **This whole model is structurally impossible for self-hosted clients**,
  which is exactly why the Extractor already deletes `managed-services` for
  them (§5.2) — the agency has no visibility into infrastructure it doesn't
  run. Don't build anything here that assumes otherwise.

## Master side: the `agency` module

New module `agency` (House Rule 1: folder, schema file, registry line) —
**not added to any client's `MODULES` allowlist, ever.** It is core to the
Master Platform's own operation, not a sector pack.

### Schema — `apps/api/prisma/schema/agency.prisma`

```prisma
enum AgencyClientTier {
  SELF_HOSTED       // no row needed in practice, but kept for completeness
  MANAGED
}

enum AgencyClientStatus {
  ACTIVE
  SUSPENDED   // e.g. non-payment — surfaced in the client's dashboard, not enforced by killing their app
  OFFBOARDED
}

model AgencyClient {
  id            String              @id @default(cuid())
  name          String
  tier          AgencyClientTier    @default(MANAGED)
  status        AgencyClientStatus  @default(ACTIVE)
  /// Which modules this client's repo was extracted with, for reference —
  /// not enforced here, the extractor already enforced it at build time.
  modules       String[]
  /// The agency's own infra this client's data lives on. Both fields are
  /// how the nightly job below knows what to measure.
  databaseName  String              @unique
  mailDomain    String?

  /// SHA-256 of the AGENCY_API_KEY the extractor generated. The plaintext
  /// key exists only in the client's .env — never stored here.
  apiKeyHash    String              @unique
  apiKeyRotatedAt DateTime          @default(now())

  stripeCustomerId     String?
  stripeSubscriptionId String?

  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt

  usageSnapshots AgencyUsageSnapshot[]

  @@index([status])
}

/// One row per client per day. A cache, not a source of truth — safe to
/// delete and recompute, same discipline as VariantSalesStat.
model AgencyUsageSnapshot {
  id             String       @id @default(cuid())
  clientId       String
  capturedAt     DateTime     @default(now())
  databaseBytes  BigInt
  emailsSent30d  Int
  activeUsers30d Int

  client AgencyClient @relation(fields: [clientId], references: [id], onDelete: Cascade)

  @@index([clientId, capturedAt])
}
```

### Registration — stays a manual, deliberate step

`sync-client.mjs` already prints the generated key and a reminder to
register it. **Keep that manual for v1.** Registering a client is opening a
`POST /agency/clients` call (or an admin screen) once, when the agency
actually signs the client — automating it from inside the extractor would
mean the extractor needs Master Platform credentials sitting in whatever
environment it runs in, which is a bigger blast radius than the problem
justifies before there is a second client to prove the flow on.

### API — read-only, one client's own data, nothing else

```
GET /agency/clients/me/usage      → last 30 days of AgencyUsageSnapshot
GET /agency/clients/me/invoices   → cached Stripe invoice list
```

Both authenticated by an `X-Agency-Api-Key` header, **not the JWT/session
auth every other endpoint uses** — this is service-to-service, one client
app talking to the Master Platform, not a logged-in person. A dedicated
guard hashes the presented key and looks up `AgencyClient.apiKeyHash`;
`req.agencyClient` is then the only client the request can ever see data
for. There is no endpoint that takes a client id as a parameter — "which
client" is entirely determined by which key was presented, so a leaked key
can only ever read that one client's own numbers.

Admin-facing management (`POST /agency/clients`, listing all clients,
suspending one) sits behind the normal PBAC session auth with a new
permission:

```ts
{ key: 'agency.manage', label: 'Manage agency-hosted clients', category: 'Agency' },
```

### The nightly job

A `@Cron` in the `agency` module, same shape as `inventory.cron.ts`:

1. For every `AgencyClient` with `status: ACTIVE`, run
   `SELECT pg_database_size($1)` against `databaseName` on the shared
   cluster, and pull a 30-day sent count from Stalwart for `mailDomain`
   (Stalwart's admin API — see `docs/email.md` for how this repo already
   talks to it).
2. Write one `AgencyUsageSnapshot` row. Idempotent per day — upsert on
   `(clientId, date)`, not a blind insert, or a re-run doubles the count.

### Stripe

Delegate billing math to Stripe entirely — do not hand-roll invoicing.
`AgencyClient.stripeCustomerId`/`stripeSubscriptionId` are set once at
onboarding. A webhook listener (`invoice.paid`, `invoice.payment_failed`,
`customer.subscription.updated`) updates `AgencyClientStatus` and a small
local invoice cache so `GET /agency/clients/me/invoices` doesn't call Stripe
on every dashboard load. Start with a **flat monthly Price per tier**, not
metered billing — metering the usage numbers above into Stripe's metered
billing API is a real feature, worth doing once there's a second or third
client and a real reason to price by consumption rather than by tier.

## Client side: the `managed-services` module

New module `managed-services`, extracted only when requested (already
correctly gated in `sync-client.mjs` — deleted outright for self-hosted
deliveries, per `11-client-handover-model.md` §5.2).

Deliberately small: one admin page, one API route that proxies to the
Master Platform.

```
GET /admin/managed-services   (admin page: "Hosting & Billing")
```

Reads `AGENCY_API_URL` and `AGENCY_API_KEY` from env (already scaffolded
into `.env.example` by the extractor), calls the two Master endpoints above
server-side (never expose the key to the browser), and renders: current
plan/status, the last 30 days of storage and email usage, and the invoice
list with PDF links Stripe already hosts. No self-service plan changes in
v1 — "contact us to change your plan" is a valid v1 answer and avoids
needing a write API into billing state from a client's own repo.

Permission: reuse `settings.manage` rather than inventing a new one — this
is one page, not a new capability surface.

## Security notes

- The API key is generated once by the extractor, shown once in
  `.env.example`, and only its hash is ever stored. There is no endpoint to
  retrieve a lost key — only to rotate it (`apiKeyRotatedAt`, invalidating
  the old hash), same discipline as any other credential in this codebase.
- Rate-limit the `X-Agency-Api-Key` endpoints per key — this is the one
  surface in the platform that authenticates a whole separate deployment
  rather than a person, and it is reachable from the public internet.
- `agency` never imports anything from a sector pack, and no sector pack
  ever imports `agency` — it is core infrastructure for running the
  business, not a commerce module, and it is never in a client's `MODULES`
  allowlist regardless of pack. Classify it in `module-packs.ts` as `core`
  so `pnpm boundaries` still checks it, but nothing about its data model
  should ever leak into what gets extracted.

## Explicitly out of scope for v1

- **Self-service plan upgrades/downgrades** from the client dashboard.
- **Metered/usage-based Stripe billing** — start flat-rate per tier.
- **Any usage reporting for self-hosted clients** — structurally impossible,
  the agency has no visibility into infrastructure it doesn't run. Don't
  build toward this.
- **Automating client registration from the extractor** — stays a manual
  admin action until there's a second client to justify automating it.
- **Per-API-request metering** — database size and email volume are the
  actual cost drivers on this stack; request counting adds complexity
  without pricing signal.

## Work orders

| WO | Title | Depends on |
|---|---|---|
| 14.1 | `agency` module: `AgencyClient` schema, manual registration, `agency.manage` permission | — |
| 14.2 | Nightly usage snapshot job (Postgres size + Stalwart send count per client) | 14.1 |
| 14.3 | Read-only reporting API + API-key auth guard | 14.1 |
| 14.4 | Stripe customer/subscription linkage + webhook listener | 14.1 |
| 14.5 | `managed-services` module: the client-side Hosting & Billing page | 14.3 |

### Acceptance

- [ ] A client's `X-Agency-Api-Key` can only ever read that client's own
      `usage`/`invoices` — verified by presenting client A's key and
      confirming client B's data is unreachable by any parameter.
- [ ] The nightly job run twice in one day produces one snapshot per client,
      not two.
- [ ] `pnpm lint` passes with `agency` classified in `module-packs.ts`, and
      `agency` does not appear in any fixture `--modules` list the extractor
      script's own tests use.
- [ ] A self-hosted client's extracted repo has no `managed-services` folder
      and no `AGENCY_API_KEY` in its `.env.example` — already true today,
      keep it true.
- [ ] Suspending a client in the admin (`agency.manage`) is reflected in
      their own dashboard's status within one nightly cycle; it does not
      take their app offline.

## When to actually build this

Not now. This is infrastructure for a business model with zero clients on
it today. Build WO-14.1–14.3 when there is an actual agency-managed client
about to be signed — enough to register them and show them real numbers —
and treat 14.4 (Stripe) and 14.5 (their own dashboard) as the thing that
ships before their first invoice is due, not before. Scoping it now means
the shape is decided before the pressure of an actual deadline, not that
the folder should exist yet.
