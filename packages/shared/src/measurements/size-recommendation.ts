import { GARMENT_SIZE_TOKENS, type GarmentSizeToken, type MeasurementFieldDef, type MeasurementValues } from './types';

/**
 * WO-9.2 (09-ai-layer.md) — "start without a model." Pure arithmetic: nearest
 * size by measurement distance, nudged by ProductSizeBias.shift, snapped to a
 * size this product actually sells. No AiProvider call anywhere in here —
 * this is the one Phase 9 feature that works identically whether or not any
 * AI_PROVIDERS are configured. Kept side-effect-free (no Prisma, no fetch) so
 * it can be unit tested directly and shared between the API and, if a future
 * surface needs it, the storefront itself.
 */

export interface SizeChartRow {
  sizeToken: GarmentSizeToken;
  /** field key -> value, same shape as a MeasurementProfile — a row rarely covers every field. */
  values: MeasurementValues;
}

export type SizeConfidence = 'high' | 'medium' | 'low';

export interface SizeRecommendation {
  /** The size to actually show the customer — always one this product sells. */
  recommendedSize: GarmentSizeToken;
  /** What the raw measurement match alone picked, before any fit-feedback nudge or availability snap. */
  matchedSize: GarmentSizeToken;
  confidence: SizeConfidence;
  /**
   * Structured signals for the caller to compose its own localized sentence
   * from (apps/web/messages/*.json — this package never hardcodes English
   * prose a bilingual storefront would need to translate).
   */
  shiftedForFit: 'up' | 'down' | null;
  /** True when the arithmetic-plus-shift target wasn't sellable and recommendedSize is the nearest size that is. */
  unavailableFallback: boolean;
}

export interface RecommendSizeInput {
  fields: MeasurementFieldDef[];
  profile: MeasurementValues;
  chart: SizeChartRow[];
  /** Size tokens this specific product currently sells — the recommendation never names one that isn't buyable. */
  availableSizeTokens: string[];
  /** ProductSizeBias.shift: -1 (size down), 0, or +1 (size up), from aggregated fit feedback. */
  biasShift?: number;
}

function sizeIndex(token: string): number {
  return GARMENT_SIZE_TOKENS.indexOf(token as GarmentSizeToken);
}

/** Average absolute difference across every field both sides actually have a value for. Null when there is no overlap at all. */
function distance(fields: MeasurementFieldDef[], a: MeasurementValues, b: MeasurementValues): number | null {
  const sharedKeys = fields.map((field) => field.key).filter((key) => a[key] !== undefined && b[key] !== undefined);
  if (sharedKeys.length === 0) return null;
  const total = sharedKeys.reduce((sum, key) => sum + Math.abs(a[key] - b[key]), 0);
  return total / sharedKeys.length;
}

/** The typical measurement change from one size to the next in this chart — the yardstick a raw distance margin is judged against, so confidence means the same thing whether the garment is measured in inches or cm. */
function averageInterSizeGap(fields: MeasurementFieldDef[], chart: SizeChartRow[]): number {
  const sorted = [...chart].sort((a, b) => sizeIndex(a.sizeToken) - sizeIndex(b.sizeToken));
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = distance(fields, sorted[i - 1].values, sorted[i].values);
    if (gap !== null) gaps.push(gap);
  }
  if (gaps.length === 0) return 0;
  return gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
}

/** The available token closest in size order to `token` — null when nothing available parses as a real size token. */
function nearestAvailable(token: string, available: string[]): GarmentSizeToken | null {
  const targetIndex = sizeIndex(token);
  let best: GarmentSizeToken | null = null;
  let bestDistance = Infinity;

  for (const candidate of available) {
    const candidateIndex = sizeIndex(candidate);
    if (candidateIndex < 0) continue;
    const gap = targetIndex < 0 ? 0 : Math.abs(candidateIndex - targetIndex);
    if (gap < bestDistance) {
      bestDistance = gap;
      best = candidate as GarmentSizeToken;
    }
  }

  return best;
}

export function recommendSize(input: RecommendSizeInput): SizeRecommendation | null {
  const { fields, profile, chart, availableSizeTokens, biasShift = 0 } = input;
  if (chart.length === 0 || availableSizeTokens.length === 0) return null;

  const scored = chart
    .map((row) => ({ row, dist: distance(fields, profile, row.values) }))
    .filter((entry): entry is { row: SizeChartRow; dist: number } => entry.dist !== null)
    .sort((a, b) => a.dist - b.dist);

  if (scored.length === 0) return null;

  const [best, runnerUp] = scored;
  const typicalGap = averageInterSizeGap(fields, chart) || 1;
  const margin = runnerUp ? (runnerUp.dist - best.dist) / typicalGap : Infinity;
  const confidence: SizeConfidence = margin >= 1 ? 'high' : margin >= 0.4 ? 'medium' : 'low';

  const matchedSize = best.row.sizeToken;

  let targetToken: string = matchedSize;
  let shiftedForFit: 'up' | 'down' | null = null;
  if (biasShift !== 0) {
    const matchedIndex = sizeIndex(matchedSize);
    const shiftedIndex = matchedIndex + biasShift;
    if (matchedIndex >= 0 && shiftedIndex >= 0 && shiftedIndex < GARMENT_SIZE_TOKENS.length) {
      targetToken = GARMENT_SIZE_TOKENS[shiftedIndex];
      shiftedForFit = biasShift > 0 ? 'up' : 'down';
    }
  }

  let recommendedSize: GarmentSizeToken;
  let unavailableFallback = false;
  if (availableSizeTokens.includes(targetToken)) {
    recommendedSize = targetToken as GarmentSizeToken;
  } else {
    const fallback = nearestAvailable(targetToken, availableSizeTokens);
    if (!fallback) return null;
    recommendedSize = fallback;
    unavailableFallback = recommendedSize !== targetToken;
  }

  return { recommendedSize, matchedSize, confidence, shiftedForFit, unavailableFallback };
}
