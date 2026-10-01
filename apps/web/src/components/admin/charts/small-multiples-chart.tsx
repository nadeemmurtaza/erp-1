'use client';

import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney, formatNumber } from '@newax/shared';
import { EmptyState } from '@/components/ui';
import { ChartDataTable } from './chart-data-table';
import { niceCeil } from './chart-math';
import { SeriesToggles, ViewSwitch, useSeriesVisibility, type SeriesDef } from './chart-series';
import { ChartTooltip } from './chart-tooltip';
import { GRID, INK_FAINT, compactMoney, paletteColor, type ValueFormat } from './chart-theme';
import { usePrefersReducedMotion } from './use-reduced-motion';

export type SmallMultiplesSeries = Omit<SeriesDef, 'color'>;

/** Five panels already ask the eye to compare five things; a sixth series is a table. */
export const MAX_MULTIPLES = 5;

type View = 'multiples' | 'overlay';

/**
 * The same measure for several things over the same time: sales by office, load
 * by warehouse. Two views of one dataset, because each answers a different
 * question.
 *
 * - **Side by side** (the default) is one small chart per thing, each with its own
 *   name, total and peak above it. Nothing overlaps, every chart is labelled
 *   directly (so no colour has to be decoded), and a reader sees each shape on
 *   its own. The panels share one scale, 0 to the next round number above the
 *   largest value anywhere, printed on both ends of every panel's axis, because
 *   a small multiple on its own scale lies: a quiet office would look as busy as
 *   the biggest. The panels reflow with the width (`auto-fit`, 16 rem minimum), so
 *   a 280 px screen gets one column and a wide one gets as many as fit.
 * - **Overlaid** puts every line on one plot, which is the view for "where did
 *   they cross". The legend is the filter. There are no end-of-line labels here
 *   on purpose: lines that end close together are the reason to overlay, and
 *   their labels would sit on top of each other. The side-by-side view is the
 *   directly labelled one.
 *
 * Money charts receive paisa. Every figure is in the table twin.
 */
export function SmallMultiplesChart({
  data,
  x,
  series,
  format = 'integer',
  formatX = (value) => value,
  panelHeight = 120,
  overlayHeight = 260,
}: {
  data: ReadonlyArray<Record<string, unknown>>;
  x: string;
  series: readonly SmallMultiplesSeries[];
  format?: ValueFormat;
  formatX?: (value: string) => string;
  panelHeight?: number;
  overlayHeight?: number;
}) {
  const [view, setView] = useState<View>('multiples');
  const reduced = usePrefersReducedMotion();
  const entities = series.slice(0, MAX_MULTIPLES).map((s, index) => ({ ...s, color: paletteColor(index) }));
  const { isOn, toggle } = useSeriesVisibility(entities.map((s) => s.key));

  if (data.length === 0 || entities.length === 0) {
    return <EmptyState title="No data in this window." />;
  }

  const num = (row: Record<string, unknown>, key: string) => Number(row[key] ?? 0);
  // Recharts renders the tooltip with an empty label while nothing is pointed at; a date formatter must not see it.
  const labelOf = (label: unknown) => (label == null || label === '' ? '' : formatX(String(label)));
  const formatValue = (value: number) => (format === 'money' ? formatMoney(value) : formatNumber(value));
  const formatTick = (value: number) => (format === 'money' ? compactMoney(value) : formatNumber(value));
  const top = niceCeil(Math.max(...data.flatMap((row) => entities.map((s) => num(row, s.key)))));
  const ariaLabel = `${entities.map((s) => s.label).join(', ')} over ${data.length} periods, on one scale from 0 to ${formatValue(top)}`;

  const axes = (
    <>
      <CartesianGrid stroke={GRID} vertical={false} />
      <XAxis
        dataKey={x}
        tickFormatter={formatX}
        tick={{ fontSize: 11, fill: INK_FAINT }}
        tickLine={false}
        axisLine={{ stroke: GRID }}
        interval="preserveStartEnd"
        minTickGap={24}
      />
      <YAxis
        domain={[0, top]}
        ticks={[0, top]}
        tickFormatter={formatTick}
        tick={{ fontSize: 11, fill: INK_FAINT }}
        tickLine={false}
        axisLine={false}
        width={44}
      />
    </>
  );

  return (
    <figure className="m-0 grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {view === 'overlay' ? (
          <SeriesToggles series={entities} isOn={isOn} onToggle={toggle} label="Compared" />
        ) : (
          <p className="m-0 text-sm text-neutral-900/70">Every chart uses the same scale: 0 to {formatValue(top)}.</p>
        )}
        {entities.length > 1 ? (
          <ViewSwitch
            label="Layout"
            value={view}
            onChange={setView}
            options={[
              { value: 'multiples', label: 'Side by side' },
              { value: 'overlay', label: 'Overlaid' },
            ]}
          />
        ) : null}
      </div>

      {view === 'multiples' ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-4">
          {entities.map((s) => {
            const total = data.reduce((sum, row) => sum + num(row, s.key), 0);
            const peak = data.reduce((best, row) => (num(row, s.key) > num(best, s.key) ? row : best), data[0]!);
            const summary = `${s.label}: ${formatValue(total)} in total, peaking at ${formatValue(num(peak, s.key))} in ${formatX(String(peak[x] ?? ''))}`;
            return (
              <section key={s.key} aria-label={s.label} className="min-w-0 rounded-md bg-neutral-50 p-4">
                <p className="m-0 flex items-center gap-2 text-sm text-neutral-900/70">
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="shrink-0">
                    <rect width="10" height="10" rx="2" fill={s.color} />
                  </svg>
                  <span className="truncate">{s.label}</span>
                </p>
                <p className="m-0 text-2xl font-semibold tabular-nums text-neutral-900">{formatValue(total)}</p>
                <p className="m-0 mb-2 text-xs text-neutral-900/70">
                  Peak {formatValue(num(peak, s.key))} in {formatX(String(peak[x] ?? ''))}
                </p>
                <div role="img" aria-label={summary}>
                  <ResponsiveContainer width="100%" height={panelHeight}>
                    <AreaChart
                      data={data as Record<string, unknown>[]}
                      margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                    >
                      {axes}
                      <Tooltip
                        cursor={{ stroke: GRID }}
                        content={(props) => (
                          <ChartTooltip
                            active={props.active}
                            payload={props.payload}
                            label={labelOf(props.label)}
                            formatValue={formatValue}
                          />
                        )}
                      />
                      <Area
                        dataKey={s.key}
                        name={s.label}
                        type="monotone"
                        stroke={s.color}
                        strokeWidth={2}
                        fill={s.color}
                        fillOpacity={0.1}
                        dot={false}
                        activeDot={{ r: 4, stroke: 'none' }}
                        isAnimationActive={!reduced}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div role="img" aria-label={ariaLabel}>
          <ResponsiveContainer width="100%" height={overlayHeight}>
            <LineChart data={data as Record<string, unknown>[]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              {axes}
              <Tooltip
                cursor={{ stroke: GRID }}
                content={(props) => (
                  <ChartTooltip
                    active={props.active}
                    payload={props.payload}
                    label={labelOf(props.label)}
                    formatValue={formatValue}
                  />
                )}
              />
              {entities
                .filter((s) => isOn(s.key))
                .map((s) => (
                  <Line
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    type="monotone"
                    stroke={s.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, stroke: 'none' }}
                    isAnimationActive={!reduced}
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <ChartDataTable
        caption={ariaLabel}
        columns={[x, ...entities.map((s) => s.label)]}
        rows={data.map((row) => [formatX(String(row[x] ?? '')), ...entities.map((s) => formatValue(num(row, s.key)))])}
      />
    </figure>
  );
}
