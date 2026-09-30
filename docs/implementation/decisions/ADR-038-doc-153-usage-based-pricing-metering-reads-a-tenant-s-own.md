# ADR-038 — Doc 153 (usage-based pricing): metering reads a tenant's own transactional outbox through `apps/platform`'s existing connection-per-call mechanism, never a new tenant→platform push credential; dunning reuses doc 145's shape only, not its code

[← Decision log](../DECISIONS.md)


### Context — what problem required a decision?

Doc 153 (`commercial-licensing-agency/153-usage-based-pricing-model.md`)
asks for event-driven metering: its own §2 pseudocode shows a listener
decorated `@OnDomainEvent(DomainEvent.OrderStatusChanged)` calling
`this.usageMeters.increment(...)` directly, and its own Scope lenses
require every `UsageMeter`/`PlatformInvoice` row to live in
`apps/platform`'s own control-plane database, "never inside a tenant's own
isolated database." Those two statements are only reconcilable if
something crosses the app boundary between a tenant's `apps/api` deployment
(where `OrderStatusChanged` actually fires, confirmed still firing for a
POS sale — WO-68.1 — before starting this work) and `apps/platform` (a
separate process, separate database, no code import possible either way).
Taken literally, the pseudocode would need a brand-new tenant→platform
authenticated push channel: an endpoint, a per-tenant credential, and a
guard resolving that credential back to a `PlatformTenant`. But doc 153's
own Scope lenses, in the very same document, answer "the actor with three
tables / the principal with no permission key / the grant that ends itself"
with "n/a — not a new actor." A key-hash principal is explicitly one of
this codebase's own three canonical actor tables (CLAUDE.md's "actor with
three tables" lens lists it alongside `User`/`Party`/`Contact`), so a new
tenant-reporting credential would itself be exactly the new actor the same
document says not to introduce. Separately, WO-153.3 asks to reuse doc
145's "Invoice/aging/dunning design pattern... in `apps/platform`" — but
doc 145's actual `CreditNote`/`DunningCron`/`CustomerCreditTerm` code lives
in `apps/api/src/modules/receivables/`, a different app with a different
Prisma schema; importing it into `apps/platform` is not merely undesirable,
it is impossible (two separate `package.json`s, two separate generated
Prisma clients, no shared runtime).

### Options Considered

1. **Build a new tenant→platform push channel**: a `TenantUsageCredential`
   model (key-hash, one per tenant), a guard resolving it, an
   apps/api-side `@OnDomainEvent` listener calling out over HTTP on every
   `OrderStatusChanged`/notification-send. Rejected: introduces exactly the
   new actor/principal doc 153's own Scope lenses rule out, opens a new,
   unreviewed trust boundary (tenant deployments now write financial facts
   into the control plane, the opposite direction from every existing
   cross-app connection), and is a separable, materially larger capability
   (a general tenant-facing reporting/webhook mechanism, complete with key
   provisioning and rotation) that doc 39/50/51 themselves left unbuilt for
   `PlatformUsageRecord` — verified: zero ingestion endpoint exists for it
   anywhere in this codebase today, and zero `PLATFORM_*`-aware code exists
   in `apps/api` at all.
2. **Import doc 145's actual receivables code into `apps/platform`.**
   Rejected outright — not a design tradeoff but a category error: the two
   apps have separate Prisma clients, separate schemas, and this repository
   has no shared-runtime mechanism between them; the two "PlatformInvoice
   dunning" and "tenant AR CreditNote" concepts do not even share a
   `customerId`/`Contact` vocabulary to key against.
3. **`apps/platform` reads a tenant's own `OutboxEvent` table directly**,
   through the identical connection-per-call mechanism
   `SeatCounterService.countBillableSeats()` already established and this
   same doc's WO-153.2 explicitly names for reuse ("this exact pattern...
   for other snapshot dimensions"): open a short-lived, read-only Postgres
   connection via `TenantCredentialResolverService`, run a narrow query,
   close it, cache nothing. A per-tenant `UsageMeteringCursor` checkpoint
   (a new row in `apps/platform`'s own database, not a new actor) tracks
   how far each tenant's outbox has been read. For dunning, build only the
   minimal shape doc 153's own acceptance criteria actually require (a
   `dueAt`/`dunningReminderSentAt` pair and one reminder cron) rather than
   any of doc 145's own code. Selected.

### Decision — what was selected?

Option 3, on both halves of the problem:

- **Metering.** `UsageMeteringService` (`apps/platform/src/modules/
  billing/usage-metering.service.ts`) opens one scoped connection per
  tenant per poll (via the existing `TenantCredentialResolverService`),
  reads `OutboxEvent` rows named `order.status_changed` /
  `notification.sent` created after that tenant's own
  `UsageMeteringCursor`, batches an `Order.grandTotal` lookup for the
  `DELIVERED` rows over that same connection, closes it, and applies every
  increment/reversal to `UsageMeter`/`MeteredOrderFee` inside a single
  `apps/platform`-local transaction that also advances the cursor. The only
  live cross-database connection this introduces runs in the same
  direction, with the same narrowness (connection-per-call, read-only nothing cached),
  that doc 39 already reviewed and shipped for `SeatCounterService` — never
  a new one in the opposite direction. The one `apps/api` change this
  requires is a single new domain event, `DomainEvent.NotificationSent`,
  published from `NotificationsService.send()`'s already-consolidated call
  site (doc 153 §2's own "one meter, not three") — not a new mechanism,
  one more row shape flowing through the outbox `apps/api` already has and
  already durably retries via `OutboxDispatcher`.
- **Dunning.** `PlatformInvoice` gains `dueAt` (computed at issuance for
  every pricing model, from `PLATFORM_INVOICE_NET_TERMS_DAYS`) and
  `dunningReminderSentAt`; `InvoiceDunningCron` sends exactly one reminder
  per overdue, unreminded invoice. A multi-stage escalation ladder,
  automatic suspension for non-payment, and a tenant-facing statement page
  are doc 145's own further shape and are named here as a future extension
  of this same pattern, not built now — doc 153's own acceptance criteria
  test none of them.
- **A `RETURNED` reversal that lands after its period's own invoice was
  already issued** credits that invoice via the *existing*
  `PlatformInvoiceCreditNote` model (doc 50) instead of mutating a closed
  period's `UsageMeter` row — doc 153's own "undo fan-out" scope lens
  answered literally: "doc 145's own `CreditNote` mechanism... is the
  correct tool," read here as apps/platform's own already-shipped
  credit-note model, since that is the CreditNote mechanism this database
  actually has.
- `UsageMeter.tenantId` (not the doc's own literal `organizationId`
  spelling) — apps/platform's schema names this identity `tenantId`
  everywhere else (`PlatformInvoice`, `PlatformSubscription`,
  `PlatformUsageRecord`, ...); `apps/api`'s own `Organization` model is an
  unrelated, optional, Organization-edition-only B2B concept with no
  relationship to a `PlatformTenant`. Matching this schema's own existing
  vocabulary is not a deviation in shape, only in spelling.

### Reasoning — why?

Every rejected option either introduced the new actor doc 153's own Scope
lenses explicitly disclaim, or asked for something structurally
impossible (importing one Nest app's Prisma-bound service code into a
second app with its own separate schema). Reading a tenant's own outbox is
not a new mechanism invented for this doc — it is the SAME mechanism this
repository already trusted enough to ship for seat counting, applied to one
more read. This keeps every cross-app data flow in this codebase flowing
in exactly one direction (`apps/platform` reaches into a tenant's database,
narrowly and briefly, never the reverse), which is the actual security
property doc 39's shared-infrastructure/isolated-data boundary is
protecting, not merely a coincidence of today's feature set.

### Consequences

- A tenant on `FLAT_MONTHLY`/`PER_SEAT`/`ONE_TIME_LICENSE` is never polled
  and accrues zero `UsageMeter` rows (`pollTenant`/`snapshotAllowances`
  both return immediately for a non-`USAGE_BASED` plan) — doc 153's own
  first acceptance criterion, satisfied structurally rather than by a
  filter that could be forgotten later.
- Metering freshness is bounded by the cron's own cadence (every 5 minutes
  for the fee/messages meter, daily for the allowance snapshot), not
  instantaneous — an explicit, acceptable tradeoff for "never a slow
  end-of-month aggregate scan," not "always real-time."
- If a future capability genuinely needs a tenant to push a fact into the
  control plane in real time (not just usage metering), that is the
  separable, larger capability named in Option 1 above — a proper
  tenant-reporting credential/principal, its own security review, its own
  provisioning story — sequenced as its own work order if and when a real
  requirement forces it, never retrofitted quietly onto this one.
- `PlatformOpsClient` provisioning itself remains exactly the pre-existing,
  already-tracked gap it was before this work order (no seed/bootstrap
  script exists for ANY of this app's ops scopes, `platform.billing.manage`
  included) — `platform.billing.approve` is added to the
  `PLATFORM_PERMISSIONS` catalogue by this work order, but, like every
  scope before it, reaches a live `PlatformOpsClient` only when hosting-ops
  provisions one by hand today; this is named honestly rather than claimed
  fixed by a work order that did not touch it.

### Status
**Accepted.**
