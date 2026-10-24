# Launchpad apps — document set

An Odoo-style **launchpad**: one front door where the modules we already have
(and new ones) are grouped into **mini apps** a person can open with one
click. Some apps are **core** (every deployment), some are **industry-specific**
(a sector pack), and every app is tagged by **audience** — B2B, B2C, C2C — so
the launchpad can be filtered and licensed by what a business actually does.

> **Status: Planned.** Nothing here is built. Design only.

## Read in this order

| File | What it is |
|---|---|
| [`232-launchpad-and-app-manifest.md`](./232-launchpad-and-app-manifest.md) | The launchpad, the first-party **app manifest**, tier/sector/audience tags, how a tile is shown or hidden, licensing hook, relation to third-party apps (docs 184–195) |
| [`233-mail-app.md`](./233-mail-app.md) | Company email inside the ERP: control plane over a mail engine, shared mailboxes with no shared passwords, real-sender attribution, departure handling, proof-of-concept gates |
| [`234-auction-app.md`](./234-auction-app.md) | Auctions for B2B, B2C and (later) C2C: English, sealed-bid and reverse auctions, proxy bidding, anti-sniping, bidder trust, settlement into a core order |
| [`235-vault-and-work-credit-app.md`](./235-vault-and-work-credit-app.md) | Packages doc 231 (sealed vault, review grants, evidence-based credit) as a launchpad app |

## Three words that must not blur

| Word | Means | Defined in |
|---|---|---|
| **Module** | A unit of code in the API (`apps/api/src/modules/<name>`), enabled by the `MODULES` allowlist, independent of every other module | `MULTI-SECTOR.md` |
| **Launchpad app** | A *presentation grouping* of modules for people: name, icon, nav entries, permissions, tags. First-party, **in-process**, declared in code | doc 232 |
| **Directory app** | A **third-party remote service** a tenant installs from a catalogue; never runs inside our process | docs 184–195 (ADR-073) |

The launchpad is the front door for **both** launchpad apps and, once built,
installed directory apps (shown as a tile with an "External" badge, doc 232 §7).
They share a screen, not an architecture: doc 184's rule — *third-party code
never runs inside NEWAX* — is unchanged and applies only to directory apps.

## Starting catalogue

Tier = **C**ore or **I**ndustry. Audience tags: **B2B**, **B2C**, **C2C**,
**INT** (internal/staff only). An app may carry several.

| App | Tier | Audience | Groups (modules) | Doc |
|---|---|---|---|---|
| Sales & Catalogue | C | B2B B2C | catalog, cart, orders, pricing, promotions, giftcards | existing |
| Inventory & Purchasing | C | B2B INT | inventory, purchasing, lots, transfers | existing |
| Accounting & Finance | C | INT | accounting, finance, receivables, tax, bankfacilities | existing |
| People | C | INT | hr, payroll, attendance, orgstructure | existing |
| Support & Tasks | C | B2B B2C INT | support, tasks, notify | existing |
| CRM & Marketing | C | B2B B2C | crm, marketing, loyalty, reviews | existing |
| POS | C | B2C | pos | existing |
| Reports & Analytics | C | INT | reports, analytics | existing |
| **Mail** | C | INT B2B | mail (new) | 233 |
| **Auction** | C | B2B B2C C2C* | auction (new) | 234 |
| **Vault & Work Credit** | C | INT B2B | vault, work-credit (new) | 235 |
| Hospitality (QR/NFC) | I | B2C B2B | docs 213–219 | `hospitality-qr-nfc/` |
| Housing Society | I | B2C INT | docs 220–230 | `housing-society/` |
| Apparel / Stitching | I | B2C B2B | measurements, stitching | existing |

\* C2C is **reserved, not delivered in the first release** — see doc 234 §2 and
doc 232 §4 for why.

## Recommended build order (agreed)

1. **Launchpad shell + manifest**, grouping the apps that already exist (232).
   Useful on its own, before any new app.
2. **Mail** as the first non-ERP app; it tests whether the model holds (233).
3. **Vault & Work Credit** (231 → 235): the most distinctive capability.
4. **Auction** (234): B2C/B2B first; C2C after escrow and trust exist.
5. Chat and Drive later (meetings doc 205 and `StorageService` exist to build on).

## Open questions for the owner (collected)

1. Mail: is shared-mailbox delegation with per-user sign-in confirmed on the chosen engine? (233 §9 — proof of concept first.)
2. Auction: which jurisdictions first? Auction rules vary by country and by item type; legal review is outside this design (234 §14).
3. Auction: is a **deposit hold** on a bidder's payment method available through `payments`, or must v1 run on account standing alone? (234 §6.)
4. Launchpad: should licensing (doc 211) gate an app per tenant from day one? (232 §8.)

## Decisions taken

* **Vault protection mode (owner, "keep both for now"):** both `CLIENT_SIDE`
  and `SERVER_HELD` ship, chosen per vault, no global default yet (doc 231 §3.3,
  doc 235 §5).
