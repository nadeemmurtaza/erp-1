# Phase 8 — Content, marketing and search

**Read `00-HOUSE-RULES.md` first.** Depends on Phase 3.

## Why

The storefront has no editable content. Every page is hard-coded, there is no
blog, no landing pages, no banners a merchandiser can change, and no campaign
tooling. Search is a Postgres `contains` query — `catalog` filters with
`{ contains: term, mode: 'insensitive' }`, which cannot rank, cannot handle a
typo, and cannot facet.

## Work orders

| WO | Title |
|---|---|
| 8.1 | CMS: pages, blog, banners, menus |
| 8.2 | Collections and merchandising |
| 8.3 | Search: facets, synonyms, ranking |
| 8.4 | Campaigns and broadcasts |
| 8.5 | Abandoned cart recovery |
| 8.6 | On-site messaging |

---

## WO-8.1 — CMS

New module `content`. Models: `Page` (slug, template, status, publish date,
per-locale title/body/SEO — translations, House Rule 6), `BlogPost` (same plus
author, category, tags, hero image), `Banner` (placement key, image, link,
schedule, per-locale copy), `MenuItem` (a tree for header and footer navigation).

Block-based body rather than a single rich-text blob: an ordered array of typed
blocks (rich text, image, product grid, banner, FAQ, video). It is more work up
front and it is what makes a landing page composable instead of a wall of HTML.

Every page and post carries the same SEO fields and JSON-LD treatment as
products (Phase 3): meta per locale, OG, canonical, `hreflang`, `Article` schema
for posts, and inclusion in `sitemap.ts`.

**Sanitise rendered HTML.** A CMS is a stored-XSS vector by construction. Allow a
known-good tag and attribute list; never render raw user HTML.

---

## WO-8.2 — Collections and merchandising

`Collection` — a curated or rule-based group of products, separate from the
`Category` tree. Rules like "kind = UNSTITCHED and season = summer and price <
5000", evaluated on read or materialised nightly for large catalogues.

Manual sort order per collection with drag-and-drop, plus automatic strategies
(best-selling, newest, price, margin). "Sort by margin" is a genuinely useful one
now that Phase 1 gives you cost — most platforms cannot do it.

Collections are the apparel pack's *lookbook* and *seasonal drop* surface, and
the `complete-the-look` target from Phase 3's Related section.

---

## WO-8.3 — Search

Start with **Postgres full-text search** — `tsvector`, a GIN index, `ts_rank`,
`pg_trgm` for fuzzy matching. Do not reach for Elasticsearch or Typesense for a
catalogue this size; it is a service to run, back up and pay for, and Postgres
will comfortably serve tens of thousands of products.

- Index product name, description, tags, brand, fabric, category and option
  values, **per locale** — Urdu needs its own configuration and will not work
  under the English stemmer.
- Facets from real data: category, price bands, size, colour, fabric, brand,
  availability. Counts must reflect the other active filters.
- A synonym table staff can edit ("kameez" ↔ "shirt", "ferozi" ↔ "turquoise") —
  business rules are data (House Rule 4).
- Log every query with its result count. **Zero-result queries are the single
  most useful merchandising report there is**; they tell you what customers want
  and you do not stock.
- Ranking: text relevance, then availability, then `featuredRank`. Boost in-stock
  above out-of-stock always.

Vector/semantic search is Phase 9 and builds on this, not instead of it.

---

## WO-8.4 — Campaigns and broadcasts

New module `marketing`. `Campaign` (channel, audience segment, template,
schedule, status) and `CampaignRecipient` (per-recipient send/open/click state).

Channels through the existing `NotificationChannel` core interface (House Rule 8)
— email, SMS, **WhatsApp**. In Pakistan WhatsApp is the channel; treat email as
the secondary one, which is the opposite of the usual default.

Audiences from the existing CRM `Segment` model. RFM segments (recency,
frequency, monetary) computed nightly give you "lapsing good customers" without
any AI, and that is usually the highest-earning list.

Non-negotiable: **honour the opt-out from Phase 7, WO-7.8, on every send.** Check
it at send time, not at list-build time — a customer who opts out between the two
must not receive the message. Rate-limit sends and throttle per provider limits.

---

## WO-8.5 — Abandoned cart recovery

`Cart` already exists with timestamps, and `analytics.service.ts:508` already
computes a `cartAbandonment` figure — so the data is there and only the action is
missing.

A cart idle for N hours with an identifiable customer (account, or a phone
captured at checkout) triggers a sequence: 1 hour, 24 hours, 72 hours, each
stopping immediately if the cart converts. Optionally attach a recovery discount
on the last step only — sending one immediately trains customers to abandon.

Track recovered revenue explicitly. It is the one marketing number that is
unambiguous.

---

## WO-8.6 — On-site messaging

Announcement bars, exit-intent and timed popups, newsletter capture, cookie
consent. All scheduled, all targetable by page and by segment, all dismissible
with the dismissal remembered.

Keep it restrained. Three popups on one page loses more revenue than any of them
earns.

## Phase 8 exit criteria

1. A merchandiser can publish a landing page and change a homepage banner with no
   deploy.
2. Search returns sensible results for a misspelled Urdu and English query, and
   facet counts respect active filters.
3. Zero-result queries are reported.
4. A campaign send skips every opted-out recipient, verified at send time.
5. Abandoned-cart recovery reports recovered revenue.
