# 195 — Rollout: identity and isolation first, NEWAX's own apps second, other people's code third, other people's money last

> **Status: proposed, not yet built.** This is a sequencing decision with
> reasons, each phase gated by evidence, not a roadmap of hopes. Nothing in
> docs 184–194 exists yet. Part of [doc 184](./184-app-platform-overview-and-remote-only-decision.md)'s
> program (ADR-073).

## 1. The ordering principle

Each phase introduces **exactly one new trust relationship**, and ships only
once the previous one has run in production long enough to trust:

| Phase | New trust relationship | Why it comes here |
|---|---|---|
| 0 | None — core identity and delivery with no app at the other end | Every later phase stands on `ApiClient`, the guard branch, the actor refusals and the delivery engine. Getting them wrong later means getting them wrong for every app at once |
| 1 | A tenant ↔ an app **NEWAX itself wrote and runs** | Proves install, consent, events, API, provider binding, suspension, the kill switch and uninstall end to end, while the code at the other end of the socket is still NEWAX's own |
| 2 | A tenant ↔ an app a **contracted third party** wrote and runs | The first time someone else's code holds a tenant credential — under a signed agreement, a verified domain and an ops-issued publisher key |
| 3 | Money **one way**: the tenant pays NEWAX for an app | Uses the invoice NEWAX already collects; no payable to anyone else |
| 4 | **Anyone** can publish, and NEWAX pays publishers | Self-service developers and revenue share, gated on legal confirmation and a real collection record |

A packs storefront is **not** a later phase. It is refused (doc 184 §2).

## 2. Phase 0 — the foundation, invisible to users

**Builds:**

- **WO-195.0 — the outbox lease.** `OutboxEvent.claimedAt`, reclaim after 5
  minutes, and the in-flight batch finished before `PrismaService`
  disconnects on shutdown. This is doc 163 §7's own prescription ("a lease
  on `PROCESSING` rows that is reclaimed when it lapses"), prerequisite here
  because the app fan-out runs inside dispatch (doc 194 §2.14).
- **Doc 189 core**: `User.principalKind` and every refusal of §7;
  `ApiClient`, `ApiClientToken`, `ApiClientRequestLog`;
  `ApiClientAuthService`; the `JwtAuthGuard` branch; `decideApiKeyAccess()`
  generalised; `CHECKER_PERMISSIONS`, `API_CLIENT_EXCLUDED_PERMISSIONS`, and
  the three `NON_DELEGATABLE_PERMISSIONS` entries.
- **Doc 188 core**: `OutboxDelivery`, `OutboxSubscriberRegistry`,
  `OutboxFanOutListener`, `OutboxDeliveryDispatcher`, `safe-https.ts`,
  `webhook-signature.ts`, the `dispatch()` metadata argument.
- **Permissions seeded for real**: the three tenant keys, the `connections`
  group, and the `RoleGrant` migration onto live `Admin` roles (doc 187 §8).

**Review routing:** everything under `core/auth/**` goes through the
`security` routing (`docs/index/cross/model-routing.md`) before merge, as
doc 170 §3.2 requires for its own auth change.

**Exit gate — all of:**
- `api-clients.e2e-spec.ts` green (doc 189 WO-189.8), including the
  two-database isolation test;
- `session-only-routes.spec.ts` extended and green;
- the doc 188 fault-injection acceptance (one subscriber down for an hour, no
  other affected) passing against a test source registered in the spec;
- `pnpm lint && pnpm typecheck && pnpm test` clean, and
  `scripts/check-no-remote-code.mjs` (doc 184 WO-184.2) wired into
  `pnpm lint` with its self-test.

## 3. Phase 1 — NEWAX's own apps, invite-only, free

**Builds:** doc 185 (schema, platform read API, tenant proxy, Browse and
listing screens); doc 186 minimal (NEWAX as the **only** `AppPublisher`,
automated checks, the conformance run, the ops **Apps** tab); doc 187 in
full; doc 188's app and platform sources; doc 190 for `COURIER`; doc 191 in
full (uninstall, tenant suspend, feed, kill switch, key confirmation,
reconciliation); doc 193's service accounts, which reuse everything above
and complete doc 34's own deferred case; doc 194's rows and tests.

**NEWAX's own apps go through the identical pipeline** — review,
conformance run, consent — with `isFirstParty = true` changing only the
badge. A pipeline that exempted NEWAX would be unproven when the first
outsider arrived.

**The first catalogue: three apps, each proving a different part of the
loop.** Each is built by NEWAX as a **separate remote service** in its own
repository and deployment. None is a module in this repository — the
remote-only rule applies to NEWAX's own apps too (doc 184 §2):

| App | Proves | Grant | Band (doc 187 §4.2) |
|---|---|---|---|
| **A courier app** for the one courier the first pilot tenant actually uses — WO-6.3 names PostEx/Leopards/TCS and says to build "only the one the shop actually uses" | App-as-provider (`CourierProvider` protocol v1), inbound courier webhook, the provider switch, the 30-day grace | `fulfilment.manage`, `orders.manage`; topics `order.placed`, `fulfilment.shipment_status_changed` | Two-person (`medium`) — also exercises ruling 16 on a Solo pilot |
| **An accounting-export app** for the accounting system a pilot tenant uses (QuickBooks or Xero — doc 160's own named need) | A read-heavy API grant, event-driven sync, `ExternalRecordLink`-style mapping kept on the app's side | `orders.manage`, `finance.view`; topics `order.placed`, `payment.succeeded`, `payment.refunded`, `receivables.credit_note_issued` | Two-person (`medium`) |
| **A read-only reporting app** (doc 34's "a client's own BI tool") | The single-approver band, whole-node scope stated honestly, rate limiting under bulk reads | `analytics.view`, `reports.view` | One person (`low` only) |

Which courier and which accounting system are the **owner's choice**, made
from the pilot tenants actually enrolled — never guessed here (doc 15's
discipline).

**Visibility:** `INVITE_ONLY`, with `AppListingInvite` rows for pilot
tenants and the review sandbox. **Price:** free (`FLAT_MONTHLY` at 0).
**Enrolment:** each pilot tenant needs a `MarketplacePublisherCredential`
whose key is in its `MARKETPLACE_API_KEY`. Today that is a manual ops step
per tenant, because provisioning never writes a tenant's environment
(`ProvisioningService`). That is acceptable for pilots and is Phase 2's
first work order.

**Exit gate — all of:**
- every pilot tenant installed, used, suspended, reinstated, uninstalled and
  reinstalled each app, with the consent rows and evidence audit to show for
  it;
- **a live kill-switch drill**: suspend a listing, measure the time to
  refusal on every pilot tenant (target < 2 min), reinstate by a
  *different* ops principal, and confirm old tokens are not revived;
- **a key-rotation drill** through the fast track, with the well-known
  confirmation (doc 191 §4.3), including a simulated unconfirmed key that
  must never mint;
- **a fail-open drill**: the control plane taken down for an hour, apps
  still working, the warning showing;
- zero cross-tenant access incidents, and reconciliation mismatches all
  explained;
- a decision recorded in `DECISIONS.md` to open Phase 2, citing the drill
  results.

## 4. Phase 2 — contracted partner publishers

**Builds:** doc 186 in full for invited partners: `AppPublisher` creation and
`AppPublisherCredential` issuance under `platform.apps.publishers.manage`,
domain verification, report intake, the policy page and the developer
contract page. Doc 190 `PAYMENT` becomes available, but only to a partner
whose licensing attestation passes review.

**WO-195.1 — directory enrolment without a human per tenant.** Issue the
directory credential at provisioning and deliver it to the tenant's
environment. The delivery mechanism is either doc 171's per-tenant Build
Manifest/Update Agent, if that is built first, or a step behind the existing
`DeploymentProvisioner` extension point (`apps/platform/src/modules/tenants/deployment-provisioner.ts`).
This decision belongs in `DECISIONS.md` when this work order is scheduled,
not now. Until it is done, each tenant is enrolled by hand, which caps how
many tenants Phase 2 can reach and is stated as that limit.

**Visibility:** a partner app starts `INVITE_ONLY`, then goes `PUBLIC` after
30 days with no unresolved `SECURITY` or `DATA_MISUSE` report, by ops
decision.

**Exit gate:** a full quarter meeting doc 186 §3.4's review SLAs; the report
loop exercised end to end at least once, from intake to resolution to
publisher and tenant notices; no unresolved security report; WO-195.1 done.

## 5. Phase 3 — paid apps, NEWAX-collected, no payouts

**Builds:** doc 192 WO-192.1 to 192.5 and 192.8: plans, subscriptions,
arrears pricing, add-on lines on the one invoice, the `ONE_TIME_LICENSE`
branch change, and credit notes. **Only first-party apps are paid** in this
phase (`publisherShareBps = 0`), so no money is owed to anyone but NEWAX.

**Exit gate:** a full quarter of invoices carrying app lines, issued and
collected; the credit-note path used at least once in production;
reconciliation mismatches zero unexplained.

## 6. Phase 4 — the open directory and revenue share

**Entry gate — all four, each recorded:**
1. **WO-192.0**: legal and accounting confirmation (seller of record,
   trade-payable characterisation, VAT/withholding, payout rail,
   principal versus agent) recorded as its own ADR in `DECISIONS.md`.
2. **WO-192.6**: a general "invoice paid" record on `PlatformInvoice` for every
   tenant, not only Stripe-linked ones.
3. **Doc 186 §2.1**: the developer sign-in, OIDC with a proven second factor
   and subject binding, having passed a `security` review.
4. **Review capacity** staffed to Phase 2's SLAs at the projected submission
   volume. ADR-073 names review as an ongoing operational cost for exactly
   this reason.

**Builds:** self-service publisher onboarding, WO-192.7 (payables, payout
runs, holds), `PUBLIC` as the default visibility after review, and the
decision on cross-tenant anomaly signals (doc 186 §5.2), taken as its own
ADR because it widens what crosses doc 39's boundary.

## 7. Deliberately later, and deliberately never

| Item | When | Why |
|---|---|---|
| A storefront for module packs | **Never** under ADR-073 | In-process third-party code (doc 184 §2) |
| An app UI inside the NEWAX admin | After Phase 4, if asked | Only as a sandboxed, separate-origin iframe with doc 113's embed tokens — never doc 143's federated JavaScript |
| Brand- or branch-scoped installations | After `ENTERPRISE-SCALE.md` L2 is enforced | A consent screen must not promise what routes do not enforce (doc 185 §2.3) |
| Per-seat and usage-based app pricing | After Phase 3, per metric | Each needs a meter decision (doc 192 §8) |
| Refunds through a payment app | After `PaymentProvider` gains a refund method | Doc 190 §4.1 |
| Apps behind `AiProvider`, `StorageDriver`, `NotificationChannel`, `IdentityProvider`, `VectorStore` | Own decision each | Each routes tenant data wholesale through a third party (doc 190 Out of scope) |
| `FiscalComplianceProvider` apps | After doc 15/181's interface exists with a first built implementation | Doc 190 §6 |
| Moving `TradingPartnersService.pushOutbound()` onto the delivery engine | Any time after Phase 0 | Doc 188 WO-188.10; fixes doc 18 §18.3's untrue claim |

## 8. Dependencies on documents that are themselves unbuilt

- **Doc 170's `connections` permission group.** This program creates it if it
  ships first (doc 187 §8).
- **Doc 172's `connectors` module** (docs 36/132/160/162). Not needed for
  Phases 0–3. Doc 193's routing screen hides connector rows until it exists,
  and service accounts need only doc 189.
- **Doc 170 §3.4's staff sign-in for `apps/platform`.** Not needed: the ops
  tab uses the existing pasted ops key, like the other eight tabs.
- **Doc 39's ops-client bootstrap gap.** It applies unchanged: the reviewer
  ops clients are created the way every other ops client is today.

## Scope lenses

Every mechanism's lenses are answered in docs 185–194. What sequencing
itself decides:

**Three silhouettes, and the day the tier above appears** — every phase
ships at all three editions at once, because installations are per node.
A Solo pilot exercises ruling 16's fallback in Phase 1 on purpose, so the
Solo path is proven before any outsider depends on it.
**The absent collaborator** — every phase is shippable with the next one
absent. Phase 1 without Phase 3 has free apps only; Phase 3 without Phase 4
has no payables; and `app-installations` stays `offByDefault: true`
throughout, so a deployment that never enables it never runs any of this.
**The threshold nobody approves alone** — opening each phase is a recorded
decision in `DECISIONS.md` citing the previous phase's exit evidence, never
a calendar date.
**The failure path, and who is allowed to walk it** — a failed exit gate holds
the next phase. The failure is recorded in the same `DECISIONS.md` entry
that would have opened it, with what must change.
**Every other lens** — n/a to a sequencing decision; see the owning
documents.

## Work orders

**WO-195.0 — the outbox lease** (§2).
**WO-195.1 — directory enrolment at provisioning** (§4), mechanism decided
when scheduled.
**WO-195.2 — the three first-party apps**, each in its own repository and
deployment, each submitted through the ordinary pipeline.
**WO-195.3 — the drills**: kill switch, key rotation, fail-open, and a
reinstall — scripted so they can be rerun each quarter.
**WO-195.4 — the phase-gate records**: one `DECISIONS.md` entry per gate,
opened or held, with the evidence.

## Acceptance

- No Phase *n+1* work order is merged before Phase *n*'s gate entry exists in
  `DECISIONS.md`.
- None of the three first-party apps is a module, pack, fragment or any other
  code in this repository.
- The Phase 1 drills are scripted and rerunnable, and their measured numbers
  are recorded in the gate entry.

## Out of scope

Go-to-market for the directory (partner recruitment, pricing of NEWAX's own
apps beyond "free in Phase 1"). Those are commercial decisions for the
owner, and this document sequences only what must be proven before each is
safe to make.
