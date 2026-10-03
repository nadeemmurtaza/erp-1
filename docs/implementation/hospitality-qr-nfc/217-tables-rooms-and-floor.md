# 217 — Tables, rooms and the floor

> **Industry-specific module.** This belongs to the **hospitality sector pack** (hotels, cafés, restaurants), not to `core`. It is enabled only in hospitality deployments through the `MODULES` allowlist; other sectors never load it, and core never imports it.
>
> **Status: Planned.** Module: `hospitality-spaces`. One job: **know what
> state every Space is in.**

## 1. Space status

| Status | Meaning | Set by |
|---|---|---|
| `AVAILABLE` | Free | cleaning done / checkout done |
| `OCCUPIED` | A guest session or reservation-seated party is active | first order/scan with presence, or waiter |
| `RESERVED` | Held for a time | reservation (219 roadmap; manual hold now) |
| `NEEDS_CLEANING` | Guests left | bill closed / room checked out |
| `OUT_OF_SERVICE` | Broken, blocked | manager |

Every change writes `space_status_changed` (who, from, to) and an audit row.
Transitions are conditional writes; the floor map is a read model of them.

## 2. Floor view (staff: *Floor*)

A grid or plan of the outlet's Spaces coloured by status, grouped by Zone,
with the waiting-time badge from doc 216. Tap a Space → its open orders,
requests and bill. It shows an overview of the whole outlet; detail only on
tap (Laws 1–7). At 280 px it is a list, not a shrunken map.

## 3. Tables

* **Capacity** informs seating, never blocks ordering.
* **Merge**: a party of 10 joins T4+T5 → a `SpaceGroup` whose orders and bill
  are one; each tag still resolves, and both QR codes show the same group
  basket. **Split** reverses it. Merge/split never rewrites past orders.
* **Move party**: re-point open orders to another Space (audited).
* **Shared table** (counter/bar): several sessions, separate bills per session.

## 4. Rooms (hotels)

A room is a `Space(kind=ROOM)` with extra, optional facts held in
`RoomProfile` (`spaceId`, `roomType`, `floor`, `housekeepingStatus`).
`RoomStay` (`spaceId`, `guestName?`, `checkIn`, `checkOut`, `externalRef?`) is
the occupancy fact.

* **Source of stays**: a manual check-in/out screen works with nothing else.
  A property that runs a PMS connects it through a `RoomStayProvider`
  extension point (a later, per-deployment concern, like a courier driver).
  Without one the platform still works.
* A room's tag is a **permanent fixture** in the room; the *session* is what
  expires, at check-out. A new guest never inherits a previous guest's basket
  or orders.
* **Housekeeping states**: `DIRTY → CLEANING → INSPECTED → CLEAN`; requests
  like "clean room" create a housekeeping task on the same `ServiceRequest`
  rail, routed to the housekeeping zone.
* **Do-not-disturb** per stay suppresses non-urgent staff notifications to
  that room and shows on the card.

## 5. Room folio (charge to room)

`CHARGE_TO_ROOM` orders post to the stay's folio, never to a loose total:

* `RoomFolioLine` (`stayId`, `serviceOrderId`, `amountMinor`, `taxMinor`,
  `postedAt`) — unique `(serviceOrderId)` so a retry is a no-op.
* Posting rule: Dr **Guest ledger (room receivable)** / Cr **Revenue (F&B)** +
  tax, keyed `findPostedEntry('hospitality.room_charge', serviceOrderId)`. If
  the thirteen-account chart lacks "Guest ledger", the work order adds it; it
  is named here, not assumed.
* At check-out the folio is settled through `payments` or handed to the PMS;
  a late charge after checkout lands as a flagged variance, never rejected
  (R5: a sale that happened is never refused).
* A voided room charge is an adjustment row pointing to the original line,
  partial and repeatable.

## 6. Permissions

`hospitality.spaces.manage`, `hospitality.rooms.manage` (stays, housekeeping
states), `hospitality.folio.post` (separate from `orders.serve`, so a waiter
cannot alter a folio).

## 7. Acceptance criteria

1. Check-out ends the room's guest sessions within 5 s; the next guest's scan starts a fresh one.
2. Merged tables show one basket and one bill; splitting restores both.
3. Posting the same room charge twice yields one folio line.
4. With no PMS configured, a hotel runs entirely from the manual check-in screen.
5. A closed bill flips the Space to `NEEDS_CLEANING` and a cleaner can mark it `AVAILABLE` from the board.

## 8. Work orders

217.1 status machine + floor view · 217.2 merge/split/move · 217.3 rooms
profile + stays + housekeeping · 217.4 folio posting + checkout · 217.5 PMS
`RoomStayProvider` interface (no driver).
