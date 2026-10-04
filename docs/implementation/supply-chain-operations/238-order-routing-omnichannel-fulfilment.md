# 238 — Order routing and omnichannel fulfilment: split shipments, ship-from-store, click and collect, endless aisle

> **Status: Planned (2026-10-04). Nothing built.** Architecture and rulings:
> [doc 236](./236-supply-chain-operations-architecture.md) (R28: routing
> decides where; only the node holding the goods records the stock fact).
> Decision record: ADR-088. Reads sourcing rules from
> [doc 239](./239-supply-network-sourcing-rules.md) when that module is on.

## Objective

An order, from any channel, is fulfilled from the best location _per line_:

- a DC or a store, split across at most a configured number of shipments;
- shipped to the customer, collected by the customer at a store, or shipped
  to a store for collection;
- confirmed by the location that actually holds the goods, and re-routed
  when that location rejects or comes up short.

A till can sell an item the store does not have and have it delivered from
elsewhere. With the module off, today's single-location behaviour is
untouched.

## Existing state (verified, 2026-10-04)

- `RETAIL-ERP.md` R26 and its implementation
  (`planning/online-stock.service.ts`):
  - `onlineStockFor()` sums **every** `VariantLocationStock` row for a
    variant, `IN_TRANSIT` included. WO-236.2 fixes this.
  - `assignFulfillingBranch()` moves a **whole order** to **one** location by
    reversing and re-committing stock inside one transaction
    (`planning -> inventory`).
- Web orders commit stock at `defaultLocationId()` at placement
  (`orders.service.ts` ~L384). Cancellation and returns restock at
  `order.locationId ?? defaultLocationId()` (~L996–1006;
  `returns.service.ts` ~L255). A split order would restock to the wrong
  place until WO-236.3 restocks from the ledger.
- `Order` has one `locationId`. `ShipmentItem` already lets a shipment cover
  part of an order, but `Shipment` has no ship-from location.
- `fulfilment` is hard-imported by `orders` for `ShippingService.quote()`.
  `ShippingMethod` has no pickup kind. Nothing models a pickup, a store
  acceptance, a pickup code or a no-show.
- `RETAIL-ERP.md` Part 5 assigned click and collect, ship-from-store and
  endless aisle to `fulfilment`. Doc 236 §4 records why they move to this
  module instead.

## 1. Design

**Routing is a decision followed by one writer** (canonical Ruling 3):

- `decideRouting(inputs) → RoutingPlan` is pure: no `prisma.` write, no
  `publish(`. Its inputs are:
  - order lines;
  - available-to-promise per candidate location (a read of
    `VariantLocationStock` over promisable location types, minus each
    location's walk-in reserve);
  - each candidate's `LocationRoutingProfile`;
  - lanes and sourcing rules from `supplynetwork` when on;
  - the active `RoutingPolicyVersion`.
- The plan is per-line `(locationId, quantity, mode)`, deterministic, with
  every tie broken by `Location.code`.
- `applyRouting(plan, tx)` is the single writer. For each line whose routed
  location differs from where placement committed it, it writes a pair of
  `InventoryService.move()` calls in one transaction with the
  `FulfilmentRequest` rows: release at the old location
  (`ADJUSTMENT`, `refType = 'Order'`, positive) and commit at the new one
  (`ADJUSTMENT`, `refType = 'Order'`, negative). This is
  `orderrouting -> inventory`, the `planning -> inventory` precedent.
  WO-236.3's restock-from-ledger then makes every later cancellation and
  return restock exactly where each unit was committed.

**Candidate selection without a maps dependency.** "Nearest" means fewest
transit days on a `SupplyLane` from the location to the ship-to address's
`SupplyRegion` (doc 239). With `supplynetwork` off, every promisable
location with stock is a candidate, scored on cover and split count alone.

**The fulfilment request lifecycle.** One request per (order, location,
mode). Status flow:

```
ASSIGNED → ACCEPTED → PICKING → PACKED → SHIPPED                  (SHIP)
ASSIGNED → ACCEPTED → PICKING → READY_FOR_PICKUP → COLLECTED      (PICKUP)
                                              ↘ EXPIRED
ASSIGNED → … → SHIPPED (to store) → ARRIVED_AT_STORE → READY_FOR_PICKUP → COLLECTED   (SHIP_TO_STORE)
any open state → REJECTED | SHORT  ⇒ re-route the remainder (bounded)
```

- **Accept and reject.** A store (or a DC without WMS) accepts within
  `LocationRoutingProfile.acceptWindowMinutes`, or the request re-routes
  automatically, excluding that location.
- **WMS sites.** At a site where `warehouse` is on, acceptance is automatic.
  The request becomes warehouse demand (doc 237), and
  `WarehouseShipConfirmed` / short-pick events drive its status.
- **Order status.** `orders` subscribes to
  `FulfilmentRequestStatusChanged` and advances `Order.status` to SHIPPED or
  DELIVERED only when every request is terminal. This is an event
  subscriber in `orders`, idempotent by status predicate.

**Click and collect.**

- At checkout, `fulfilment`'s `ShippingMethod` gains `kind = PICKUP`
  (additive enum, zero rate). The customer picks a location whose
  `LocationRoutingProfile.pickupEnabled` is true and whose ATP covers the
  basket.
- `Order.pickupLocationId` (additive bare scalar, the R11 precedent for
  additive order columns) records the choice. Placement commits stock at
  `pickupLocationId ?? defaultLocationId()`, a one-line change in
  `orders.place()`.
- **Ready for pickup.** A one-time 6-digit code is issued. Only its hash is
  stored, and the customer is notified through `notify` (event).
- **Handover.** Staff enter the code, or record an ID check, and the request
  becomes COLLECTED.
- **No-show.** After `pickup_hold_days` the request becomes EXPIRED. That
  opens a staff task to cancel and refund, or to extend. The refund is never
  automatic, because money moves.

**Ship to store.**

- The line stays committed at the DC. Goods travel as a `fulfilment`
  `Shipment` addressed to the store.
- The store's arrival scan moves the request to READY_FOR_PICKUP and moves
  no stock, because the goods are already sold.
- On expiry, the staff cancel action restocks at the **pickup** location
  (an explicit `restockLocationId` on the cancel call), because that is
  where the goods physically are.

**Endless aisle.** The till's "order for delivery" action places through
`OrdersService.place()`. That is the existing `pos -> orders` coupling, but
the web path, so stock commits at the default location and is then routed,
not at the till's own location. Channel is `POS`, `terminalId` and
`shiftId` are set, and the tender is taken by `pos` as today.

**Multi-node (R28, WO-238.7).** When candidate locations live in other
nodes:

- `applyRouting` writes no stock for them. It creates the request as a
  POLICY-class record replicated DOWN to the holding node.
- That node accepts or rejects, and records the stock movement itself, which
  replicates UP as a fact.
- ATP for a remote location is its replicated `VariantLocationStock` minus
  open requests not yet reflected in a replicated movement.

Gated on Tranche N (doc 236).

## 2. Schema — `apps/api/prisma/schema/order-routing.prisma` (new)

```prisma
enum FulfilmentMode   { SHIP PICKUP SHIP_TO_STORE }
enum FulfilmentStatus { ASSIGNED ACCEPTED PICKING PACKED SHIPPED ARRIVED_AT_STORE READY_FOR_PICKUP COLLECTED EXPIRED REJECTED SHORT CANCELLED }

model LocationRoutingProfile {           // per-location routing policy; Ruling 10: a real row, never a keyed Setting
  id String @id @default(cuid())
  locationId String @unique
  shipFromEnabled Boolean @default(false)
  pickupEnabled   Boolean @default(false)
  walkInReserveUnits Int @default(0)     // units per variant held back from online ATP
  dailyRequestCapacity Int?              // null = uncapped
  acceptWindowMinutes Int @default(30)
  openingHours Json?                     // accept-window clock only runs inside these
}
model RoutingPolicyVersion {
  id String @id @default(cuid())
  version Int @unique
  weights Json                           // cover, splitPenalty, transitDays, laneCost — validated by zod
  maxSplits Int @default(3)
  effectiveFrom DateTime
  proposedByUserId String; activatedByUserId String?
}
model FulfilmentRequest {
  id String @id @default(cuid())
  number String @unique                  // documentNumber(), node-prefixed
  orderId String
  locationId String                      // the fulfilling location — scope column, NOT NULL
  mode FulfilmentMode
  pickupLocationId String?               // null unless PICKUP or SHIP_TO_STORE
  status FulfilmentStatus @default(ASSIGNED)
  acceptBy DateTime?
  rerouteCount Int @default(0)
  policyVersionId String
  decisionInputs Json                    // the snapshot decideRouting() saw — the version stamp
  shipmentId String?                     // fulfilment Shipment, bare scalar
  holdingNodeId String?                  // null = this node holds the location (single database)
  createdAt DateTime @default(now()); updatedAt DateTime @updatedAt
  lines FulfilmentRequestLine[]
  @@index([locationId, status])
  @@index([orderId])
}
model FulfilmentRequestLine {
  id String @id @default(cuid())
  requestId String; orderItemId String; variantId String
  quantity Int; quantityFulfilled Int @default(0)
  commitMovementId String? @unique       // the ADJUSTMENT that committed it here — the second-copy guard
  request FulfilmentRequest @relation(fields: [requestId], references: [id], onDelete: Restrict)
}
model PickupHandover {
  id String @id @default(cuid())
  requestId String @unique
  codeHash String                        // SHA-256(code + requestId); the code itself is never stored
  failedAttempts Int @default(0)
  codeResetByUserId String?; codeResetCount Int @default(0)
  readyAt DateTime; expiresAt DateTime
  collectedAt DateTime?; collectedByUserId String?
  verification String?                   // CODE | ID_CHECK
}
```

Plus `ShippingMethodKind.PICKUP` (`fulfilment.prisma`) and
`Order.pickupLocationId String?` (`orders.prisma`, bare scalar). Null means
"not a pickup order", and that meaning is written in the column comment
(canonical Ruling 11).

## 3. Parameters (exact)

| Parameter                        | Value                                                       | Why this number                                                                                                                                                            | Enforced in                      | On failure                                                    |
| -------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------- |
| Max shipments per order          | **3** (`RoutingPolicyVersion.maxSplits`)                    | Each split is another parcel charge and another customer touchpoint. Three covers "two DCs and a store". Past that, backordering is cheaper than a fourth box.             | `decideRouting()`                | Remaining lines go `SHORT`, to the exception queue            |
| Candidate locations per decision | **50**, nearest by lane transit days                        | 50 locations × 50 lines = 2,500 `VariantLocationStock` rows, all primary-key range scans on `(variantId, locationId)`. A 51st-nearest location almost never beats a split. | `decideRouting()` input builder  | Farther locations are not considered                          |
| Re-routes per request            | **3**                                                       | Bounds the reject → re-route loop. A fourth failure means stock data is wrong, and a person should look.                                                                   | `applyRouting()`                 | `SHORT`, to the exception queue under `orderrouting.override` |
| Store accept window              | **30 min** inside opening hours (`acceptWindowMinutes`)     | Long enough for a store mid-rush to respond, short enough to re-route before a same-day courier cutoff                                                                     | `OrderRoutingCron`, every 1 min  | Auto re-route excluding that location                         |
| Pickup code                      | **6 digits** from a CSPRNG, SHA-256 hashed with `requestId` | Short enough to read over a counter. Paired with the lock below, a guesser's odds are 5 in 1,000,000 per request.                                                          | `PickupHandoverService`          | —                                                             |
| Pickup verification lock         | **5** failed attempts per request                           | Bounds guessing as above                                                                                                                                                   | `PickupHandoverService.verify()` | Code disabled; handover by ID check only, audited             |
| Pickup hold                      | **7 days** (`Setting` `orderrouting.pickup_hold_days`)      | One weekly cycle covers a customer who can only come on a day off. Longer ties up sold stock on a store shelf.                                                             | `OrderRoutingCron`               | `EXPIRED` → staff task                                        |

## 4. Work orders

Each ships backend, minimum screen, nav entry, permission grants and tests.

- **WO-238.1 — Routing core (single database).** Schema,
  `decideRouting()` / `applyRouting()`, the `OrderPlaced` subscriber,
  `/admin/orderrouting/policies` (propose/activate by two users),
  `/admin/orderrouting/locations` (profiles), `/admin/orderrouting/exceptions`.
  Adds `orderrouting -> inventory` to `KNOWN_MODULE_COUPLINGS`. Needs
  WO-236.2 and WO-236.3. Permissions `orderrouting.view`,
  `orderrouting.manage`, `orderrouting.override`.
- **WO-238.2 — Split shipments and the order view.** Requests and lines on
  the order detail page, request-scoped `Shipment` creation through
  `fulfilment`'s existing flow (`ShipmentItem` per request line), and
  `orders`' `FulfilmentRequestStatusChanged` subscriber.
- **WO-238.3 — Ship-from-store.** The store queue (a "Web orders" panel in
  `apps/pos`, since store staff live in the till), accept/reject, the
  accept-window cron, a printable pick list, and re-route on reject or
  short. Permission `orderrouting.fulfil`.
- **WO-238.4 — Click and collect.** `ShippingMethodKind.PICKUP`, the
  storefront pickup-location picker (ATP-filtered),
  `Order.pickupLocationId`, the placement commit at the pickup location,
  ready notification, `PickupHandover`, handover screen, no-show expiry task.
- **WO-238.5 — Ship to store.** `SHIP_TO_STORE` mode, store arrival scan,
  and expiry restock at the pickup location through an explicit
  `restockLocationId` on `orders`' cancel.
- **WO-238.6 — Endless aisle.** The `apps/pos` "order for delivery" action
  through `OrdersService.place()`, plus the ATP-across-locations lookup on
  the till.
- **WO-238.7 — Multi-node routing (R28).** Request as POLICY-down, holding
  node accept and record, derived remote ATP. Gated on Tranche N.

`planning`'s `assignFulfillingBranch()` stays as it is (whole-order,
single-location). Its screen gains a pointer to `orderrouting` when that
module is on. It is not removed.

## 5. Files likely affected

`order-routing.prisma` (+ migration); `apps/api/src/modules/sales/orderrouting/*`;
`orders.prisma` (`pickupLocationId`), `orders.service.ts` (placement commit
location, cancel `restockLocationId`, status subscriber);
`fulfilment.prisma` (`PICKUP`); `domain-events.ts`;
`check-module-boundaries.mjs`; `permissions.ts`;
`apps/web/src/app/admin/orderrouting/*`, the storefront checkout pickup
picker; `apps/pos` (web-orders panel, endless aisle); `nav-registry.ts`.

## 6. Dependencies reused

`InventoryService.move()`, WO-236.2's promisable predicate, WO-236.3's
restock-from-ledger, `fulfilment`'s `Shipment`/`ShipmentItem`/
`CourierProvider`, `notify`, `documentNumber()`, `pos -> orders`,
`supplynetwork` lanes and regions (doc 239), `warehouse` demand (doc 237).

## 7. Risks

- **Routing on stale ATP.** Mitigation: `applyRouting` commits through the
  guarded `move()`. A location that sold the last unit in between refuses
  the commit, and the line re-routes. It is never oversold.
- **Restock correctness for split orders.** WO-236.3 is a hard
  prerequisite, enforced by acceptance criterion 3.
- **Store staff ignoring the queue.** Mitigation: accept-window auto
  re-route, plus a daily digest of auto re-routes per store to
  `orderrouting.manage` holders.

## 8. Acceptance criteria

1. With `orderrouting` off, every existing orders, fulfilment, planning and
   POS spec passes unchanged.
2. `decideRouting()` returns byte-identical plans for identical inputs
   (determinism), and never more than `maxSplits` requests.
3. A three-line order split across two locations, then cancelled, restocks
   each unit at the location it was committed from. A return of one line
   restocks at that line's location.
4. A store that does not accept within the window loses the request to the
   next candidate. After 3 re-routes the line is `SHORT` and on the
   exception screen.
5. A pickup code verifies once. A sixth wrong attempt is refused and the
   handover falls back to an audited ID check. The stored hash never equals
   the code.
6. A no-show after 7 days creates a staff task, and no refund is issued
   without a person.
7. Two concurrent orders routed to the same last unit: exactly one commits
   there, and the other re-routes.
8. `pnpm lint && pnpm typecheck && pnpm test` pass, and the migration
   applies forward on a copy of production data.

## 9. Out of scope

Carrier rate shopping across couriers (a `fulfilment` concern); delivery
time-slot booking; marketplace-channel order import; geocoding-based
distance (lanes and regions stand in, by design).

## Scope lenses

**0. The shop-scale five**

- The transaction, start to finish: checkout (ship or pickup) → `OrderPlaced`
  → `decideRouting` / `applyRouting` → store accept or warehouse demand →
  pick → pack → `Shipment`, or ready → handover → order DELIVERED.
- The other side of the same transaction: the store "Web orders" panel
  (`apps/pos`), `/admin/orderrouting/exceptions`, and the customer's order
  page showing each request's status.
- What happens after "done": cancellation and returns restock per line from
  the ledger (WO-236.3). Pickup no-show opens a staff task. Ship-to-store
  expiry restocks at the pickup location.
- The integrations a real business needs: couriers through `fulfilment`'s
  `CourierProvider`; customer messages through `notify`; no maps vendor
  (lanes stand in, doc 239).
- The policy layer: `RoutingPolicyVersion` and `LocationRoutingProfile`,
  edited under `orderrouting.manage`, policy versions proposed and activated
  by two users.

**1. The actor**

- The actor with three tables: customers stay `User` or guest on `Order`.
  Store staff are `User` with `orderrouting.fulfil`. No new person table.
- The principal with no permission key: the customer at pickup presents a
  code, but performs no API call themselves. Staff call `verify()` under
  `orderrouting.fulfil`, so no new principal exists.
- The grant that ends itself: no per-user grant is created. Requests belong
  to a location, not a person, so deactivating staff strands nothing.

**2. The authority**

- Whose rows, and which columns: every request names `locationId`. Store
  staff see only requests for locations in their scope (WO-236.4). The store
  panel shows no price beyond what the receipt shows and no cost at all.
- The threshold nobody approves alone: no money moves in routing. Releasing
  a store's `walkInReserveUnits` through a manual override needs
  `orderrouting.manage`, not merely `orderrouting.override`. The no-show
  refund goes through `orders`' existing refund permission, never this
  module.
- The toxic pair: resetting a pickup code and completing that handover.
  `PickupHandoverService.complete()` throws when the actor equals
  `codeResetByUserId`.
- Authority and blast radius: `RoutingPolicyVersion` activation (two users,
  evidence-class audit, old/new). The worst value, `splitPenalty = 0`, is
  bounded by `maxSplits`. A dashboard tile shows the split rate by day.
- Audience is a capability: new requests notify `orderrouting.fulfil`
  holders scoped to that location. Zero holders makes the cron re-route
  immediately and log it. Many holders get one panel badge, never a ping
  per request.

**3. The act in the world**

- Request or record: a fulfilment request is a REQUEST, which may be rejected
  and re-routed. Handover and the store arrival scan are RECORDS, never
  refused. A handover after expiry is still recorded, and the expiry task
  closes as "collected late".
- The movement with no address: every commit names the routed `locationId`.
  The placement commit uses `pickupLocationId ?? defaultLocationId()`, and
  the default is reached only for a ship order before routing runs, as
  today.
- Four hours down: if routing is down, orders still place and commit at the
  default, as today, and route when the subscriber recovers (outbox). If a
  store is offline, its requests time out and re-route, and a pickup
  handover offline is captured on paper and entered on the handover screen
  later, keyed by the request number. No double count, because
  `COLLECTED` is predicate-written.

**4. The money**

- The unwritten posting rule: none new. The reassignment moves are
  `ADJUSTMENT` pairs at the same weighted-average cost and net to zero value.
  Revenue and COGS still post at `OrderPlaced`.
- Every column or none: revenue and COGS lines take the selling location
  from WO-236.6, not the fulfilling one. Fulfilment cost by location is read
  from `FulfilmentRequestLine` by the "Fulfilment by location" report, which
  is the report allowed to blend it.
- The period that already moved: n/a, because this module posts nothing.
  The no-show refund posts through `PaymentRefunded`'s existing rule.
- The second legal entity: a request between locations of two different
  `RetailBrand`s is refused in v1. Cross-brand fulfilment is an intercompany
  trade (R17) and needs `transfers`' `INVOICED` settlement. Named, not
  built.
- Dry run before live: `decideRouting()` is pure. Its second caller,
  `POST /admin/orderrouting/preview`, replays last month's orders against a
  draft policy version.
- Click the number: the split-rate tile links to the orders it counts. ATP
  on the storefront equals the sum shown on the per-location ATP screen,
  and the legitimate delta from `ProductVariant.stock` is non-promisable
  locations plus walk-in reserves, both listed.

**5. The scale**

- Three silhouettes: Solo has the module off and nothing changes. A
  forty-branch chain runs on a single database with all locations, or as
  nodes after WO-238.7. A group cannot route across brands in v1 (see "The
  second legal entity"). `FulfilmentRequest.locationId` is NOT NULL.
- The absent collaborator: `supplynetwork` off means candidates by cover
  only. `warehouse` off means stores and DCs accept by hand. `notify` off
  means the ready message is not sent, and the panel shows "customer not
  notified". All degrade on an event; none fails boot.
- The second copy of the write: `FulfilmentRequestLine.commitMovementId
@unique`, status predicates on every transition, and a redelivered
  `OrderPlaced` finding requests already exist for the order (checked under
  a row lock on the order).
- The hundred-thousandth row: about 1.2 requests per order, so 1.2 M rows a
  year at 1 M orders. The store panel uses `(locationId, status)` and issues
  2 statements per page.
- The adoption test: request numbers via `documentNumber()`. Pickup codes
  are random and scoped to one request, never a series.

**6. The afterlife**

- The reversal document: a cancellation or return through `orders` /
  `fulfilment`'s existing documents, restocking per line from the ledger.
  Partial, repeatable until the line is exhausted.
- The undo fan-out:
  - The commit moves reverse automatically on cancel (WO-236.3).
  - A store's acceptance reverses automatically on re-route.
  - A shipped request is deliberately irreversible, and a return handles it.
  - The ready notification is deliberately irreversible.
- The version stamp: `FulfilmentRequest.policyVersionId` and
  `decisionInputs` explain any request's location after the policy changes.
- The erasure the ledger cannot obey: no personal data is held here.
  Customer identity stays on `Order`, and `PickupHandover` holds only staff
  ids, pseudonymised by the existing erasure path.
- The failure path: a request the subscriber cannot route lands as `SHORT`
  on `/admin/orderrouting/exceptions` under `orderrouting.override`, with
  "route manually" and "backorder" actions. Both are safe to repeat because
  they are predicate-written on status.
