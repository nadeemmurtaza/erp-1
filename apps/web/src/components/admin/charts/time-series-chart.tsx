'use client';

import type { ReactNode } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipValueType,
} from 'recharts';
import { formatDateShort, formatMoney, formatNumber } from '@newax/shared';
import { EmptyState } from '@/components/ui';
import { ChartDataTable } from './chart-data-table';
import { usePrefersReducedMotion } from './use-reduced-motion';
import { GRID, INK_FAINT, compactMoney, dashFor, markerFor, paletteColor, type ValueFormat } from './chart-theme';
import { ChartMarker } from './chart-marker';

export interface TimeSeriesSeriesDef {
  key: string;
  label: string;
  format: ValueFormat;
}

/**
 * One or several series over time — line, or line-and-area for a single
 * series (matching `sales-chart.tsx`'s look, which this retires in WO-E.2).
 */
export function TimeSeriesChart({
  data,
  x,
  series,
  height = 260,
  chart = 'line',
  ariaLabel,
}: {
  data: ReadonlyArray<Record<string, unknown>>;
  x: string;
  series: readonly TimeSeriesSeriesDef[];
  height?: number;
  chart?: 'line' | 'area';
  ariaLabel: string;
}) {
  const reduced = usePrefersReducedMotion();

  if (data.length === 0) {
    return <EmptyState title="No data in this window." />;
  }

  const formatValue = (format: ValueFormat, value: number) =>
    format === 'money' ? formatMoney(value) : format === 'percent' ? `${value}%` : formatNumber(value);

  const Chart = chart === 'area' && series.length === 1 ? AreaChart : LineChart;

  return (
    <figure className="m-0" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={height}>
        <Chart data={data as Record<string, unknown>[]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey={x}
            tickFormatter={(value: string) => formatDateShort(value)}
            tick={{ fontSize: 11, fill: INK_FAINT }}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(value: number) =>
              series[0]?.format === 'money' ? compactMoney(value) : formatNumber(value)
            }
            tick={{ fontSize: 11, fill: INK_FAINT }}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip
            contentStyle={{ border: `1px solid ${GRID}`, borderRadius: 4, fontSize: 12 }}
            labelFormatter={(label: ReactNode) => formatDateShort(String(label), 'en', { withWeekday: true })}
            formatter={(value: TooltipValueType | undefined, name: ReactNode) => {
              const numeric = Number(value ?? 0);
              const def = series.find((s) => s.label === name);
              const formatted = def ? formatValue(def.format, numeric) : formatNumber(numeric);
              return [formatted, name] as [string, ReactNode];
            }}
          />
          {series.map((s, index) =>
            chart === 'area' && series.length === 1 ? (
              <Area
                key={s.key}
                dataKey={s.key}
                name={s.label}
                type="monotone"
                stroke={paletteColor(index)}
                strokeWidth={2}
                fill={paletteColor(index)}
                fillOpacity={0.1}
                dot={false}
                activeDot={{ r: 5 }}
                isAnimationActive={!reduced}
              />
            ) : (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.label}
                type="monotone"
                stroke={paletteColor(index)}
                strokeWidth={2}
                strokeDasharray={dashFor(index)}
                dot={(props: { cx?: number; cy?: number; index?: number }) => (
                  <ChartMarker
                    key={`${s.key}-${props.index}`}
                    cx={props.cx ?? 0}
                    cy={props.cy ?? 0}
                    shape={markerFor(index)}
                    color={paletteColor(index)}
                  />
                )}
                activeDot={{ r: 5 }}
                isAnimationActive={!reduced}
              />
            ),
          )}
        </Chart>
      </ResponsiveContainer>

      <figcaption className="sr-only">{ariaLabel}</figcaption>
      <ChartDataTable
        caption={ariaLabel}
        columns={[x, ...series.map((s) => s.label)]}
        rows={data.map((row) => [
          String(row[x] ?? ''),
          ...series.map((s) => formatValue(s.format, Number(row[s.key] ?? 0))),
        ])}
      />
      {series.length > 1 ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-900/60" aria-hidden="true">
          {series.map((s, index) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ backgroundColor: paletteColor(index) }} />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
    </figure>
  );
}
