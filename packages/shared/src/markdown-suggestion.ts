/**
 * WO-9.8 (09-ai-layer.md) — "recommend the discount that clears [ageing
 * stock] at the least margin loss, showing the trade-off explicitly."
 *
 * No model: a fixed ladder of candidate discounts, each scored against a
 * transparent, shop-tunable assumption about how much a markdown speeds up
 * sell-through (MarkdownVelocityMultiplierPer10Pct) — never an invented
 * universal constant, and never presented as an observed fact. The result
 * is always an ESTIMATE, exactly as the doc's own example phrases it
 * ("clears an estimated 60% in 30 days").
 */

/** 10%..50% off, in basis points — the only discounts ever offered. */
const CANDIDATE_BPS_STEPS = [1000, 2000, 3000, 4000, 5000];

/** Matches VariantSalesStat.units30's own window, and the doc's own "in 30 days" example. */
const CLEARANCE_HORIZON_DAYS = 30;

/** A display/comparison ceiling for "how long to clear it all" when the estimated daily rate is at or near zero — not a real prediction, just keeps the number finite. */
const MAX_CLEARANCE_DAYS = 3650;

export interface MarkdownSuggestionInput {
  stock: number;
  costPricePaisa: number;
  currentPricePaisa: number;
  /** Units sold in the trailing 90 days — a longer, steadier window than 30 for an item that is barely selling at all. */
  units90: number;
  /** Assumed clearance-velocity multiplier per 10 points of markdown, compounding — see the Setting's own doc comment (settings.defaults.ts). */
  velocityMultiplierPer10Pct: number;
  /** The 30-day clearance percentage considered "enough" — the smallest candidate reaching it wins ("least margin loss"). */
  targetClearancePct: number;
  /** A candidate's own margin, as basis points of ITS discounted price, must be at or above this — never suggest below this floor, whatever clearance it would reach. */
  minMarginBps: number;
}

export interface MarkdownSuggestionResult {
  suggestedBps: number;
  estimatedClearancePct: number;
  estimatedClearanceDays: number;
  marginBeforePaisa: number;
  marginAfterPaisa: number;
}

/**
 * Null when there is no honest basis for a suggestion at all: no stock to
 * clear, or no real cost (costPrice 0 means "never received against a PO",
 * i.e. unknown, per ProductVariant's own doc comment — not free), or a
 * non-positive selling price. Also null when every candidate on the ladder
 * would violate the margin floor — nothing safe to offer.
 */
export function computeMarkdownSuggestion(input: MarkdownSuggestionInput): MarkdownSuggestionResult | null {
  if (input.stock <= 0 || input.costPricePaisa <= 0 || input.currentPricePaisa <= 0) return null;

  const baselineDailyRate = input.units90 / 90;
  const marginBeforePaisa = input.currentPricePaisa - input.costPricePaisa;

  const candidates = CANDIDATE_BPS_STEPS.map((bps) => {
    const discountedPricePaisa = Math.round(input.currentPricePaisa * (1 - bps / 10000));
    const marginAfterPaisa = discountedPricePaisa - input.costPricePaisa;
    const marginAfterBps =
      discountedPricePaisa > 0 ? Math.round((marginAfterPaisa / discountedPricePaisa) * 10000) : -Infinity;
    const velocityMultiplier = input.velocityMultiplierPer10Pct ** (bps / 1000);
    const dailyRate = baselineDailyRate * velocityMultiplier;
    const estimatedClearancePct =
      dailyRate > 0 ? Math.min(100, ((dailyRate * CLEARANCE_HORIZON_DAYS) / input.stock) * 100) : 0;
    const estimatedClearanceDays =
      dailyRate > 0 ? Math.min(MAX_CLEARANCE_DAYS, Math.ceil(input.stock / dailyRate)) : MAX_CLEARANCE_DAYS;
    return { bps, marginAfterPaisa, marginAfterBps, estimatedClearancePct, estimatedClearanceDays };
  }).filter((candidate) => candidate.marginAfterBps >= input.minMarginBps);

  if (candidates.length === 0) return null;

  // Ascending by bps already (CANDIDATE_BPS_STEPS' own order) — the first
  // one clearing the target is the smallest, i.e. "least margin loss".
  const chosen = candidates.find((c) => c.estimatedClearancePct >= input.targetClearancePct) ?? candidates[candidates.length - 1];

  return {
    suggestedBps: chosen.bps,
    estimatedClearancePct: Math.round(chosen.estimatedClearancePct * 10) / 10,
    estimatedClearanceDays: chosen.estimatedClearanceDays,
    marginBeforePaisa,
    marginAfterPaisa: chosen.marginAfterPaisa,
  };
}
