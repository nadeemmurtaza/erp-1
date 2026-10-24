# 127 — Finding what's still hardcoded: a systematic sweep, not a one-off fix

> **Status: shipped (2026-09-26), WO-127.1/127.2.**
> `scripts/check-hardcoded-policy.mjs` runs the sweep (three heuristics —
> the document's own two, plus a `DAYS`/`PERCENT`/`RATE`/`GRACE`-shaped
> pattern that surfaced two real findings the original two missed).
> **Not added to `pnpm lint`**, exactly as WO-127.1 cautions — a
> heuristic-driven check with no way to distinguish an engineering
> constant from a policy value would be permanently noisy.
>
> The triage (WO-127.2), one full pass against the current codebase:
>
> **Genuine policy gaps, converted** — both now read from a `Setting`,
> the exact sibling pattern `InventorySlowMoverDays`/`DemandForecastSafetyStockDays`
> already establish:
> - `QuoteService`'s hardcoded `DEFAULT_VALIDITY_DAYS = 14` → `SettingKey.
>   TradingPartnersQuoteDefaultValidityDays` (`tradingpartners.quote_default_validity_days`,
>   default 14) — a shop's own default quote-validity term, not an
>   engineering bound.
> - `CartService`'s hardcoded `CART_TTL_DAYS = 30` → `SettingKey.
>   CartGuestTtlDays` (`cart.guest_ttl_days`, default 30) — "how long a
>   shop wants to hold a cart open is its own call, not an engineering one."
>
> **Already correctly a constant (no action)** — every other candidate the
> sweep surfaced, each checked against its own call site rather than
> assumed: `API_KEY_FAILURE_LIMIT`/`API_KEY_FAILURE_WINDOW_MS` (an
> in-memory, per-process DoS-prevention bound — never a business rule a
> tenant configures), `DUPLICATE_SIMILARITY_THRESHOLD` (a Jaccard-similarity
> algorithm calibration, not a client-varying figure), `CANDIDATE_LIMIT`/
> `VISUAL_SEARCH_LIMIT` (search ranking-pass bounds), `RELATED_LIMIT`/
> `FREQUENTLY_BOUGHT_LIMIT`/`PERSONALIZED_LIMIT` (recommendation
> display-count caps — a UI capacity bound, not a computed or owed figure),
> `CO_OCCURRENCE_FILL_LIMIT`/`EMBEDDING_FILL_LIMIT`/
> `CO_OCCURRENCE_WINDOW_DAYS`/`MIN_CO_OCCURRENCE_ORDERS` (recommendation
> cron algorithm tuning), `LOOKBACK_DAYS` (a risk-scoring statistical
> sampling window), `MAX_RANGE_DAYS`/`DEFAULT_RANGE_DAYS`
> (`reports.service.ts`'s own query-safety bound against an unbounded
> export — distinct from, and narrower than, the already-Setting-backed
> `AnalyticsDefaultRangeDays` the dashboard cards use).
>
> **Ambiguous** — none; every candidate resolved to one of the two buckets
> above on inspection of its own call site.

This repository's own "rows over enums" discipline has already converted
tax rates (doc 15), pricing tiers (doc 50), deduction types (doc 40),
leave types, and approval-chain tier counts (doc 63) from hardcoded logic
into client-editable data — each converted individually, as its own
document named the need. This document is the systematic version: a
one-time audit finding every *remaining* threshold, bracket, or business
rule still living in application code rather than a data row, so the next
policy change is a data edit rather than a discovered gap.

## 1. The sweep, as a repeatable script, not a one-time manual pass

```bash
# scripts/check-hardcoded-policy.mjs — greps for the shape a hardcoded
# business threshold typically takes: a numeric literal compared against
# a business field, outside a test file, outside a Setting/data-row read.
grep -rn "if.*amount.*[<>]=?\s*[0-9]\{3,\}" apps/api/src --include='*.ts' | grep -v '.spec.ts'
grep -rn "const [A-Z_]*THRESHOLD\|const [A-Z_]*LIMIT\s*=\s*[0-9]" apps/api/src --include='*.ts'
```

This is deliberately a **starting heuristic, not a complete static
analyzer** — like `scripts/check-rebrand.mjs`'s own admission that a
literal grep cannot catch every case, this script's job is to surface
candidates for human review, not to certify completeness by itself.

## 2. What "converted" means, and what legitimately stays a constant

Not every numeric literal is a policy violation — `MAX_ATTEMPTS` in the
outbox dispatcher's own retry logic is an *engineering* constant (how
many times to retry a network call), never a client-varying business
rule, and doc 95's own reasoning already draws this line: a policy is
data when it varies by client or jurisdiction; an engineering parameter
stays a constant. The sweep's own output is triaged into three buckets —
**already correctly a constant** (no action), **a genuine policy gap**
(converted to a data row, following the exact pattern its nearest
existing sibling already establishes — `TaxRate` for a rate, a `Setting`
for a single value, a dedicated `*Type`/`*Policy` model for a small
enumerable set), and **ambiguous, needs a human decision** (recorded in
this document's own findings list, resolved one at a time).

## Scope lenses

Not applicable in the usual sense — this document is an audit process,
not a new mechanism; each finding it produces is scoped and documented
individually, following whichever existing sibling pattern fits (doc 15,
40, 50, 63), with that finding's own full scope-lens treatment written at
that time.

## Work orders

**WO-127.1 — `scripts/check-hardcoded-policy.mjs`**, the heuristic sweep
above, run once as an audit and optionally added to `pnpm lint` if its
signal-to-noise ratio proves high enough after the first manual triage
(never added to CI blindly before that's confirmed, to avoid a
permanently-noisy check nobody trusts).
**WO-127.2 — the triage pass**: run the sweep, bucket every finding,
convert each genuine gap following its nearest existing sibling pattern.

## Acceptance

- The sweep's own findings are triaged into the three buckets above, with
  every "genuine policy gap" finding either converted or explicitly
  deferred with a stated reason.
- Every conversion follows an existing, already-established pattern
  (`TaxRate`, `Setting`, a `*Type` model) rather than inventing a new one
  per finding.

## Out of scope

A fully automated static analyzer that definitively distinguishes policy
from engineering constants — not achievable with a grep-based heuristic;
human triage remains the final judgment, per this repository's own
`check-rebrand.mjs` precedent for exactly this class of imperfect-but-
useful check.
