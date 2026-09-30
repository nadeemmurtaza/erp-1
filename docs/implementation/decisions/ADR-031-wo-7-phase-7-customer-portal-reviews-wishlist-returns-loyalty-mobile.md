# ADR-031 — WO-7 (Phase 7: customer portal, reviews, wishlist, returns, loyalty, mobile parity) built against a missing Phase 6 — tracking/invoice/returns scope narrowed, loyalty math, self-referral guard limits, WO-7.9 mobile parity

[← Decision log](../DECISIONS.md)


### Context
`docs/implementation/customer-portal-loyalty/07-customer-portal.md` (WO-7.1
through WO-7.9) names Phase 6 as a dependency for WO-7.2 (order tracking,
reorder, invoices) and WO-7.3 (self-service returns). Phase 6
(fulfilment/shipping) does not exist anywhere in this codebase — no
shipment, carrier, or tracking-event model, no fulfilment queue. Building
the whole capability per this file's "Feature scope" section required
deciding what to build against a dependency that is not there, rather than
either blocking on it or silently inventing Phase 6 inside this work order.

### Options Considered and Decisions

1. **WO-7.2's tracking timeline reuses the existing `OrderStatusEvent`
   history instead of a new `ShipmentEvent`/carrier model.** Building a real
   shipment model is Phase 6's own job — a fulfilment queue, carrier
   integration, and label/tracking-number lifecycle are separably large
   pieces of work this order only touches in passing ("the other side of
   the same transaction" lens: the operator-facing fulfilment queue this
   would need doesn't exist to feed it). `OrderStatusEvent` already records
   every state transition an order goes through server-side today
   (`PENDING` → `PAID` → ... → `DELIVERED`), so the customer-facing timeline
   renders that real history rather than fabricating carrier-style
   milestones the system has no way to populate honestly. When Phase 6
   ships a real shipment/tracking model, this timeline is the one place
   that needs to switch its data source — not rebuilt from scratch.

2. **Reviews/returns/loyalty permission keys were backfilled as real
   `RoleGrant` rows on the dev database, not left as `Permission` rows with
   no live grant.** This codebase carries a known, tracked two-layer gap
   (`CLAUDE.md`'s own "Feature scope" section names it explicitly):
   `seedPermissions()` is additive and always runs, but `seedRoles()` (the
   backfill from the legacy `RolePermission` enum table into the real
   `Role`/`RoleGrant` system) is strictly one-time and no-ops once any
   `Role` row exists — which this long-lived scratch/dev database already
   has. Adding `reviews.moderate`, `returns.view`/`.manage`,
   `loyalty.view`/`.manage` to `ROLE_PERMISSION_SEED` and re-running the
   seed therefore populated `RolePermission` but granted nothing to a real
   `User` through `UserRoleAssignment`. A one-off script
   (`apps/api/prisma/_scratch-backfill-role-grants.ts`, run once against
   this dev database and then deleted — not committed, since it fixes a
   local database's state, not the codebase) mirrored `seedRoles()`'s own
   backfill logic scoped to just these five keys, so ADMIN/STAFF actually
   hold the grant a real login checks, matching this file's own
   "reachable... every permission seeded through to a real grant" rule
   rather than repeating the exact gap it names as a trap. (`returns.view`/
   `.manage` were later removed outright, not just re-backfilled, when
   WO-7.3's own module was retired in favour of WO-6.6's — see §9.)

3. **The order invoice is a browser `window.print()` page with Tailwind
   `print:` variants, not a server-rendered PDF.** There is no PDF-
   generation library anywhere in this codebase's dependency tree today.
   `.claude/rules/dependencies.md` requires checking the stdlib, the
   framework, and existing utilities before adding a dependency, and
   requires justification for a new one — a one-off "print this order" page
   is fully served by the browser's own print-to-PDF path with print-
   specific CSS (hiding nav/chrome, forcing the receipt-style layout),
   which every modern browser already provides for free. Adding a PDF
   library for a single invoice screen would be exactly the unjustified
   dependency this codebase's own rule warns against; the browser-print
   approach is revisited if a future work order needs invoices generated
   server-side (emailed, bulk-exported) rather than viewed and printed by
   the customer themselves.

4. **WO-7.3's returns are customer-request-and-staff-decision only — no
   automatic refund issuance or stock restock on approval.** `PaymentsService.refund()`
   and `InventoryService.move()` both already exist and are called
   elsewhere in this codebase, but wiring "return approved" to
   automatically reverse the sale (issue the refund, restock the returned
   variant) is exactly the kind of same-transaction afterlife work Phase 6
   is named to own — the doc's own dependency line says so. What WO-7.3
   ships is the complete transaction as far as this phase's dependency
   allows: a customer can request a return against an eligible, delivered
   order (with a quantity guard against the item's own order quantity), see
   its status, and staff can approve or reject it with a reason, generating
   the record and audit trail a future Phase 6 refund/restock step will
   consume as its input — not a return flow that silently claims to
   refund when it does not.

5. **Loyalty earn/redemption math**: points accrue as a flat rate off the
   order subtotal at the moment the order is marked `DELIVERED` (not at
   placement, so a cancelled or returned order before delivery earns
   nothing and needs no reversal path), and are reversible exactly once,
   guarded by the same `rewardedAt IS NULL` conditional-update idiom this
   codebase already uses for backorder/stock idempotency — a second
   `DELIVERED` event or a retried outbox delivery cannot double-award.
   Redemption debits a customer's points balance inside the same
   transaction as the store-credit issuance it produces (via
   `StoreCreditService.creditInTransaction()`, new in this work order),
   guarded by a `balance >= amount` conditional `updateMany` rather than a
   read-then-write, so two simultaneous redemption requests cannot both
   succeed against the same balance.

6. **Referral self-referral guard is a same-account/same-order check only —
   it does not attempt device fingerprinting or IP-based fraud detection.**
   This codebase has no device-fingerprinting or fraud-scoring
   infrastructure anywhere, and building one is a separably large piece of
   work no part of this doc names. The guard blocks the mechanically
   detectable case (a referral code redeemed against the referrer's own
   account, or the same order id credited twice) rather than silently
   claiming to prevent all abuse; a determined bad actor using two real
   accounts is a known, named limitation, not a gap discovered later.

7. **WO-7.9 (mobile app parity) was built as a follow-up pass, once
   WO-7.1–7.8 were verified, rather than folded into the same pass.**
   `apps/mobile` is a separate application with its own build and component
   library; sequencing it after the backend and web surfaces were already
   tested against a real database meant every mobile screen could be built
   directly against a proven API contract rather than a moving target. This
   mirrors this same body of work's own precedent of sequencing genuinely
   separable pieces (Giftkarta after WO-5). Every screen the doc names —
   returns, tracking timeline, credit and gift cards, reviews, wishlist,
   loyalty and referrals — plus notification preferences (named by the
   phase's own work-order list, if not by WO-7.9's one-sentence summary)
   now exists in the Expo app, reachable from the account tab, with wording
   drawn from the same terminology as the web catalogue's `account.*`
   strings (`apps/mobile/src/i18n/messages.ts`'s own test already enforces
   its en/ur catalogues stay in step; there is no separate web-vs-mobile
   wording test, so this ADR is where that intent is recorded instead).

8. **Two narrow, honest gaps inside WO-7.9 itself:** the mobile wishlist
   requires sign-in — there is no on-device guest wishlist store to build
   and migrate the way `apps/web/src/lib/wishlist.ts`'s pre-existing
   `localStorage` implementation forced WO-7.6 to. Building a parallel
   AsyncStorage-backed guest wishlist with its own migration flow, purely
   to mirror a web implementation detail that exists there only because it
   predates the server-side model, would be a duplicate implementation of
   the same migration logic already shipped once for a real reason. A
   signed-out tap on the mobile "Save" button routes to sign-in instead.
   Separately, the order invoice — a browser `window.print()` page — is
   opened from the order screen via `Linking.openURL()` to the storefront's
   own origin (`EXPO_PUBLIC_SITE_URL`, mirroring `EXPO_PUBLIC_API_URL`'s own
   env-var pattern in `src/api/client.ts`) rather than rebuilt as a native
   share sheet or a second PDF pipeline — the same "no PDF dependency to
   build on" reasoning from §3 above, applied to the app that has even less
   precedent for one than the web app does.

### Consequences
- The tracking timeline, invoice, and returns flow are each real, working,
  and honestly scoped to what Phase 6's absence allows — none of them
  fabricate data the system cannot back.
- The two-layer permission-seeding gap is closed for this work order's five
  keys on the dev database specifically; it remains a standing trap for the
  NEXT work order to add a permission key against a long-lived database,
  and is not fixed at the seed-script level by this ADR (that would be a
  separate, larger change to `seedRoles()`'s own one-time-ness, out of
  scope here).
- Phase 6 shipped independently, on a different branch, before this branch
  merged — WO-7.3's own return module was retired outright rather than
  extended in place, since the two turned out to be duplicate
  implementations of the same capability once merged (§9). WO-7.2's
  tracking timeline was NOT revisited to consume Phase 6's real
  `ShipmentEvent` data (a named follow-up, not done here — see the Phase 7
  status blockquote's own §1 note).
- WO-7.9 is built and verified (`apps/mobile` typecheck, its own Jest suite,
  and the repository's full `pnpm typecheck`/`pnpm test` all pass with it
  included) — Phase 7's exit criterion #6 ("every web portal feature exists
  in the Expo app with identical wording") is met for every screen named in
  the work order, with the two narrow, named exceptions in §8 above, and
  its own returns screen was subsequently rewired to WO-6.6's API (§9).

### Status
**Accepted.**

## ADR-031 §9 — WO-7.3's returns module retired in favour of Phase 6's WO-6.6, discovered at merge time

### Context
WO-7.1 through WO-7.9 (this ADR, §1–§8) were built and merged to a local
branch before Phase 6 (`docs/implementation/shipping-fulfilment-returns/
06-shipping-fulfilment-returns.md`) existed anywhere in this codebase —
§1's own reasoning explains why WO-7.2 and WO-7.3 were scoped narrowly
around that absence. Independently, and without visibility into this
branch, another session built the whole of Phase 6 (WO-6.1 through WO-6.8:
shipping zones/rates/methods as real tables, the shipment lifecycle,
courier providers, and — critically — WO-6.6, a complete returns/RMA
module) and merged it to `main` first. Merging this branch into `main`
afterward surfaced a genuine collision, not a textual one: both branches
had independently built a full "customer requests a return on a delivered
order" capability, each with its own Prisma model named `ReturnRequest`,
each with its own API module, and each with storefront pages at the
identical route (`account/returns`, `account/returns/new`,
`account/returns/[id]`). Two Prisma models sharing one name cannot coexist
in a single schema; keeping both implementations was never an option project
architecture allows either way (`CLAUDE.md`'s "a duplicate implementation is
a defect unless a documented boundary requires the separation" — no such
boundary applies here, since both are the same actor performing the same
job on the same entity).

### Options Considered and Decision
Two live implementations existed at merge time:
- **This phase's own** (`returns.prisma`'s `ReturnRequest`/`ReturnRequestLine`,
  the `returns` module, `/returns` and `/admin/returns`): customer
  request → staff approve/reject only, explicitly scoped narrow because
  Phase 6 did not exist yet (§1, §4 above). No restock or refund automation.
- **WO-6.6's** (`fulfilment.prisma`'s `ReturnRequest`/`ReturnRequestItem`/
  `ReturnReasonCode`, the `fulfilment` module's `ReturnsController`/
  `ReturnsAdminController`, `/returns` and `/admin/fulfilment/returns`):
  the full request → approve/reject → in-transit → received → inspect →
  resolve lifecycle, with real inspection-driven restock/write-off and a
  documented refund-issuance hook (`PaymentsService.refund()` first, then
  `resolve()` records the outcome) — exactly the automation this phase's
  own module named as Phase 6's future job.

**Decision: retire this phase's own returns module entirely and keep
WO-6.6's**, rather than keep both, merge them into one hybrid, or keep
this phase's as a "simple" alternative. WO-6.6 is not a rough draft of the
same idea — it is the complete version this phase's own doc comments
(`returns.prisma`'s file header, ADR-031 §1/§4 above) explicitly deferred
to "Phase 6" by name. Keeping the narrower module after the complete one
exists would not be "flexibility" (`CLAUDE.md`'s own "flexibility first"
framing) — it would be two disagreeing sources of truth for the same fact
("has this order been returned, and what happened to the money and the
stock"), which is exactly the kind of drift the "click the number" and
"authoritative source" lenses in `CLAUDE.md`'s feature-scope section exist
to prevent. Because this constituted deleting a chunk of code built earlier
in this same session, the owner was asked explicitly before proceeding
(per this repository's own "No deletion of any kind without the owner's
explicit confirmation" rule) and confirmed retiring the narrower module.

### What changed to retire it
- Deleted `apps/api/prisma/schema/returns.prisma` (the `ReturnReasonCode`/
  `ReturnRequestStatus` enums and `ReturnRequest`/`ReturnRequestLine`
  models), the `returns` field relations it added to `Order`/`OrderItem`/
  `User` in `core.prisma`/`orders.prisma` (WO-6.6 already added its own,
  differently-named equivalents), the `apps/api/src/modules/returns/`
  module (controller, service, DTOs), its `modules.registry.ts`/
  `module-packs.ts` registrations, its `SettingKey.ReturnsWindowDays`
  setting (unused once its only reader was deleted), and the returns-only
  keys from `PERMISSION_CATALOG`/`PERMISSION_GROUPS`/`ROLE_PERMISSION_SEED`
  (`returns.view`/`.manage` — `fulfilment.view`/`.manage` already covers
  the same access, seeded independently by WO-6).
- Stripped the `ReturnRequest`/`ReturnRequestLine` `CREATE TABLE` statements
  out of this phase's own migration (`.../20260924190000_add_customer_
  portal_reviews_wishlist_loyalty/migration.sql`, renamed from its original
  `..._returns_loyalty` to match) rather than leaving a migration that
  creates a table WO-6.6's own later migration also creates — verified by
  running `prisma migrate deploy` against a fresh scratch database, which
  applies both migrations in order with no naming collision.
  `test/customer-portal.e2e-spec.ts`'s own `returns` describe block
  (testing the now-deleted module's endpoints) was removed; return/RMA
  behavior is `fulfilment/returns.spec.ts`'s job now.
- On the web: took WO-6.6's `account/returns` pages as-is, deleted this
  phase's own `apps/web/src/app/(admin)/admin/(app)/returns/page.tsx` and
  its `nav-registry.ts` entry (WO-6.6's `/admin/fulfilment/returns` already
  covers it), removed the duplicate "Request a return" link this phase
  added to the order page (WO-6.6 already added its own, correctly pointed
  at its own `new` sub-route), and repointed `account/overview/page.tsx`'s
  `/returns` fetch to WO-6.6's actual `/returns/mine` route. This phase's
  own orphaned `account.returns.*`, `account.orders.requestReturn` and
  `order.requestReturn` translation keys (built for the now-deleted pages
  and buttons, confirmed unreferenced anywhere in `apps/web/src`) were
  removed from both `messages/en.json` and `messages/ur.json` — WO-6.6 uses
  its own top-level `returns.*` namespace and never reads them.
- On mobile (`apps/mobile`, WO-7.9): rewrote `app/returns.tsx` into
  `app/returns/index.tsx` (list only, mirroring WO-6.6's own
  `MyReturnsPage`) plus a new `app/returns/new.tsx` (the request form,
  mirroring WO-6.6's own `NewReturnRequestPage` — reasons fetched live from
  `GET /returns/reasons` rather than a fixed local enum, since WO-6.6's
  reasons are seeded, editable, and translated server-side), against
  WO-6.6's real API contract (`POST /returns` takes `items:
  [{orderItemId, reasonId, quantity}]`, not this phase's original `lines`/
  `reasonCode` shape). The order screen's "Request a return" button now
  opens `/returns/new?number=...` instead of the deleted list-with-picker
  flow. Mobile's own `returns.*` message keys were updated to match the
  web catalogue's wording exactly (`returns.statusRequested` = "Requested",
  not this phase's original "Awaiting review") — including WO-6.6's four
  additional lifecycle statuses (`IN_TRANSIT`, `RECEIVED`, `INSPECTED`,
  `CLOSED`) this phase's own enum never had.

### Consequences
- One returns system exists, not two — `fulfilment.prisma`'s
  `ReturnRequest` is the only model by that name, `fulfilment`'s
  `ReturnsService` is the only implementation, and every surface (admin
  web, customer web, customer mobile) now points at it.
- The full API/database verification for this consolidation is a single
  paragraph, not a claim: `prisma migrate deploy` against a dropped-and-
  recreated scratch database applies all 65 migrations including both this
  phase's (stripped of returns) and WO-6.6's own, in order, with no
  collision; `prisma generate` succeeds; the full `apps/api` Jest suite
  (120 suites / 1198 tests) passes; `apps/mobile`'s own typecheck and Jest
  suite (including its en/ur parity test) pass; the repository's full
  `pnpm typecheck` (9/9 packages) and `pnpm lint` pass.
- Running the full `pnpm test` surfaced one pre-existing gap in WO-6.6's own
  work, unrelated to the returns consolidation itself:
  `PERMISSION_CATALOG`'s `fulfilment.view`/`.manage` (added by WO-6, both
  branches untouched by each other on this file) were never added to any
  `PERMISSION_GROUPS` entry, which `packages/shared/src/permissions.spec.ts`'s
  own "every catalog key appears in a group" test already existed to catch
  — a test that would have failed on `origin/main` by itself, independent
  of this merge. Fixed here with a new `fulfilment` group (`Shipping &
  returns`), rather than left for a separate PR, since it blocks
  `pnpm test` for anyone building on `main` from this point on.
- WO-7.2's own tracking timeline was not revisited to consume Phase 6's
  real `ShipmentEvent` data even though that data now exists — it still
  renders `OrderStatusEvent` history, same as when it was built under the
  assumption Phase 6 did not exist. This is a real, named follow-up, not
  silently declared done.

### Status
**Accepted.**
