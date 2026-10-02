# 213 — Hospitality QR + NFC platform: overview

> **Status: Planned.** Requirement: a QR/NFC ordering and service platform for
> hotels, cafés and restaurants, no app install, every tag bound to a table or
> room, with management, analytics and a roadmap to payments, WhatsApp,
> loyalty, POS, KDS, subscriptions and multi-branch.

## 1. Objective

Put a code on a table or a room door. Scanning or tapping it opens that
place's menu in the guest's phone browser. The guest orders, calls staff or
asks for a service; staff see the order **with its table or room already
attached**. Managers run the property from the same system.

**Test of success (Law 3):** a guest sees four things — *Menu, Call staff,
Request, Offers*. A waiter sees one thing — *what is waiting, and where*. A
manager sees one thing — *how the day is going*. Everything else is one level
down (Law 2).

## 2. Actors

| Actor | Authenticated as | Table it becomes | Checked against |
|---|---|---|---|
| **Guest** | an anonymous, signed **guest-session token**, never a `User` | `GuestSession` (new) with optional `Contact` link once they give a name or phone | no permission key; the token authorises *only* its own Space, its own orders, its own requests |
| **Waiter / runner** | `User` | `User` + `Employee` (doc 20) | `hospitality.orders.serve`, `hospitality.requests.handle` |
| **Kitchen / bar** | `User` | `User` | `hospitality.orders.prepare` |
| **Receptionist / housekeeping** | `User` | `User` | `hospitality.requests.handle`, `hospitality.rooms.manage` |
| **Outlet manager** | `User` | `User` | `hospitality.menu.manage`, `hospitality.spaces.manage`, `hospitality.analytics.view` |
| **Owner / property admin** | `User` | `User` | all of the above + `hospitality.tags.manage`, `hospitality.settings.manage` |

The guest is deliberately **not** a `User`. A guest has no password, no role,
no PBAC row. Their authority is "I am at table 12 right now", proven by a
short-lived token minted by a scan (doc 214). That is why the guest API is a
separate controller set with its own guard, never a loosened staff route.

## 3. Mapping to this repository's architecture

| Concern | Decision | Why |
|---|---|---|
| **Sector axis** | A new **pack** `hospitality` under `apps/api/src/modules/`, enabled by `MODULES`. Core never imports it. | `CLAUDE.md` "three axes": a sector is a pack, never a branch or `if (sector === …)` |
| **Brand axis** | Property name, logo, colours, currency, locale, support contact all via `@newax/shared` `brand.ts`. Guest pages render the brand, not literals. | Law 1 |
| **Branch axis** | An **Outlet** is a row. Every order, request and movement names its `outletId` and, for stock, its `locationId`. A multi-property chain is a node (doc 219 §7). | "Every movement of value names its location" |
| **Inventory** | Selling an item reduces stock only through `InventoryService.move()`, reached by a domain event or an extension point — never a direct write. Recipes use the existing `bom` module (read-only). | "One writer per invariant" |
| **Orders & money** | A guest order is **not** a second order system. On confirmation it becomes a core `Order` through an extension point (`HospitalityOrderSink`) so tax, discounts, payments and accounting already work. | One order, one ledger; avoids a parallel books-of-record |
| **Module independence** | `hospitality` modules talk to each other and to core by **domain events** and extension points. Any same-transaction write needs a named `KNOWN_MODULE_COUPLINGS` entry, justified in an ADR. | `pnpm lint` fails otherwise |
| **Absent collaborator** | Without `payments`: orders are *pay at table / charge to room*. Without `loyalty`: no points line. Without `notify`: staff board still works (polling/SSE), no push. Without AI: no suggestions. None fails boot. | "Every pack survivably absent" |
| **Cache** | Guest menu is read-heavy: cached per `(outletId, menuVersion, locale)`, invalidated by `menu.published` event. TTL 60 s as a floor so a missed invalidation self-heals. | Performance table |
| **Security** | Server-side PBAC for staff; token-scoped guest API; rate limits (doc 214 §6). | Secure by design |

## 4. The pack: modules and what each owns

Every module is independent of every other; they cross through events.

| Module | Owns | Doc |
|---|---|---|
| `hospitality-spaces` | `Property`, `Outlet`, `Floor`, `Zone`, `Space`, `SpaceTag`, occupancy | 214, 217 |
| `hospitality-menu` | `Menu`, `MenuSection`, `MenuItem`, modifier groups, availability schedules, publishing/versions | 215 |
| `hospitality-guest` | `GuestSession`, guest-facing API, offers display, rate limiting | 214, 215 |
| `hospitality-service` | `ServiceOrder`, `ServiceOrderLine`, `ServiceRequest`, routing rules, SLAs, escalation, staff board | 215, 216 |
| `hospitality-staff` | zone assignment, on-shift roster view, performance read models (reads HR; owns no HR facts) | 218 |
| `hospitality-insights` | read models and dashboards over events (never over other modules' tables) | 218 |

New events (past tense, published through `EventBusService` outbox):
`hospitality.tag_scanned`, `.session_opened`, `.order_placed`, `.order_accepted`,
`.order_ready`, `.order_served`, `.order_cancelled`, `.request_raised`,
`.request_acknowledged`, `.request_resolved`, `.request_escalated`,
`.menu_published`, `.space_status_changed`.

## 5. The five pillars for this feature

| Pillar | How |
|---|---|
| Proper architecture | Pack + events + extension points; no core edit |
| Scalable | A busy 300-table venue at peak: tens of scans/second. Guest menu from cache; writes are small and indexed by `(outletId, status, createdAt)`; staff board is paged and filtered by zone, never "all orders" |
| Secure | Token-scoped guest API, tags are unguessable and revocable, PBAC staff routes, no price or availability trusted from the client |
| Stable | Idempotency key on every guest write (a double-tap or retried request is a no-op); outbox events; guest order survives a staff-side outage as `PLACED` and is shown when staff reconnect |
| Observable | `Logger` per service, `AuditService` on every staff state change and tag lifecycle change, events as trace |

## 6. Scope lenses (feature-scope map)

**The actor with three tables** — guest → `GuestSession` (+ optional `Contact`); staff → `User`+`Employee`; no `Party`/`TradingPartner` here.
**The principal with no permission key** — guest authenticates by signed session token via `GuestSessionGuard`; reads only rows whose `spaceId` equals the token's.
**The grant that ends itself** — guest token expires (doc 214 §5) and dies on table close; staff zone assignments end with the shift and with `hr.posting_ended`.
**Whose rows, and which columns** — staff see their outlet(s)/zones; cost price and margin columns hidden from non-`analytics.view`; guest never sees other guests' orders.
**The threshold nobody approves alone** — comps/voids above a per-outlet limit need a second holder of `hospitality.orders.void`; undo is a different authority than the void.
**The toxic pair** — `hospitality.orders.void` + `hospitality.settings.manage` refused together in `RolesService`.
**Authority and blast radius** — price/availability edits audited with old and new value; publishing is a separate act from editing (draft → publish).
**Audience is a capability** — requests route to holders of `hospitality.requests.handle` scoped to the Space's zone; zero holders → escalate to outlet manager; many → a digest after the first, never N pings.
**Request or record** — a guest *order* is a request (may be refused: item sold out); a *served* mark is a record (never refused; variance recorded).
**The movement with no address** — every order names `outletId`; stock decrement names the outlet's `locationId`; `defaultLocationId()` is reached on no path.
**Four hours down** — staff fall back to printed kitchen tickets (doc 216 §8) and paper; a reconciliation screen ingests them without double count (idempotency key = ticket number).
**The unwritten posting rule** — confirmed order → core `Order` → existing `orders.*` posting; room charge → Dr Guest Ledger / Cr Revenue via the `finance` extension, keyed `findPostedEntry('hospitality.room_charge', orderId)`.
**Every column or none** — journal lines carry `branchNodeId`/outlet dimension as existing orders do; no new dimension invented.
**The period that already moved** — a late order in a closed period posts to the next open period with a variance row; named in doc 216.
**The second legal entity** — property carries its own tax label, currency, number series via `brand.ts`/`Setting`; order number folds `nodeId` like `documentNumber()`.
**Dry run before live** — routing rules are a pure function `route(request, rules, roster) → assignee`, replayable over last week's requests with nothing written.
**Click the number** — every dashboard tile links to its exact orders/requests pre-filtered; the authoritative revenue is the core `Order`/ledger, insights reconciles to it and lists legitimate deltas (voids, comps, open tabs).
**Three silhouettes** — one café (1 outlet, 10 tables), a 40-outlet chain, a hotel group; `propertyId` and `outletId` exist from migration 1 and never render on the Solo screen.
**The absent collaborator** — §3 table.
**The second copy of the write** — `Idempotency-Key` header + unique `(guestSessionId, idempotencyKey)`.
**The hundred-thousandth row** — orders and requests reach tens of millions at Organization edition; list pages are cursor-paged, indexed by `(outletId, status, createdAt)`; insights read pre-aggregated daily rows.
**The adoption test** — order/request numbers are `PREFIX-YEAR-SEQ` with `nodeId` folded in; tag *public codes* are random 128-bit values, collision-safe offline.
**The reversal document** — a cancellation/void is a `ServiceOrderAdjustment` pointing at specific lines, partial and repeatable until exhausted; refunds flow through `payments`.
**The undo fan-out** — stock reverses automatically; kitchen ticket void needs the kitchen (screen, `orders.prepare`); an already-served dish is deliberately irreversible (a comp, not an undo).
**The version stamp** — each order stores `menuVersionId` and the prices it was sold at; later price edits never rewrite history.
**The erasure the ledger cannot obey** — guest name/phone in `GuestSession`, `ServiceOrder.guestNote`, `OutboxEvent.payload`, `AuditLog.data`: pseudonymise after the retention window (default 90 days, `Setting`), keep totals.
**The failure path** — failed notifications and failed order-sink calls land in a dead-letter list on the staff admin screen, permission `hospitality.settings.manage`, replay is safe because every consumer is idempotent.

## 7. Build order (work orders)

| WO | Delivers | Needs |
|---|---|---|
| 213.1 | Schema + migration for spaces/tags (214, 217) | — |
| 213.2 | Tag admin: create, print sheet, revoke (214) | 213.1 |
| 213.3 | Guest entry: scan → session → brand menu shell (214, 215) | 213.1 |
| 213.4 | Menu management + publish + cache (215) | 213.1 |
| 213.5 | Guest ordering + requests + idempotency (215) | 213.3, 213.4 |
| 213.6 | Staff board + routing + acknowledgement + kitchen ticket (216) | 213.5 |
| 213.7 | Floor/room management + occupancy (217) | 213.1 |
| 213.8 | Staff zones + insights (218) | 213.6 |
| 213.9+ | Roadmap items (219), one WO each | 213.8 |

Each WO ships whole: schema, service, controller, tests, the minimum UI, a
nav-registry entry, and the permission seeded to a real role.

## 8. Out of scope here

Payments, WhatsApp, loyalty, POS terminal, KDS hardware, subscriptions,
multi-property (all doc 219); a native guest app (the whole point is none);
accounting beyond posting through existing extension points.

## 9. Decision to record

ADR (Proposed, appended to `DECISIONS.md` as ADR-084): *guest as a token-scoped
principal, not a `User`; one order system via `HospitalityOrderSink`.*
