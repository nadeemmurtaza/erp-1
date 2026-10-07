# ADR-035 — Phase 8 (content, marketing and search) audited and confirmed built; the ranking rule's missing availability tier fixed; the phantom "Phase 8 status note" several files already cited now exists

[← Decision log](../DECISIONS.md)


### Context

The owner asked directly for `docs/implementation/content-marketing-search/
08-content-marketing-search.md` to be built. Investigation
(`ls apps/api/src/modules` — `content`, `collections`, `search`, `marketing`,
`onsitemessages` all already present; a schema/service/spec/frontend audit
of each) found the phase already substantially built: every model doc 08
names, `SearchService`'s Postgres FTS (`tsvector`/GIN/`pg_trgm`, per-locale
config, synonym expansion, zero-result log) plus WO-9.5's hybrid
keyword+vector ranking layered on top, `CollectionsService`'s full sort
strategy set, `CampaignsService`'s send-time opt-out check and rate-limited
dispatch, `MarketingAutomationCron`'s three-stage abandoned-cart sequence
with a recovered-revenue report, and `OnsiteMessagesService`/the
storefront's `OnsiteMessages` component's full trigger and dismissal
handling. Fifteen source comments across five files already cited "the
Phase 8 status note" as the place naming small, deliberate deferrals — no
such document existed anywhere in `docs/`, the same stale-reference defect
ADR's own doc-75 correction (this session, earlier) found in a different
document. `doc 08`'s own five exit criteria were checked against the
running code, one by one, and four were already satisfied; the fifth
(search ranking) had a real, narrow gap.

### Decision

1. **Confirmed built, no changes**: WO-8.1 (CMS), WO-8.2 (collections),
   WO-8.4 (campaigns/broadcasts), WO-8.5 (abandoned-cart recovery), WO-8.6
   (on-site messaging). Each work order's own doc-08 requirements were
   checked against the actual service/schema/frontend code, not assumed
   from a comment; all matched.
2. **Fixed**: WO-8.3's own ranking rule — "text relevance, then
   availability, then `featuredRank`. Boost in-stock above out-of-stock
   always" — was not implemented. `SearchService.search()`'s sort was
   rank-only (when a term matched) or `featuredRank`-only (browse), with
   no availability tier in either path, and no spec covered it.
   `productInclude` now selects `variants: { stock, isActive }` (a cheap
   projection, `toHit()` never reads it), and the sort is a single
   comparator: rank (when present) → `isInStock()` (identical definition
   to `buildWhere()`'s own existing `inStock` filter) → `featuredRank`,
   each a tie-breaker for the one before it, never one replacing another.
   A new spec (`search.service.spec.ts`) creates two identically-worded
   products, one with stock and one without, and asserts the in-stock one
   ranks first — a real regression guard, not a smoke test.
3. **Written**: this ADR and a status blockquote on `08-content-marketing-
   search.md` itself, together forming the "Phase 8 status note" the
   existing fifteen comments already expected to exist. No comment text
   was rewritten — they now correctly resolve to something real.

### The named, deliberate deferrals this ADR makes citable

None of these violate an exit criterion (checked explicitly, below); each
was already reasoned out in its own code comment before this session and
is restated here only so the citation resolves to something real:

- **Size/colour facets** (`search.service.ts`) — needs a
  `ProductVariant`/`ProductOptionValue` join beyond today's product-level
  faceting; category/brand/fabric/season/in-stock facets are built and
  correctly exclude their own filter dimension.
- **Nightly collection-rule materialisation** (`catalog.prisma`) — today's
  read-time rule evaluation (`CollectionsService.resolveRuleProducts`) is
  the correct choice at this catalogue's size; named as the follow-on for
  when it isn't.
- **Campaign link click-tracking auto-rewrite** (`campaigns.service.ts`) —
  open tracking (a 1×1 pixel) is automatic on every EMAIL send; click
  tracking exists (`recordClick()`) but rewriting arbitrary HTML links
  inside a campaign's own content safely is a distinct, larger problem than
  a regex, not attempted here.
- **Facet-count badges in the storefront's `FilterPanel`** (`apps/web/src/
  lib/api.ts`) — the ranking and facet computation this ADR's fix depends
  on are server-side and complete; wiring the counts into the filter UI's
  own badges is a frontend-only follow-on.

### Exit criteria, checked against the running code

1. A merchandiser can publish a landing page and change a homepage banner
   with no deploy — `ContentService`/`/admin/content` (522-line admin page).
2. Search returns sensible results for a misspelled Urdu and English query,
   and facet counts respect active filters — trigram fallback
   (`fuzzyMatch`), per-locale `tsvector` config (`english`/`simple`),
   `computeFacets()`'s own `excludeDimension` parameter.
3. Zero-result queries are reported — `SearchService.zeroResultReport()`.
4. A campaign send skips every opted-out recipient, verified at send
   time — `CampaignsService.sendOne()` checks `Contact.marketingOptOut`/
   `PhoneOptOut` inside the send loop, never at `materializeScheduledCampaigns()`.
5. Abandoned-cart recovery reports recovered revenue —
   `MarketingAutomationCron.recoveredRevenueReport()`, broken down by
   which stage recovered the order.

### Consequences

- Doc 08 is `Accepted`/complete per its own exit criteria, with one real
  defect fixed and covered by a spec that would have caught it, and every
  comment across the codebase that names "the Phase 8 status note" now
  resolves to a real document instead of a promise nothing fulfilled.
- The four named deferrals are real, scoped, and now doubly citable (their
  own code comment, and this ADR) — the next work order that needs
  size/colour facets, collection materialisation at scale, safe link
  rewriting, or facet-count badges has a stated starting point.

### Status
**Accepted.**
