'use client';

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney, formatNumber } from '@newax/shared';
import { EmptyState } from '@/components/ui';
import { ChartDataTable } from './chart-data-table';
import { ChartTooltip } from './chart-tooltip';
import { GRID, HOVER_WASH, INK, INK_FAINT, SURFACE, compactMoney, paletteColor, type ValueFormat } from './chart-theme';
import { usePrefersReducedMotion } from './use-reduced-motion';

export interface RangePoint {
  label: string;
  min: number;
  max: number;
  avg: number;
}

/**
 * The spread of a measure inside each period: the fastest and slowest deployment
 * in a week, the cheapest and dearest basket, with the average marked on it. A
 * candlestick without the finance: the capsule runs from the lowest to the
 * highest reading and the ringed dot is the average, so a week with the same
 * average but a wider spread reads as a taller capsule.
 *
 * Marks follow `marks-and-anatomy.md`: the capsule is capped at 14 px with a 4 px
 * rounded end, the average dot is 8 px with a 2 px surface ring so it survives
 * sitting on the capsule, one hue, hairline grid. Two things are plotted, so a
 * key is always present. The tooltip names highest, average and lowest with the
 * values leading; the table twin adds the spread.
 */
export function RangeChart({
  points,
  format = 'integer',
  unit,
  height = 240,
}: {
  points: readonly RangePoint[];
  format?: ValueFormat;
  /** Shown after each figure for a measure that is not money or a count: "h", "days". */
  unit?: string;
  height?: number;
}) {
  const reduced = usePrefersReducedMotion();

  if (points.length === 0) {
    return <EmptyState title="No data in this window." />;
  }

  const formatValue = (value: number) =>
    (format === 'money' ? formatMoney(value) : formatNumber(value)) + (unit ? ` ${unit}` : '');
  const data = points.map((p) => ({ ...p, band: [p.min, p.max] as [number, number] }));
  const widest = points.reduce((best, p) => (p.max - p.min > best.max - best.min ? p : best), points[0]!);
  const ariaLabel = `Range per period across ${points.length} periods; the widest spread is ${widest.label}, ${formatValue(widest.min)} to ${formatValue(widest.max)}`;

  return (
    <figure className="m-0 grid grid-cols-1 gap-3">
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-neutral-900/70">
        <li className="flex items-center gap-2">
          <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">
            <rect width="10" height="16" rx="4" fill={paletteColor(0)} />
          </svg>
          Lowest to highest
        </li>
        <li className="flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <circle cx="6" cy="6" r="4" fill={SURFACE} stroke={INK} strokeWidth="2" />
          </svg>
          Average
        </li>
      </ul>

      <div role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: INK_FAINT }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
            />
            <YAxis
              tickFormatter={(value: number) => (format === 'money' ? compactMoney(value) : formatNumber(value))}
              tick={{ fontSize: 11, fill: INK_FAINT }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              cursor={{ fill: HOVER_WASH }}
              content={(props) => {
                const row = props.payload?.[0]?.payload as RangePoint | undefined;
                if (!props.active || !row) return null;
                return (
                  <ChartTooltip
                    active
                    label={props.label}
                    formatValue={formatValue}
                    payload={[
                      { dataKey: 'max', name: 'Highest', value: row.max, color: paletteColor(0) },
                      { dataKey: 'avg', name: 'Average', value: row.avg, color: INK },
                      { dataKey: 'min', name: 'Lowest', value: row.min, color: paletteColor(0) },
                    ]}
                  />
                );
              }}
            />
            <Bar
              dataKey="band"
              name="Range"
              fill={paletteColor(0)}
              maxBarSize={14}
              radius={4}
              isAnimationActive={!reduced}
            />
            <Line
              dataKey="avg"
              name="Average"
              stroke="none"
              isAnimationActive={false}
              activeDot={false}
              dot={(props: { cx?: number; cy?: number; index?: number }) => (
                <circle
                  key={`avg-${props.index}`}
                  cx={props.cx}
                  cy={props.cy}
                  r={4}
                  fill={SURFACE}
                  stroke={INK}
                  strokeWidth={2}
                />
              )}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ChartDataTable
        caption={ariaLabel}
        columns={['Period', 'Lowest', 'Average', 'Highest', 'Spread']}
        rows={points.map((p) => [
          p.label,
          formatValue(p.min),
          formatValue(p.avg),
          formatValue(p.max),
          formatValue(p.max - p.min),
        ])}
      />
    </figure>
  );
}
