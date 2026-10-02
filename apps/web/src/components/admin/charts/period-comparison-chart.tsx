'use client';

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney, formatNumber } from '@newax/shared';
import { Badge, DataTable, EmptyState } from '@/components/ui';
import { ChartDataTable } from './chart-data-table';
import { changeTone, periodChange } from './chart-math';
import { SeriesToggles, useSeriesVisibility, type SeriesDef } from './chart-series';
import { chartCursor, chartDrawProps, chartTooltipMotion } from './chart-motion';
import { ChartTooltip } from './chart-tooltip';
import { CONTEXT, GRID, INK_FAINT, compactMoney, paletteColor, type ValueFormat } from './chart-theme';
import { usePrefersReducedMotion } from './use-reduced-motion';

export interface PeriodComparisonPoint {
  label: string;
  current: number;
  previous: number;
}

const SERIES_KEYS = ['current', 'previous'] as const;

const MINUS = '−';

/**
 * This period against the last, per category: a grouped bar, the legend that
 * filters it, and the table that says the same thing in numbers.
 *
 * Form (dataviz `choosing-a-form.md`): the current period is the point and the
 * previous one is context, so it is the emphasis form: one hue and a gray, not
 * two categorical slots. Marks follow `marks-and-anatomy.md`: bars at most 24 px
 * thick, a 4 px rounded data-end and a square base, a 2 px gap between the pair,
 * a hairline solid grid, no number on every bar. The legend is always present
 * for two series, and it is also the filter: pressing a series isolates the other
 * (color follows the entity, so the survivor keeps its colour). The last visible
 * series cannot be hidden, because an empty chart is not a filter result.
 *
 * Direction is never colour alone: the change column carries a sign and an arrow
 * as well as a tone. `upIsGood` says which way is the good one (a falling return
 * rate is an improvement), and only the tone depends on it.
 */
export function PeriodComparisonChart({
  points,
  format = 'money',
  currentLabel = 'Current period',
  previousLabel = 'Previous period',
  categoryLabel = 'Category',
  upIsGood = true,
  showTable = true,
  height = 240,
}: {
  points: readonly PeriodComparisonPoint[];
  format?: ValueFormat;
  currentLabel?: string;
  previousLabel?: string;
  /** The first column's heading in the table — "Region", "Branch". */
  categoryLabel?: string;
  upIsGood?: boolean;
  /** The change table under the chart. Off when the screen already has its own table of these rows. */
  showTable?: boolean;
  height?: number;
}) {
  const { isOn, toggle } = useSeriesVisibility(SERIES_KEYS);
  const reduced = usePrefersReducedMotion();

  if (points.length === 0) {
    return <EmptyState title="No data in this window." />;
  }

  const formatValue = (value: number) => (format === 'money' ? formatMoney(value) : formatNumber(value));
  const series: SeriesDef[] = [
    { key: 'current', label: currentLabel, color: paletteColor(0) },
    { key: 'previous', label: previousLabel, color: CONTEXT },
  ];

  const ariaLabel = `${currentLabel} against ${previousLabel} across ${points.length} categories`;

  return (
    <div className="grid gap-4">
      <SeriesToggles series={series} isOn={isOn} onToggle={toggle} />

      <div role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={points as PeriodComparisonPoint[]}
            barGap={2}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
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
              {...chartTooltipMotion(reduced)}
              cursor={chartCursor.band}
              content={(props) => (
                <ChartTooltip
                  active={props.active}
                  payload={props.payload}
                  label={props.label}
                  formatValue={formatValue}
                />
              )}
            />
            {series
              .filter((s) => isOn(s.key))
              .map((s, index) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                  {...chartDrawProps(reduced, index)}
                />
              ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {showTable ? (
        <DataTable
          rows={[...points]}
          rowKey={(point) => point.label}
          columns={[
            { header: categoryLabel, cell: (point) => point.label },
            {
              header: currentLabel,
              align: 'end',
              numeric: true,
              cell: (point) => formatValue(point.current),
            },
            {
              header: previousLabel,
              align: 'end',
              numeric: true,
              muted: true,
              cell: (point) => formatValue(point.previous),
            },
            {
              header: 'Change',
              align: 'end',
              numeric: true,
              cell: (point) => {
                const diff = point.current - point.previous;
                return `${diff > 0 ? '+' : diff < 0 ? MINUS : ''}${formatValue(Math.abs(diff))}`;
              },
            },
            {
              header: 'Growth',
              align: 'end',
              cell: (point) => <Growth point={point} upIsGood={upIsGood} />,
            },
          ]}
        />
      ) : (
        <ChartDataTable
          caption={ariaLabel}
          columns={[categoryLabel, currentLabel, previousLabel]}
          rows={points.map((p) => [p.label, formatValue(p.current), formatValue(p.previous)])}
        />
      )}
    </div>
  );
}

function Growth({ point, upIsGood }: { point: PeriodComparisonPoint; upIsGood: boolean }) {
  const { kind, pct } = periodChange(point.current, point.previous);
  if (kind === 'new') return <span className="text-neutral-900/60">New</span>;

  const Icon = kind === 'up' ? ArrowUpRight : kind === 'down' ? ArrowDownRight : Minus;

  return (
    <Badge tone={changeTone(kind, upIsGood)} className="tabular-nums">
      <Icon aria-hidden="true" className="h-3 w-3" />
      {kind === 'up' ? '+' : kind === 'down' ? MINUS : ''}
      {formatNumber(pct)}%
    </Badge>
  );
}
