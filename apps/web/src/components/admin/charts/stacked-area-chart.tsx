'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney, formatNumber } from '@newax/shared';
import { EmptyState } from '@/components/ui';
import { ChartDataTable } from './chart-data-table';
import { SeriesToggles, useSeriesVisibility, type SeriesDef } from './chart-series';
import { ChartTooltip } from './chart-tooltip';
import { GRID, INK, INK_FAINT, SURFACE, compactMoney, paletteColor, type ValueFormat } from './chart-theme';
import { usePrefersReducedMotion } from './use-reduced-motion';

export type StackedAreaSeries = Omit<SeriesDef, 'color'>;

/** More than five layers is a texture, not a chart; the sixth palette slot is reserved for "everything else". */
export const MAX_STACKED_SERIES = 6;

/**
 * A total over time and what it is made of: revenue by channel, tickets by
 * queue. The top edge of the stack is the total, so the one number a reader
 * wants first is also the outline of the whole shape, and each layer's thickness
 * is that part's share at that moment.
 *
 * Layers are solid, with a 2 px surface line between them as the gap (a wash would
 * let the layers blend into each other where they overlap the grid). Order is
 * fixed: the first series sits at the bottom and is the one that can be read
 * against the baseline, so put the steadiest part there. Only the bottom layer
 * can be compared precisely; the rest are read for shape. If the exact
 * comparison is the job, `CategoryBarChart` or `PeriodComparisonChart` is the
 * right form, and the table twin has every figure.
 *
 * The legend is also the filter: turning a layer off restacks the rest (their
 * colours stay, colour follows the entity) and the last layer cannot be turned
 * off. The tooltip reads top-down, in stack order, and ends with the total.
 */
export function StackedAreaChart({
  data,
  x,
  series,
  format = 'integer',
  formatX = (value) => value,
  height = 260,
}: {
  data: ReadonlyArray<Record<string, unknown>>;
  x: string;
  series: readonly StackedAreaSeries[];
  format?: ValueFormat;
  formatX?: (value: string) => string;
  height?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const layers = series.slice(0, MAX_STACKED_SERIES).map((s, index) => ({ ...s, color: paletteColor(index) }));
  const { isOn, toggle } = useSeriesVisibility(layers.map((s) => s.key));

  if (data.length === 0 || layers.length === 0) {
    return <EmptyState title="No data in this window." />;
  }

  const formatValue = (value: number) => (format === 'money' ? formatMoney(value) : formatNumber(value));
  const num = (row: Record<string, unknown>, key: string) => Number(row[key] ?? 0);
  const totalOf = (row: Record<string, unknown>) => layers.reduce((sum, s) => sum + num(row, s.key), 0);
  const peak = data.reduce((best, row, i) => (totalOf(row) > totalOf(data[best]!) ? i : best), 0);
  const ariaLabel = `${layers.map((s) => s.label).join(', ')} stacked across ${data.length} periods; the total peaks at ${formatValue(totalOf(data[peak]!))} in ${formatX(String(data[peak]![x] ?? ''))}`;

  return (
    <figure className="m-0 grid grid-cols-1 gap-3">
      {layers.length > 1 ? <SeriesToggles series={layers} isOn={isOn} onToggle={toggle} label="Layers" /> : null}

      <div role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data as Record<string, unknown>[]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey={x}
              tickFormatter={formatX}
              tick={{ fontSize: 11, fill: INK_FAINT }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              minTickGap={16}
            />
            <YAxis
              tickFormatter={(value: number) => (format === 'money' ? compactMoney(value) : formatNumber(value))}
              tick={{ fontSize: 11, fill: INK_FAINT }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              cursor={{ stroke: GRID }}
              content={(props) => {
                const row = props.payload?.[0]?.payload as Record<string, unknown> | undefined;
                if (!props.active || !row) return null;
                const visible = layers.filter((s) => isOn(s.key));
                const total = visible.reduce((sum, s) => sum + num(row, s.key), 0);
                return (
                  <ChartTooltip
                    active
                    label={formatX(String(props.label ?? ''))}
                    formatValue={formatValue}
                    payload={[
                      ...[...visible]
                        .reverse()
                        .map((s) => ({ dataKey: s.key, name: s.label, value: num(row, s.key), color: s.color })),
                      { dataKey: 'total', name: 'Total', value: total, color: INK },
                    ]}
                  />
                );
              }}
            />
            {layers
              .filter((s) => isOn(s.key))
              .map((s) => (
                <Area
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stackId="stack"
                  type="monotone"
                  stroke={SURFACE}
                  strokeWidth={2}
                  fill={s.color}
                  fillOpacity={1}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={!reduced}
                />
              ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <ChartDataTable
        caption={ariaLabel}
        columns={[x, ...layers.map((s) => s.label), 'Total']}
        rows={data.map((row) => [
          formatX(String(row[x] ?? '')),
          ...layers.map((s) => formatValue(num(row, s.key))),
          formatValue(totalOf(row)),
        ])}
      />
    </figure>
  );
}
