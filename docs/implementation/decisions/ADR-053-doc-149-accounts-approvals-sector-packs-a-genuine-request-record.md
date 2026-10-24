# ADR-053 — Doc 149 (`accounts`/`approvals` sector packs): a genuine REQUEST/RECORD split (`B2BOrderRequest`) rather than gating the generic checkout endpoint; the doc's own self-approval-refusal claim corrected against `ApprovalService`'s real behavior; an approval step widened to a Contact set, never a second chain mechanism

[← Decision log](../DECISIONS.md)


### Context

`MULTI-SECTOR.md`'s own module table names `accounts` and `approvals` as
capabilities a full B2B deployment needs but neither had ever been scoped
as a work order. Doc 149 asks for a thin layer over what already exists:
doc 145's `CreditTermsService.checkCreditAvailable()` for the credit gate,
and doc 63's generic `ApprovalChain`/`ApprovalStep` for the purchase-
approval gate. The real design question was never the schema sketch —
it was *where* the threshold gate lives relative to the generic,
already-shipped `POST /orders` checkout endpoint every buyer already uses.

### Options considered

1. **Gate inside the transaction.** Let `POST /orders` always attempt to
   place the order, and have `AccountProvider.initiate()` — running inside
   `place()`'s own transaction — detect an above-threshold order and
   somehow "convert" it into a pending approval mid-transaction. Rejected:
   `PaymentProvider.initiate()` never receives the transaction client (by
   design — providers stay pure/external-call-safe, `payment-provider.ts`'s
   own doc comment), so a request row written here would straddle a
   transaction boundary that could still roll back for an unrelated reason
   (stock, tax), leaving an orphaned or duplicated request.
2. **A `CheckoutValidator` registration.** `core/checkout/checkout-
   validator.registry.ts` (B3, `MULTI-SECTOR.md`) explicitly names "credit
   limits and approval holds" as intended consumers. Rejected as the sole
   mechanism: it can only return a veto (block) or allow — it has no
   sanctioned way to also create the underlying `B2BOrderRequest`+
   `ApprovalChain` as a side effect of that veto, and doing so would smuggle
   a write into an interface documented as a pure decision.
3. **A genuine REQUEST/RECORD split** (adopted) — mirroring
   `PurchaseRequisition`/`RequisitionService.convertToPurchaseOrder()`
   exactly: nothing above the threshold is ever an `Order` until a listed
   approver decides it. `AccountProvider.initiate()` (inside the generic
   checkout's own transaction) unconditionally refuses an order at or above
   the account's threshold — no side effect, no partial state — and a
   separate, explicit `AccountsService.submitOrderRequest()` creates the
   `B2BOrderRequest` + starts the chain. Approval calls
   `OrdersService.place()` for real, sequentially, after the approval's own
   transaction has already committed.

### Decision

Option 3. `B2BOrderRequest` (new `accounts.prisma`) holds the buyer's
submitted `PlaceOrderDto` verbatim as `Json` and replays it unchanged
through the SAME `OrdersService.place()` every other order already uses —
never a second order-creation path. `AccountsService.convertToOrder()`
claims the request via a race-safe `updateMany({where:{status:'APPROVED'}})`
before calling `place()`, identical to `convertToPurchaseOrder()`'s own
claim pattern, so a lost race or a retried call can never produce two
orders from one request.

`ApprovalSubjectType` gained one value (`B2B_ORDER`) and `ApprovalStep`
gained two additive columns — `approverContactIds String[]` (a SET any one
of whom may decide, not `approverContactId` singular: this document's own
schema sketch already showed a list, and a single-tier policy needs "any
one of N", not "this one specific person") and `decidedByContactId`
(`decidedById`'s own `@relation` is typed to `User`, so a Contact's id
cannot be written there — never a reinterpretation of the existing
column). Both `ApprovalService.start()`/`.decide()` were widened
additively (a new optional `actorKind: 'USER' | 'CONTACT'` parameter,
defaulting to `'USER'`) — both existing callers
(`RequisitionService`, doc 155's wallet service) are unchanged and their
own tests still pass unmodified in shape.

Doc 149's own text claims self-approval refusal is "the identical...
`ApprovalService.start()` already enforces, unchanged." Read against the
real code, this is false: `ApprovalService`'s own doc comment explicitly
disclaims it — "this service does not resolve who may decide a step... a
self-approval refusal is the caller's own concern." `RequisitionService
.decide()` already implements this refusal itself
(`requisition.requestedById === actorId`); `AccountsService.decide()`
does the identical check (`request.requestedByContactId === actorContactId`)
at the same calling layer, matching the ALREADY-CORRECT pattern this
document merely mis-described.

The generic `POST /orders` endpoint never completes an at-or-above-
threshold on-account order, full stop, under any payment-method
combination — `AccountProvider.initiate()`'s threshold check has no
"unless a pre-approval exists" branch, because there is no code path by
which the generic endpoint could ever consume one (submission and
conversion both live entirely inside the `accounts` module's own
service). Settlement of an on-account order reuses
`PaymentsService.approve()` — the identical "staff confirms a bank
transfer, or cash collected on delivery" endpoint every other unpaid
method already settles through — unchanged; no new settlement code exists
in this build.

`packages/shared/src/api-keys.ts`'s `CUSTOMER_SCOPE_CATALOG` gained
`b2b-account:read` only, deliberately no `:write`: `163-personal-api-
keys.md` §4 already excludes checkout entirely from that catalogue ("an
order-placement scope is its own work order") because a leaked storefront
key must never spend the customer's money. Submitting or deciding a
`B2BOrderRequest` can end in exactly that (`convertToOrder()` calling
`place()`), so both actions stay reachable only by `@AuthenticatedOnly()`
with no customer scope — session-only by the absence of a write scope,
the same mechanism checkout itself already relies on, not a new one.

No `organizationId` column on `B2BAccount`/`B2BPurchaseApprovalPolicy`/
`B2BOrderRequest` — the same deviation ADR-051 already documents for
`pricing.prisma`, restated here rather than re-derived. `accounts` is
classified `core` in `module-packs.ts` (a B2B capability, not a sector
pack) and registered `offByDefault: true` in `modules.registry.ts`, same
tier as `wallet`/`settlements`/`transfers` — a Solo deployment sees zero
behavior change with it off, satisfying this document's own Acceptance
criterion #1 by construction.

### Reasoning

`AccountsService.submitOrderRequest()` needed the buyer's own cart total
before it could even decide whether a request is above threshold, but
`OrdersService`'s own pricing logic (`priceCart()`) is private, and the
`accounts` module cannot import a DTO file from `orders`
(`scripts/check-module-boundaries.mjs`'s "depth" rule: a cross-module
import may only be a `.module` or a top-level `.service`, never anything
else — this applies even to a `type`-only import, since the checker
matches every `from '...'` clause regardless). Two consequences follow
from that one rule: (1) the submitted amount is computed via
`PricingService.resolvePrices()` directly against the cart's own items —
documented in `accounts.prisma`'s own header as an *approximation* used
only for the threshold decision, never the binding charge, which
`OrdersService.place()` always re-derives fresh at conversion time,
consistent with every other order's own "re-price from the database"
discipline; and (2) `OrdersService.validatePlaceOrderDto()` is a new
public method — the one way `accounts` can validate a buyer's raw
submission against `PlaceOrderDto`'s own decorators without ever
importing the class itself, mirroring `main.ts`'s global `ValidationPipe`
exactly (`whitelist`/`forbidNonWhitelisted`) so a submission accepted here
can never disagree with what checkout itself would have accepted.

`PaymentContext` gained two additive, optional fields — `contactId` and
`purchaseOrderReference` — threaded from `OrdersService.place()`'s own
already-resolved `Contact` lookup (the identical lookup doc 146's
`priceCart()` already performs for wholesale pricing, now returned
alongside `lines`/`totals` rather than re-derived a second time). Every
existing provider (`cod`, `bank_transfer`, `jazzcash`, `easypaisa`,
`giftkarta`) ignores both fields — zero behavior change for any of them.

Two new `KNOWN_MODULE_COUPLINGS` entries were required: `payments ->
receivables` (`AccountProvider.initiate()` needs `CreditTermsService
.checkCreditAvailable()` before checkout can commit — the identical
"checkout cannot commit without this number" pure-read reasoning
`orders -> tax`/`cart -> pricing` already establish, so `ReceivablesModule`
is now hard-imported into `PaymentsModule` the same way `TaxModule` is
hard-imported into `OrdersModule`; `receivables`'s own MODULES entry now
only gates its admin nav, restated in `receivables.module.ts`'s own header
comment) and `accounts -> orders` (`AccountsService.convertToOrder()`
hands an approved request to `OrdersService.place()` — "a channel that
funnels into the normal order-creation path," the identical reasoning
`pos -> orders` already establishes, though sequential rather than
same-transaction since `place()` always manages its own transaction).
Neither `AccountProvider` nor any other `payments` code imports anything
from `accounts` — it reads `B2BAccount`/`B2BPurchaseApprovalPolicy`
directly via `PrismaService`, the identical cross-module-read pattern
`reports.service.ts`/`AttendanceService` already use elsewhere, so no
`payments -> accounts` coupling was needed at all.

Every `prisma migrate dev --create-only` run against this session's
`erp_scratch` database again emitted unrelated `DROP INDEX` statements
for the same pre-existing vector/trigram indexes ADR-051 already names —
hand-edited out of `20260926152210_wo149_b2b_accounts_approvals` before
applying, per this repository's own migration discipline. The interactive
`prisma migrate dev` apply step itself hung on this session's Postgres
(a stale `DROP DATABASE IF EXISTS prisma_migrate_shadow_db_...` connection
holding the advisory lock past the point its own client had already
disconnected) — resolved by terminating that backend
(`pg_terminate_backend`) and applying with `prisma migrate deploy`
instead, which is non-interactive and does not create a shadow database.

### Consequences

- `OrdersService.validatePlaceOrderDto()` and the `customerId`/`priced`
  return shape of `priceCart()` are now a small, load-bearing public
  surface of `orders` for exactly one caller (`accounts`) — a future
  change to `PlaceOrderDto`'s own validation rules is automatically picked
  up by the buyer-portal submission path with no separate change needed,
  which was the whole point of not duplicating the DTO.
- `finance.credit-terms.manage` (reused, never a new key) gates the
  STAFF-side `B2BAccount`/policy admin screen; the buyer's own portal edits
  the SAME policy through a session-only, no-customer-scope route scoped
  to the account's own primary contact
  (`B2BAccount.customerId === contactId`) — two write paths to one
  underlying `upsert`, never two divergent ones.
- The buyer-portal's "edit my approval policy" UI ships read-only in this
  pass (threshold and approver names/phones, resolved server-side, since
  no customer-facing contact-directory endpoint exists to pick an approver
  from — `163-personal-api-keys.md` §4's own deliberate gap). The backend
  endpoint (`AccountsService.setMyApprovalPolicy()`, by Contact id) is
  built, tested, and reachable session-only; wiring a picker to it is
  future, separate work once a real customer-facing contact-lookup
  mechanism exists — named here rather than silently assumed complete.
- `pnpm index` must be regenerated (new module, models, routes, tests,
  screens) and `check-module-boundaries.mjs`/`module-packs.ts` are now
  load-bearing for two additional couplings, same discipline ADR-051
  already established.

### Status
**Accepted.**
