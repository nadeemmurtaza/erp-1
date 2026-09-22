'use client';

import { useMemo } from 'react';
import { THEME_COLORS, formatMoney, toMajor } from '@newax/shared';

/**
 * The owner's own headline request (WO-23.1's WO-B.5): sales against the
 * shop's own outflow, on one axis.
 *
 * Purchases and expenses are drawn as one STACKED bar per bucket — together
 * they are "money that left" — with sales as a line-and-area overlay, same
 * idiom sales-chart.tsx already uses for a single series. Net (when the
 * viewer holds `inventory.view_cost`) is a third line on top of both.
 *
 * Same "no charting library, inline SVG, THEME_COLORS only" rule every other
 * chart in this app follows. Net deliberately stays one neutral colour
 * rather than colouring by sign — a line that flips colour every time it
 * crosses zero reads as broken, not informative; the zero gridline (drawn
 * whenever the series actually goes negative) already tells that story.
 */
const SALES = THEME_COLORS.accent.DEFAULT;
const PURCHASES = THEME_COLORS.neutral[400];
const EXPENSES = THEME_COLORS.neutral[600];
const NET = THEME_COLORS.neutral[900];
const GRID = THEME_COLORS.neutral[100];

const WIDTH = 720;
const HEIGHT = 260;
const PADDING = { top: 16, right: 16, bottom: 28, left: 64 };

export interface ComparisonBucketPoint {
  t: string;
  sales: number;
  purchases: number;
  expenses: number;
  grossProfit: number | null;
  net: number | null;
}

export function ComparisonChart({
  buckets,
  bucket,
}: {
  buckets: ComparisonBucketPoint[];
  bucket: 'day' | 'week' | 'month';
}) {
  const plot = useMemo(() => {
    const innerWidth = WIDTH - PADDING.left - PADDING.right;
    const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;

    const outflows = buckets.map((b) => b.purchases + b.expenses);
    const nets = buckets.map((b) => b.net ?? 0);
    const maxValue = Math.max(...buckets.map((b) => b.sales), ...outflows, ...nets, 1);
    const minValue = Math.min(0, ...nets);

    const step = niceStep(toMajor(maxValue - minValue));
    const axisTop = Math.max(step * 2, Math.ceil(toMajor(maxValue) / step) * step);
    const axisBottom = minValue < 0 ? -Math.max(step, Math.ceil(toMajor(-minValue) / step) * step) : 0;
    const range = axisTop - axisBottom;

    const x = (index: number) =>
      PADDING.left + (buckets.length <= 1 ? innerWidth / 2 : (index / (buckets.length - 1)) * innerWidth);
    const y = (value: number) => PADDING.top + innerHeight - ((toMajor(value) - axisBottom) / range) * innerHeight;
    const barWidth = Math.min(32, (innerWidth / Math.max(buckets.length, 1)) * 0.5);

    return {
      x,
      y,
      axisTop,
      axisBottom,
      step,
      innerWidth,
      innerHeight,
      barWidth,
      points: buckets.map((b, index) => ({ ...b, cx: x(index), salesY: y(b.sales), netY: y(b.net ?? 0) })),
    };
  }, [buckets]);

  if (buckets.length === 0) {
    return <p className="p-8 text-center text-sm text-neutral-900/60">No activity in this window.</p>;
  }

  const hasCost = buckets.some((b) => b.net !== null);
  const salesPath = plot.points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.cx.toFixed(1)},${p.salesY.toFixed(1)}`)
    .join(' ');
  const salesAreaPath = `${salesPath} L${plot.points.at(-1)!.cx.toFixed(1)},${plot.y(0).toFixed(1)} L${plot.points[0]!.cx.toFixed(1)},${plot.y(0).toFixed(1)} Z`;
  const netPath = hasCost
    ? plot.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.cx.toFixed(1)},${p.netY.toFixed(1)}`).join(' ')
    : null;

  const ticks = [plot.axisBottom, 0, plot.step, plot.axisTop]
    .filter((v, i, all) => all.indexOf(v) === i && v <= plot.axisTop && v >= plot.axisBottom)
    .sort((a, b) => a - b);

  const lastIndex = plot.points.length - 1;

  return (
    <figure className="m-0">
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-neutral-900/70">
        <Legend color={SALES} label="Sales" />
        <Legend color={EXPENSES} label="Expenses" />
        <Legend color={PURCHASES} label="Purchases" />
        {hasCost ? <Legend color={NET} label="Net" dashed /> : null}
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Sales, purchases and expenses by ${bucket}`}
      >
        {ticks.map((tick) => {
          const ty = plot.y(tick * 100);
          return (
            <g key={tick}>
              <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={ty} y2={ty} stroke={GRID} strokeWidth={1} />
              <text x={PADDING.left - 8} y={ty + 4} textAnchor="end" className="fill-neutral-900/50" fontSize={11}>
                {compactRupees(tick)}
              </text>
            </g>
          );
        })}

        {/* Purchases + expenses, stacked — one bar of "money that left". */}
        {plot.points.map((p) => {
          const purchasesTop = plot.y(p.purchases);
          const baseline = plot.y(0);
          const expensesTop = plot.y(p.purchases + p.expenses);
          return (
            <g key={`bar-${p.t}`}>
              <rect
                x={p.cx - plot.barWidth / 2}
                y={purchasesTop}
                width={plot.barWidth}
                height={Math.max(baseline - purchasesTop, 0)}
                fill={PURCHASES}
              />
              <rect
                x={p.cx - plot.barWidth / 2}
                y={expensesTop}
                width={plot.barWidth}
                height={Math.max(purchasesTop - expensesTop, 0)}
                fill={EXPENSES}
              />
            </g>
          );
        })}

        <path d={salesAreaPath} fill={SALES} fillOpacity={0.12} />
        <path d={salesPath} fill="none" stroke={SALES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {netPath ? (
          <path
            d={netPath}
            fill="none"
            stroke={NET}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}

        {[0, Math.floor(lastIndex / 2), lastIndex]
          .filter((index, position, all) => all.indexOf(index) === position)
          .map((index) => (
            <text
              key={`label-${index}`}
              x={plot.x(index)}
              y={HEIGHT - 8}
              textAnchor={index === 0 ? 'start' : index === lastIndex ? 'end' : 'middle'}
              className="fill-neutral-900/50"
              fontSize={11}
            >
              {buckets[index]!.t}
            </text>
          ))}
      </svg>

      <figcaption className="mt-2 text-xs text-neutral-900/60">
        Latest {bucket}: {formatMoney(plot.points.at(-1)!.sales)} sales, {formatMoney(plot.points.at(-1)!.purchases)}{' '}
        purchases, {formatMoney(plot.points.at(-1)!.expenses)} expenses
        {hasCost && plot.points.at(-1)!.net !== null ? `, ${formatMoney(plot.points.at(-1)!.net!)} net` : ''}.
      </figcaption>
    </figure>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={dashed ? 'h-0 w-3 border-t-2 border-dashed' : 'h-2.5 w-2.5 rounded-full'}
        style={dashed ? { borderColor: color } : { backgroundColor: color }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

/** 1 / 2 / 5 × 10ⁿ, so axis ticks land on numbers people read easily. */
function niceStep(max: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(max, 1)));
  const normalised = max / magnitude;
  if (normalised <= 2) return magnitude / 2;
  if (normalised <= 5) return magnitude;
  return magnitude * 2;
}

function compactRupees(rupees: number): string {
  const sign = rupees < 0 ? '-' : '';
  const abs = Math.abs(rupees);
  if (abs >= 100_000) return `${sign}${(abs / 100_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${Math.round(abs)}`;
}
