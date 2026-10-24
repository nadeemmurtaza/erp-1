# 215 — Guest menu, ordering and requests

> **Industry-specific module.** This belongs to the **hospitality sector pack** (hotels, cafés, restaurants), not to `core`. It is enabled only in hospitality deployments through the `MODULES` allowlist; other sectors never load it, and core never imports it.
>
> **Status: Planned.** Modules: `hospitality-menu`, `hospitality-guest`,
> `hospitality-service` (guest half). One main job per page (Law 5).

## 1. What the guest sees

A single mobile-first screen with four doors, nothing else on first view:

| Door | Job |
|---|---|
| **Menu** | Browse and order |
| **Call staff** | One tap: "someone to my table/room" |
| **Request** | Pick from a short list (water, cutlery, towel, clean room, bill…) |
| **Offers** | What is on today, for this outlet, at this hour |

Header shows the Space ("Table 12" / "Room 304") so the guest knows the code
worked. Language switch and a small "my orders" status chip sit in the header;
the rest of the site's complexity stays one level down (Laws 2, 3, 7).

## 2. Menu management (staff: *Menu*)

| Entity | Key fields |
|---|---|
| `Menu` | `outletId`, `name`, `status` (`DRAFT` `PUBLISHED`), `activeFrom/To` or day-parts (breakfast, lunch, dinner, room-service-night) |
| `MenuSection` | `menuId`, `name` (translatable), `sortOrder` |
| `MenuItem` | `sectionId`, `name`, `description`, `priceMinor`, `catalogProductId?`, `photoAssetId?`, `prepStation` (`KITCHEN` `BAR` `PASS`), `prepMinutes?`, `allergens[]`, `dietary[]`, `status` |
| `ModifierGroup`/`ModifierOption` | required/optional, min/max, `priceDeltaMinor` |
| `MenuItemAvailability` | day/time windows, `soldOut` toggle, optional stock link |
| `MenuVersion` | immutable snapshot taken on publish; carries the version id orders are sold at |

* **Publish is a separate act from edit.** Staff edit a draft; *Publish*
  creates a `MenuVersion` and emits `hospitality.menu_published`, which
  invalidates the guest cache. Guests never see half-edited prices.
* **Link to catalogue, not duplicate.** An item may point to a core product
  or a `bom` recipe so stock and cost flow through existing modules; an item
  with no link is a non-stock item (a service, a coffee made from bulk).
* **Sold-out in one tap** from the staff board; automatic when the linked
  stock reaches zero (event from `inventory`, consumed idempotently).
* **Translations**: names/descriptions stored as locale maps; fallback chain
  guest locale → property default. No label is a code literal (Law 1).
* **Allergen and dietary data are shown, never inferred.** An AI may *suggest*
  tags for staff to accept; the guest only sees what staff confirmed.

## 3. Ordering flow

1. Guest adds items; the basket lives client-side and is mirrored to
   `GuestSession` so a refresh or re-tap keeps it.
2. **Place order** sends `{lines[{menuItemId, qty, modifierIds, note}],
   guestNote}` with an `Idempotency-Key` header.
3. Server validates against the **published** menu version: item exists and is
   available now, modifiers satisfy min/max, quantity limits (doc 214 §5), and
   re-prices. Anything unavailable returns a per-line reason, so the guest
   swaps the line rather than losing the order.
4. `ServiceOrder` is created `PLACED`, stamped with `spaceId`, `outletId`,
   `menuVersionId`, line prices, and a numbered `orderNumber`
   (`PREFIX-YEAR-SEQ`, `nodeId` folded in).
5. `hospitality.order_placed` fires; routing (doc 216) delivers it to the
   right station and the right waiter's board.
6. Guest sees live status: `PLACED → ACCEPTED → PREPARING → READY → SERVED`
   (updated by SSE with polling fallback every 10 s).

### Order lifecycle

| State | Set by | Guest may cancel? |
|---|---|---|
| `PLACED` | guest | yes, free |
| `ACCEPTED` | staff/auto-accept | yes until `PREPARING`, per outlet policy |
| `PREPARING` | station | no — contact staff (becomes a Request) |
| `READY` / `SERVED` | station / waiter | no |
| `CANCELLED` / `VOIDED` | guest or staff | — (adjustment row, doc 213 §6) |

Transitions are conditional writes (`updateMany … where status = X`) so two
staff tapping at once cannot double-advance (House Rule 10).

**Auto-accept** (per outlet, default on for cafés): `PLACED → ACCEPTED`
instantly; off for fine dining where a waiter confirms.

## 4. Requests

`ServiceRequest` (`spaceId`, `kind`, `status`, `note?`, `raisedAt`,
`acknowledgedAt?`, `resolvedAt?`). Kinds come from a per-outlet list
(`ServiceRequestKind` rows, translatable, ordered), seeded with: call staff,
water, cutlery, napkins, clean table, bill, towel, housekeeping, maintenance,
late checkout, wake-up call. Hotels enable room kinds; cafés do not. No kind is
hardcoded.

* One tap raises it; a guest may attach a short note.
* Duplicate suppression: the same kind from the same Space within 2 minutes
  is shown as "already requested — staff have been told" (not a second row).
* Status visible to the guest; "resolved" can be reopened once within 10 min
  ("not done yet"), which re-escalates.

## 5. Offers

`Offer` is a read-only presentation of rules the existing `promotions` module
owns (discount/price-list/happy-hour). Offers shown: valid now, for this
outlet, not already consumed by the session. If `promotions` is absent, the
Offers door simply shows only manually written *announcements*
(`MenuAnnouncement` text + image). Applying a discount at order time goes
through the same pricing extension point as core checkout, never a bespoke
calculation here.

## 6. Paying (until doc 219 §1 ships)

Every order carries `settlement`: `PAY_AT_TABLE`, `CHARGE_TO_ROOM`, or
`PAY_AT_COUNTER`. A table's open orders aggregate to one **bill** the waiter
closes; a room's go to the room folio (doc 217 §5). Online payment is a
future module and attaches without changing the order shape.

## 7. States the page ships (design rule: every state)

Empty menu · loading skeleton · item sold out (shown, disabled, reason) ·
outlet closed (menu read-only with hours) · session expired (re-scan prompt) ·
offline (basket kept, "will send when you're back"; order is *not* queued
silently — the guest confirms on reconnect) · rate-limited · network error with
retry · order placed · request raised. Seven widths 280→1536 with no dead
space; targets ≥ 44 px; logical properties for RTL (Urdu/Arabic).

## 8. Acceptance criteria

1. A guest on a 280 px phone can place an order, call staff and raise a
   request without horizontal scroll.
2. Tampering with a price in the request changes nothing; the stored price is
   the published one.
3. A double-tap on *Place order* produces exactly one `ServiceOrder`.
4. Publishing a new menu is visible to guests within 60 s, and orders
   already placed keep their old prices.
5. The same item sold out at the station disappears from ordering across all
   guests within 5 s (SSE) / 60 s (cache floor).

## 9. Permissions

`hospitality.menu.manage` (edit/publish), `hospitality.menu.availability`
(sold-out toggle — granted to floor and kitchen leads, narrower than full
menu edit).

## 10. Work orders

215.1 menu schema + admin · 215.2 publish/versions/cache · 215.3 guest menu
page · 215.4 order create + validation + idempotency · 215.5 requests +
kinds · 215.6 offers/announcements · 215.7 status SSE.
