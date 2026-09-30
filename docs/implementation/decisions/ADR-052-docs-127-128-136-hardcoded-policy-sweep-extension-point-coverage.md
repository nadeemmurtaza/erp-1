# ADR-052 — Docs 127/128/136 (hardcoded-policy sweep, extension-point coverage audit, database/cache portability audit): two real policy gaps converted; both of doc 128's own "gaps found" turn out to already be closed by prior work it never checked against; 170+ raw-SQL call sites triaged, none rewritten

[← Decision log](../DECISIONS.md)


### Context

Three architecture-patterns documents describe themselves as one-time
audits rather than new mechanisms — doc 127 (a sweep for hardcoded
business thresholds still living in application code), doc 128 (a
port-coverage audit claiming two concrete extension-point gaps: SSO/
identity and shipping carriers), and doc 136 (a portability audit of every
`$queryRaw`/`$executeRaw` call site). None had ever been run against the
actual codebase; each document's own claims were taken on faith by
whichever process wrote them. This entry records what running each audit
for real actually found.

### Decision — doc 127: two genuine policy gaps converted, everything else confirmed a legitimate constant

`scripts/check-hardcoded-policy.mjs` (WO-127.1) runs three heuristics — the
document's own two, plus a `DAYS`/`PERCENT`/`RATE`/`GRACE`-shaped pattern
that surfaced findings the original two missed. Deliberately not wired
into `pnpm lint`, per the document's own caution against a permanently
noisy check nobody trusts.

The triage (WO-127.2) found exactly two genuine policy gaps, both
converted to a `Setting` following the exact sibling pattern
`InventorySlowMoverDays`/`DemandForecastSafetyStockDays` already establish:
`QuoteService`'s hardcoded 14-day default quote validity
(`SettingKey.TradingPartnersQuoteDefaultValidityDays`) and `CartService`'s
hardcoded 30-day guest-cart TTL (`SettingKey.CartGuestTtlDays`). Every
other candidate the sweep surfaced — an API-key lockout window, a
duplicate-detection similarity threshold, several search/recommendation
result-count caps, a report query's own date-range safety bound — checked
out as a genuine engineering constant on inspection of its own call site,
matching this document's own worked example (`MAX_ATTEMPTS` in the outbox
dispatcher).

### Decision — doc 128: both "gaps found" are already closed; the document's own title is stale, not the architecture

Doc 128 claimed, "confirmed by search," that no SSO/identity port and no
shipping-carrier port exist. A fresh grep against the codebase as it
stands today finds both already built, by other documents this one never
cross-referenced:

- `IdentityProvider` (`core/auth/identity-provider.ts`) — built under
  `161-sso-identity-federation.md` (ADR-043). Its own doc comment already
  cites doc 128 by name and corrects its sketch on contact with a real
  OIDC flow (one `verifyAssertion()` method sketched; two real steps
  needed, `buildAuthorizationUrl()`/`handleCallback()`).
- `CourierProvider` (`fulfilment/courier-provider.ts`) — built under
  WO-6.3, predating doc 128 entirely. Covers booking, labels, tracking and
  webhook verification, registered via a `COURIER_PROVIDERS` env allowlist
  — the identical shape doc 128's own §2 sketches, down to citing the same
  `PaymentProvider`/`StorageDriver` idiom. Doc 128's own claim that
  `Shipment.cost` is "populated from whatever process already exists" is
  also wrong: it is computed from `ShippingRate`, a real zone × method
  rate table (`FLAT`/`BY_WEIGHT`/`BY_ITEM`), not manual entry.

One narrower gap survives inspection and is deliberately left unbuilt:
`CourierProvider` has no `getRate()` for a *live* carrier-API quote (as
opposed to the shop's own static `ShippingRate` card). `courier-provider.
ts`'s own comment is unchanged and still true — no real courier account
exists in this deployment to build a live-quote integration against — so
adding it now would be exactly the speculative interface doc 36 (cited by
doc 128 itself) already refuses.

WO-128.3's own permission sketch (`settings.sso.manage`,
`settings.carriers.manage`) is corrected rather than built:
`settings.sso.manage` already exists and gates `SsoConnection`
administration, a real database row; `settings.carriers.manage` is never
added, because `CourierProvider` registration is deployment-time env
configuration with no runtime row to gate — the identical position
`PAYMENT_PROVIDERS` already occupies with no matching permission.

### Decision — doc 136: 170+ raw-SQL call sites found, all justified, none rewritten

The sweep found far more `$queryRaw`/`$executeRaw` call sites than doc
136's own text anticipated. Every one triages into one of six named
categories, each working around a genuine Prisma capability gap rather
than developer habit: atomic per-year document numbering
(`pg_advisory_xact_lock` — the majority of hits, across ten modules),
outbox/queue claiming (`FOR UPDATE SKIP LOCKED`), atomic upsert-and-
increment (`INSERT ... ON CONFLICT ... RETURNING`), columns Prisma cannot
address at all (`pgvector`'s `::vector`, full-text `tsvector`),
column-to-column `WHERE` comparisons (Prisma's filter API only compares a
column to a literal), and conditional aggregation computed in one round
trip. None of the 170+ sites is rewritten — none is avoidable, per this
document's own standard ("confirming each one is named and justified, not
eliminating raw SQL as a category"). The full category breakdown, with
file citations, is recorded in doc 136's own Status blockquote as the
permanent triage record WO-136.2 asks for.

### Reasoning

All three audits converge on the same lesson: an architecture-pattern
document's own factual claims about "what exists" or "what was found" are
exactly as reliable as the last time anyone actually checked them against
the codebase — which, for docs 127/128/136, was never, until this pass.
Doc 128 in particular illustrates the risk of an audit document that
becomes stale the moment the very gaps it names get closed by unrelated,
later work (docs 161 and WO-6.3, neither of which had reason to know doc
128 existed). The fix is the same one this whole batch of documents
already established for docs 95/98/103/108/115: verify before building,
and correct the record rather than build a redundant second interpretation
of a mechanism that already exists.

### Consequences

- Two real business defaults (quote validity, cart TTL) are now
  client-editable without a deploy, matching this repository's own "rows
  over enums" discipline.
- `scripts/check-hardcoded-policy.mjs` exists as a repeatable, manually-run
  tool for the next sweep, with its own current clean output (13 remaining
  candidates, all already triaged as legitimate constants) serving as the
  baseline a future re-run compares against.
- Doc 128 no longer overstates what is missing — a future reader is not
  sent to (re-)build `IdentityProvider` or `CourierProvider` from scratch.
- Doc 136's own category list is a genuine reference: a future database or
  cache portability effort starts from a pre-triaged list of ~170 call
  sites instead of re-discovering them one at a time.

### Status
**Accepted.**
