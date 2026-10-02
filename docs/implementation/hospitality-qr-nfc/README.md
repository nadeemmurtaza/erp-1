# Hospitality QR + NFC platform — document set

One platform for hotels, cafés and restaurants. A guest scans a **QR code** or
taps an **NFC tag** fixed to a table or a hotel room; the menu opens in the
browser with **no app to install**. From that one page the guest can order
food, call staff, raise a service request and see offers. Because every tag is
bound to one specific table or room, staff know **automatically** where an
order came from.

> Order, menu, tables, rooms, staff, management, analytics — everything in one
> platform. Payments, WhatsApp, loyalty, POS, KDS, subscriptions and
> multi-branch are added later **behind extension points**, never by editing
> what already exists.

This is a **sector pack** (`MULTI-SECTOR.md`): a new folder of modules plus a
`MODULES` allowlist entry. It never edits a core module, and the repository
boots without it.

## Read in this order

| File | What it is |
|---|---|
| [`213-hospitality-platform-overview.md`](./213-hospitality-platform-overview.md) | Vision, actors, the one-page product, architecture mapping, the pack and its modules, pillars, build order |
| [`214-qr-nfc-tags-and-spaces.md`](./214-qr-nfc-tags-and-spaces.md) | `Space` (table / room) and `SpaceTag` (QR / NFC), the URL scheme, token security, tag lifecycle, printing and encoding |
| [`215-guest-menu-and-ordering.md`](./215-guest-menu-and-ordering.md) | The no-install guest experience: menu, order, call staff, service requests, offers, session and order lifecycle |
| [`216-staff-operations-and-requests.md`](./216-staff-operations-and-requests.md) | The live staff board: where the order came from, routing, acknowledgement, escalation, kitchen tickets |
| [`217-tables-rooms-and-floor.md`](./217-tables-rooms-and-floor.md) | Floors, zones, tables, rooms, occupancy, merge/split, room folio posting |
| [`218-staff-management-and-analytics.md`](./218-staff-management-and-analytics.md) | Staff, shifts, assignment by zone, performance; management dashboards and the numbers they show |
| [`219-future-modules-roadmap.md`](./219-future-modules-roadmap.md) | Payments, WhatsApp, loyalty, POS, KDS, subscriptions, multi-branch — each as an extension point with its trigger |

## Vocabulary (one word per concept)

| Word | Means | Never called |
|---|---|---|
| **Space** | A place a guest can be: a table or a room | location, spot, seat (`Location` is the inventory/branch row) |
| **Tag** | The physical QR or NFC code bound to one Space | sticker, link |
| **Guest session** | One guest's anonymous visit, opened by a scan | login, account |
| **Order** | Food or drink asked for from a Space | ticket (a *kitchen ticket* is a print of an order) |
| **Request** | A non-food ask: call staff, water, towel, bill | order |
| **Outlet** | One restaurant, café or bar inside a property | branch (a *branch* is a node, `RETAIL-ERP.md`) |
| **Property** | A hotel or venue that owns outlets, floors and rooms | tenant |

## Status

**Planned.** Nothing in this folder is built yet. Each document ends with its
work orders; `213` holds the order they build in.
