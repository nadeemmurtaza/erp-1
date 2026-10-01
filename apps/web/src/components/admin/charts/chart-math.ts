import type { BadgeTone } from "@/components/ui";

/**
 * The arithmetic two charts share, kept out of the components so it can be
 * tested without rendering one.
 */

export type ChangeKind = "up" | "down" | "flat" | "new";

export interface PeriodChange {
  kind: ChangeKind;
  /** Absolute percentage change to one decimal place. 0 for `flat` and `new`. */
  pct: number;
}

/**
 * This period against the last, as a direction and a percentage.
 *
 * A previous value of zero has no percentage: 0 to 40 is not "infinitely up",
 * it is new, and the caller words it that way. 0 to 0 is flat. A change smaller
 * than a tenth of a percent rounds to flat rather than printing "+0.0%".
 */
export function periodChange(current: number, previous: number): PeriodChange {
  if (previous === 0)
    return current === 0 ? { kind: "flat", pct: 0 } : { kind: "new", pct: 0 };

  const pct =
    Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
  if (pct === 0) return { kind: "flat", pct: 0 };
  return { kind: pct > 0 ? "up" : "down", pct: Math.abs(pct) };
}

/**
 * Which tone a change wears. Direction and goodness are different questions: a
 * falling return rate went `down` and is good. Flat and new stay neutral, since
 * neither is good or bad on its own.
 */
export function changeTone(kind: ChangeKind, upIsGood: boolean): BadgeTone {
  if (kind === "flat" || kind === "new") return "neutral";
  return (kind === "up") === upIsGood ? "success" : "danger";
}

export interface Share {
  label: string;
  value: number;
}

export const OTHER_LABEL = "Other";

/**
 * A donut past six segments stops being a share and becomes a colour wheel
 * (dataviz `choosing-a-form.md`): five named slices and one "Other".
 */
export const MAX_NAMED_SLICES = 5;

/**
 * Sorts descending, keeps the top `maxSlices` (never more than
 * {@link MAX_NAMED_SLICES}) and folds the rest into one "Other". A tail that sums
 * to zero is dropped rather than drawn as an empty slice.
 */
export function foldShares<T extends Share>(
  items: readonly T[],
  maxSlices: number = MAX_NAMED_SLICES,
): Share[] {
  const named = Math.max(1, Math.min(maxSlices, MAX_NAMED_SLICES));
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, named);
  const otherTotal = sorted
    .slice(named)
    .reduce((sum, item) => sum + item.value, 0);
  return otherTotal > 0
    ? [...top, { label: OTHER_LABEL, value: otherTotal }]
    : top;
}

/** A slice's share of the whole as a percentage to one decimal place; 0 when the whole is 0. */
export function sharePct(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
}
