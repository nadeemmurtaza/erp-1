# Phase 9 — The AI layer

**Read `00-HOUSE-RULES.md` first.** Depends on Phases 3, 4 and 6.

## The two rules that govern this entire phase

1. **Everything AI-generated is a draft a human confirms.** Nothing publishes,
   prices, orders, cancels or messages a customer unreviewed. The AI proposes;
   a person disposes. Every feature below is designed around that.
2. **`AiProvider` is an interface** (House Rule 8), exactly like
   `PaymentProvider` and `StorageDriver`. The model is a config change, never a
   rewrite. Env allowlist `AI_PROVIDERS`, credentials in env, and the whole
   module degrades to absent — not broken — when nothing is configured. Every
   AI-powered button must be invisible or disabled when no provider is on.

```ts
export interface AiProvider {
  readonly key: string;
  complete(input: CompletionInput): Promise<CompletionResult>;
  embed(texts: string[]): Promise<number[][]>;
  describeImage?(imageUrl: string, prompt: string): Promise<string>;
}
```

Also, three practical constraints that will otherwise bite:

- **Cost.** Log tokens and cost per call, per feature. Add a monthly budget
  setting and stop calling when it is hit. An unbounded AI bill on a boutique's
  margins is a real risk.
- **Latency.** No AI call sits in a request path a customer waits on. Generate
  in the background, cache the result, serve the cache.
- **Failure.** Every AI call has a timeout and a fallback that is the current
  non-AI behaviour. An AI outage must never take checkout, search or the admin
  down.

## Work orders, in payoff order

| WO | Title | Depends on |
|---|---|---|
| 9.1 | Alt text and SEO copy generation | Phase 3 |
| 9.2 | Size recommendation | Phase 7 |
| 9.3 | Demand forecasting and reorder | Phase 1 |
| 9.4 | COD risk scoring | Phase 6 |
| 9.5 | Semantic and visual search | Phase 8 |
| 9.6 | Recommendations | Phase 8 |
| 9.7 | WhatsApp assistant | Phase 8 |
| 9.8 | Markdown suggestions | Phases 1, 4 |
| 9.9 | Review summarisation | Phase 7 |
| 9.10 | Bulk-import cleanup | Phase 3 |

---

## WO-9.1 — Alt text and SEO copy

**The highest-value item in the phase**, because it turns Phase 3's publish gate
from a chore into one click, and because the alt-text backlog is real: every
existing product image currently carries filename-shaped alt text.

- `describeImage()` on the product photo, prompted with the product's name,
  category, fabric and colour, producing alt text in **English and Urdu**.
- Meta title and description from product attributes, respecting length limits
  and the focus keyword.
- Product descriptions and care instructions as drafts.
- **Bulk mode** over the Phase 3 SEO health list: generate for everything
  failing the gate, present as a review queue, a person approves in batches.
  Never auto-publish.

Guardrails: never invent a material, a measurement, a certification or a price.
Prompt with the real attributes and instruct it to describe only what it can see
and what it was given.

---

## WO-9.2 — Size recommendation

**The one nobody else in this market can copy**, because it needs the
measurement data this shop already has: `MeasurementProfile`,
`MeasurementField`, `GarmentSizeChart`.

Start **without a model.** Match the customer's saved measurements against the
size chart, pick the nearest size, express confidence. That is arithmetic and it
will be right most of the time.

Then improve it with data you are already collecting: `Review.fitFeedback`
(Phase 7) and return reasons `too_small` / `too_large` (Phase 6). A garment where
40% say "too small" gets its recommendation shifted up a size. That loop is worth
more than any model.

Surface as "Based on your measurements, take M" on the product page, with the
reasoning shown. Cuts the largest return reason in apparel, which means it pays
for itself in Phase 6's RTO and returns costs.

---

## WO-9.3 — Demand forecasting

Phase 1's reorder point is a static number. Make it a forecast.

Use `VariantSalesStat` and the `StockMovement` ledger. Start with a simple
seasonal model — trailing average with a same-period-last-year factor — before
reaching for anything clever. For a boutique with a year of history, a
well-chosen average beats an over-fitted model.

Output feeds the existing draft-PO automation (Phase 1, WO-1.6): a suggested
quantity with a reason ("Eid demand: last year 3× the March average"). The
suggestion is always reviewable; it never sends a PO.

Also useful and easy: flag stock that will run out before its supplier lead time
allows a reorder to land.

---

## WO-9.4 — COD risk scoring

The defining cost of Pakistani e-commerce. Phase 6's RTO data is the training
signal — which is why this comes after it, not before.

Features: address completeness and plausibility, city RTO rate, order value
versus the city's average, this phone's order and RTO history, time of day,
whether the customer has an account, whether the phone is reachable.

Output: a score and a recommended action — auto-confirm, confirmation call, or
require advance payment. **A person decides**; the score sorts a queue. Never
auto-cancel an order on a score.

Start with a transparent rule-based score. It is explainable to staff, it is
tunable, and it will capture most of the value. Move to a model only once you
have enough labelled RTO outcomes to validate one — and keep the rules as the
fallback.

---

## WO-9.5 — Semantic and visual search

Builds on Phase 8's Postgres full-text search, does not replace it.

- `pgvector` in Postgres — no extra service. Embed product name, description,
  attributes and category per locale.
- **Hybrid ranking**: combine the `ts_rank` score with vector similarity. Pure
  vector search is worse than keyword search for exact SKU and brand lookups; use
  both.
- Natural-language queries in English and Urdu ("something light for a summer
  mehndi").
- Visual search via image embedding: upload a photo, find the nearest products.
- Re-embed on product change, in the background, batched.

---

## WO-9.6 — Recommendations

- Related products — embedding similarity, cheap once WO-9.5 exists.
- Frequently bought together — co-occurrence in `OrderItem`, no AI needed at all.
- **Complete the look** — the boutique-specific one, and the strongest: a
  kameez, its dupatta, the matching shoes. Seed it with the manual cross-sell
  links from Phase 3 and let co-occurrence extend it.
- Personalised homepage from browse and purchase history.

Always leave the manual override in place. A merchandiser's curated pairing beats
the algorithm often enough that removing the control is a mistake.

---

## WO-9.7 — WhatsApp assistant

WhatsApp Business API through Phase 8's `NotificationChannel`. Answers order
status, delivery timing, size help, stock and returns — grounded strictly in this
customer's own data, retrieved by their verified phone number.

Non-negotiable:
- **Verify identity before revealing anything.** The phone number on the message
  must match the order. Never disclose another customer's data.
- **Hand off to a human** on anything about a complaint, a refund amount, a
  payment problem, or when the customer asks. Make the handoff obvious.
- **Never let it commit the shop** — no promised delivery dates it invented, no
  discounts, no cancellations, no refunds.
- Log every conversation against the CRM `Contact`.

---

## WO-9.8 — Markdown suggestions

Pairs Phase 1's slow-mover detection with Phase 4's cost data: for ageing stock,
recommend the discount that clears it at the least margin loss, showing the
trade-off explicitly ("20% off clears an estimated 60% in 30 days; margin falls
from Rs 900 to Rs 210 a unit").

Creates a **draft** discount in Phase 5's engine. A person activates it.

---

## WO-9.9 — Review summarisation

"Most customers say it runs small" above the review list, regenerated when review
count crosses a threshold and cached. Extract fit signal, quality signal and
common complaints. Feeds WO-9.2 and gives merchandising a quality signal per
supplier.

---

## WO-9.10 — Bulk-import cleanup

The CSV import at `/admin/import` already exists and is idempotent. Add AI
assistance to the mapping step: infer column mappings, normalise inconsistent
values ("Blue"/"blue"/"BLUE"/"Ferozi Blue"), flag likely duplicates, suggest
categories and generate missing translations.

Always a **preview with a diff** before anything is written. The import is
idempotent, but a bad bulk mapping is still an afternoon of cleanup.

## Phase 9 exit criteria

1. With `AI_PROVIDERS` empty, every screen works exactly as before and no AI
   affordance is visible.
2. No AI call sits in a path a customer waits on.
3. Every AI output is reviewed before it reaches a customer or a supplier.
4. Token cost per feature is logged and the monthly budget cap works.
5. Size recommendation improves measurably against the Phase 6 return-reason
   baseline — measure it, do not assume it.
6. The WhatsApp assistant never reveals data for a phone number other than the
   sender's. Test this adversarially.
