import type { BadgeTone } from '@/components/ui';

/**
 * The arithmetic two charts share, kept out of the components so it can be
 * tested without rendering one.
 */

export type ChangeKind = 'up' | 'down' | 'flat' | 'new';

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
  if (previous === 0) return current === 0 ? { kind: 'flat', pct: 0 } : { kind: 'new', pct: 0 };

  const pct = Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
  if (pct === 0) return { kind: 'flat', pct: 0 };
  return { kind: pct > 0 ? 'up' : 'down', pct: Math.abs(pct) };
}

/**
 * Which tone a change wears. Direction and goodness are different questions: a
 * falling return rate went `down` and is good. Flat and new stay neutral, since
 * neither is good or bad on its own.
 */
export function changeTone(kind: ChangeKind, upIsGood: boolean): BadgeTone {
  if (kind === 'flat' || kind === 'new') return 'neutral';
  return (kind === 'up') === upIsGood ? 'success' : 'danger';
}

export interface Share {
  label: string;
  value: number;
}

export const OTHER_LABEL = 'Other';

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
export function foldShares<T extends Share>(items: readonly T[], maxSlices: number = MAX_NAMED_SLICES): Share[] {
  const named = Math.max(1, Math.min(maxSlices, MAX_NAMED_SLICES));
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, named);
  const otherTotal = sorted.slice(named).reduce((sum, item) => sum + item.value, 0);
  return otherTotal > 0 ? [...top, { label: OTHER_LABEL, value: otherTotal }] : top;
}

/** A slice's share of the whole as a percentage to one decimal place; 0 when the whole is 0. */
export function sharePct(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
}

/* ── funnel ───────────────────────────────────────────────────────────── */

export interface FunnelStage {
  label: string;
  value: number;
}

export interface FunnelStep extends FunnelStage {
  /** Share of the first stage that reached this one, to one decimal. */
  ofFirst: number;
  /** Share of the previous stage that reached this one; null for the first stage. */
  ofPrevious: number | null;
  /** Units lost since the previous stage; null for the first stage. */
  dropped: number | null;
  /** Percentage lost since the previous stage; null for the first stage. */
  droppedPct: number | null;
}

/**
 * Stage-by-stage conversion for a sequence where each stage is meant to be a
 * subset of the one before. Nothing here assumes that holds: a stage larger than
 * its predecessor gets a negative drop, which the caller can show as "grew"
 * rather than hide. `ofFirst` is 0 for every stage when the first is 0.
 */
export function funnelSteps(stages: readonly FunnelStage[]): FunnelStep[] {
  const first = stages[0]?.value ?? 0;
  return stages.map((stage, index) => {
    const previous = index === 0 ? null : stages[index - 1]!.value;
    return {
      ...stage,
      ofFirst: sharePct(stage.value, first),
      ofPrevious: previous == null ? null : sharePct(stage.value, previous),
      dropped: previous == null ? null : previous - stage.value,
      droppedPct:
        previous == null ? null : previous > 0 ? Math.round(((previous - stage.value) / previous) * 1000) / 10 : 0,
    };
  });
}

/** Index of the stage that lost the most (by percentage), or null when nothing was lost anywhere. */
export function largestDropIndex(steps: readonly FunnelStep[]): number | null {
  let best: number | null = null;
  let bestPct = 0;
  steps.forEach((step, index) => {
    if (step.droppedPct != null && step.droppedPct > bestPct) {
      best = index;
      bestPct = step.droppedPct;
    }
  });
  return best;
}

/* ── gauge ────────────────────────────────────────────────────────────── */

export type GaugeKind = 'progress' | 'capacity';
export type GaugeStatus = 'ok' | 'complete' | 'warning' | 'critical';

export interface GaugeState {
  /** The true percentage of the goal, to one decimal. It can pass 100. */
  pct: number;
  /** How much of the ring to fill, clamped to 0 to 1. */
  fill: number;
  status: GaugeStatus;
}

/**
 * One value against a fixed goal. `progress` is "toward a target" (a quota): more
 * is better, so there is no severity, only `complete` at or past the goal.
 * `capacity` is "against a limit" (storage, a credit line): more is worse, so it
 * warns at `warnAt` and goes critical at `criticalAt` (fractions of the limit).
 * A goal of zero or less is not a goal: the ring is empty and the status `ok`.
 */
export function gaugeState(
  value: number,
  max: number,
  {
    kind = 'progress',
    warnAt = 0.8,
    criticalAt = 0.95,
  }: { kind?: GaugeKind; warnAt?: number; criticalAt?: number } = {},
): GaugeState {
  if (max <= 0) return { pct: 0, fill: 0, status: 'ok' };

  const ratio = Math.max(0, value) / max;
  const pct = Math.round(ratio * 1000) / 10;
  const fill = Math.min(1, ratio);

  if (kind === 'capacity') {
    return { pct, fill, status: ratio >= criticalAt ? 'critical' : ratio >= warnAt ? 'warning' : 'ok' };
  }
  return { pct, fill, status: ratio >= 1 ? 'complete' : 'ok' };
}

/* ── calendar heatmap ─────────────────────────────────────────────────── */

export interface HeatDay {
  /** `YYYY-MM-DD`, a calendar day with no zone attached. */
  date: string;
  value: number;
}

export interface HeatCell {
  date: string;
  value: number;
  /** 0 for no activity, 1 to 4 for quartiles of the non-zero days. */
  level: 0 | 1 | 2 | 3 | 4;
}

export interface HeatCalendar {
  /** One entry per week, Monday first; a day after the last data day is null. */
  weeks: (HeatCell | null)[][];
  /** The first column of each month, for the labels along the top. */
  months: { column: number; date: string }[];
  /** The three cut points between levels 1 to 4. */
  cuts: [number, number, number];
}

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` to a UTC midnight, so no timezone can move the day. */
function dayToMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
}

function msToDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Monday of the ISO week holding `ms`. */
function mondayOf(ms: number): number {
  const weekday = (new Date(ms).getUTCDay() + 6) % 7; // Monday = 0
  return ms - weekday * DAY_MS;
}

/**
 * The three cut points between the four coloured levels: quartiles of the days
 * that had any activity. Quartiles, not an even split of the range, so one
 * outlier day does not turn every other day the palest shade. Returns zeros when
 * there is nothing to cut.
 */
export function quantileCuts(values: readonly number[]): [number, number, number] {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [0, 0, 0];
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  return [at(0.25), at(0.5), at(0.75)];
}

export function heatLevel(value: number, cuts: readonly [number, number, number]): HeatCell['level'] {
  if (value <= 0) return 0;
  if (value <= cuts[0]) return 1;
  if (value <= cuts[1]) return 2;
  if (value <= cuts[2]) return 3;
  return 4;
}

/**
 * Lays `days` out as `weeks` columns of Monday-to-Sunday, ending with the week
 * that holds the latest day in the data. A day missing from the data inside the
 * window is a day with no activity, so it is 0, not a hole. Returns no weeks for
 * no data.
 */
export function buildHeatCalendar(days: readonly HeatDay[], weeks = 26): HeatCalendar {
  if (days.length === 0 || weeks < 1) return { weeks: [], months: [], cuts: [0, 0, 0] };

  const byDate = new Map(days.map((d) => [d.date, d.value]));
  const last = Math.max(...days.map((d) => dayToMs(d.date)));
  const start = mondayOf(last) - (weeks - 1) * 7 * DAY_MS;

  const inWindow = days.filter((d) => dayToMs(d.date) >= start).map((d) => d.value);
  const cuts = quantileCuts(inWindow);

  const columns: (HeatCell | null)[][] = [];
  const months: HeatCalendar['months'] = [];
  let lastMonth = -1;

  for (let w = 0; w < weeks; w++) {
    const column: (HeatCell | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const ms = start + (w * 7 + d) * DAY_MS;
      if (ms > last) {
        column.push(null);
        continue;
      }
      const date = msToDay(ms);
      const value = byDate.get(date) ?? 0;
      column.push({ date, value, level: heatLevel(value, cuts) });
    }
    columns.push(column);

    const monday = msToDay(start + w * 7 * DAY_MS);
    const month = new Date(start + w * 7 * DAY_MS).getUTCMonth();
    if (month !== lastMonth) {
      months.push({ column: w, date: monday });
      lastMonth = month;
    }
  }

  return { weeks: columns, months, cuts };
}

export interface HeatMonth {
  /** `YYYY-MM`. */
  month: string;
  total: number;
  /** The busiest day of that month inside the window; the earliest one on a tie. */
  busiest: { date: string; value: number };
}

/**
 * Per-month totals over the days a calendar actually shows. It is the table twin
 * of a heatmap: a screen reader gets twelve rows instead of three hundred and
 * sixty-five cells, and the cells themselves stay individually reachable.
 */
export function heatMonthTotals(calendar: HeatCalendar): HeatMonth[] {
  const months = new Map<string, HeatMonth>();
  for (const week of calendar.weeks) {
    for (const cell of week) {
      if (!cell) continue;
      const key = cell.date.slice(0, 7);
      const current = months.get(key);
      if (!current) {
        months.set(key, { month: key, total: cell.value, busiest: { date: cell.date, value: cell.value } });
        continue;
      }
      current.total += cell.value;
      if (cell.value > current.busiest.value) current.busiest = { date: cell.date, value: cell.value };
    }
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] as const;

/**
 * The next round number at or above `value`: 51,000 becomes 60,000, 18 becomes 20.
 * One shared ceiling is what lets several small charts be compared by eye, so it
 * has to be round enough to read as an axis and tight enough not to leave half the
 * plot empty.
 */
export function niceCeil(value: number): number {
  if (!(value > 0)) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const step = NICE_STEPS.find((s) => s >= fraction - 1e-9) ?? 10;
  return step * exponent;
}
