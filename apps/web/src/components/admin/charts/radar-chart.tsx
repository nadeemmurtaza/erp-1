'use client';

import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart as RechartsRadar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatNumber } from '@newax/shared';
import { EmptyState } from '@/components/ui';
import { ChartDataTable } from './chart-data-table';
import { niceCeil } from './chart-math';
import { SeriesToggles, ViewSwitch, useSeriesVisibility, type SeriesDef } from './chart-series';
import { ChartTooltip } from './chart-tooltip';
import { GRID, HOVER_WASH, INK_FAINT, INK_SOFT, paletteColor } from './chart-theme';
import { usePrefersReducedMotion } from './use-reduced-motion';

export type RadarSeries = Omit<SeriesDef, 'color'>;

/** Fewer than five axes is a triangle or a kite, more than seven is a hairball; both read worse than bars. */
export const MIN_RADAR_AXES = 5;
export const MAX_RADAR_AXES = 7;
/**
 * Axis names are drawn outside the polygon, so a long one runs off a narrow card. On a 280 px screen the
 * polygon leaves about 58 px beside it, and eight characters at 11 px is about 48 px, so names are cut at
 * eight here and written in full in the table twin.
 */
export const MAX_AXIS_NAME = 8;
/** More than three overlapping polygons hide each other, so a fourth series goes to a second chart. */
export const MAX_RADAR_SERIES = 3;

type View = 'shape' | 'compare';

/**
 * A profile across five to seven measures, scored on one shared scale: a
 * client's health, a supplier's scorecard, a branch against the chain average.
 * The radar is for the shape, which axis is the weak one and whether two things
 * are alike; it is not for reading a value, because area and angle are the two
 * encodings people judge worst.
 *
 * So the same data has a second view, "Compare", as grouped columns on the same
 * 0-to-max scale, capped at 24 px wide with a 4 px rounded top and a 2 px gap
 * between a group's bars. The switch is a segmented control, the legend is the
 * filter in both views, and the table twin carries every figure. Outside five to
 * seven axes, or with more than one scale, the radar is the wrong form and the
 * chart says so by offering only the bars.
 *
 * The scale is fixed by `max` (a score out of 100) so two radars side by side
 * can be compared by eye; without it the ceiling is the next round number above
 * the largest value.
 */
export function RadarChart({
  data,
  series,
  axis = 'axis',
  max,
  height = 280,
}: {
  data: ReadonlyArray<Record<string, unknown>>;
  series: readonly RadarSeries[];
  /** The key holding each row's axis name. */
  axis?: string;
  /** The top of the shared scale, if it is a fixed one such as a score out of 100. */
  max?: number;
  height?: number;
}) {
  const [view, setView] = useState<View>('shape');
  const reduced = usePrefersReducedMotion();
  const layers = series.slice(0, MAX_RADAR_SERIES).map((s, index) => ({ ...s, color: paletteColor(index) }));
  const { isOn, toggle } = useSeriesVisibility(layers.map((s) => s.key));

  if (data.length === 0 || layers.length === 0) {
    return <EmptyState title="No data in this window." />;
  }

  const num = (row: Record<string, unknown>, key: string) => Number(row[key] ?? 0);
  const top = max ?? niceCeil(Math.max(...data.flatMap((row) => layers.map((s) => num(row, s.key)))));
  const formatValue = (value: number) => formatNumber(value);
  const radarFits = data.length >= MIN_RADAR_AXES && data.length <= MAX_RADAR_AXES;
  const current: View = radarFits ? view : 'compare';
  const visible = layers.filter((s) => isOn(s.key));
  const ariaLabel = `${layers.map((s) => s.label).join(' and ')} across ${data.length} measures, scored out of ${formatValue(top)}`;

  return (
    <figure className="m-0 grid grid-cols-1 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {layers.length > 1 ? (
          <SeriesToggles series={layers} isOn={isOn} onToggle={toggle} label="Compared" />
        ) : (
          <span />
        )}
        {radarFits ? (
          <ViewSwitch
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: 'shape', label: 'Shape' },
              { value: 'compare', label: 'Compare' },
            ]}
          />
        ) : null}
      </div>

      <div role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height={height}>
          {current === 'shape' ? (
            <RechartsRadar
              data={data as Record<string, unknown>[]}
              outerRadius="72%"
              margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <PolarGrid stroke={GRID} />
              <PolarAngleAxis
                dataKey={axis}
                tickFormatter={(name: string) =>
                  name.length > MAX_AXIS_NAME ? `${name.slice(0, MAX_AXIS_NAME - 1)}…` : name
                }
                tick={{ fontSize: 11, fill: INK_SOFT }}
              />
              <PolarRadiusAxis
                angle={60}
                domain={[0, top]}
                tickCount={3}
                tick={{ fontSize: 10, fill: INK_FAINT }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={(props) => (
                  <ChartTooltip
                    active={props.active}
                    payload={props.payload}
                    label={props.label}
                    formatValue={formatValue}
                  />
                )}
              />
              {visible.map((s) => (
                <Radar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  fill={s.color}
                  fillOpacity={0.12}
                  dot={{ r: 3, fill: s.color, stroke: 'none' }}
                  isAnimationActive={!reduced}
                />
              ))}
            </RechartsRadar>
          ) : (
            <BarChart
              data={data as Record<string, unknown>[]}
              barGap={2}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey={axis}
                tick={{ fontSize: 11, fill: INK_FAINT }}
                tickLine={false}
                axisLine={{ stroke: GRID }}
                interval={0}
              />
              <YAxis
                domain={[0, top]}
                tick={{ fontSize: 11, fill: INK_FAINT }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip
                cursor={{ fill: HOVER_WASH }}
                content={(props) => (
                  <ChartTooltip
                    active={props.active}
                    payload={props.payload}
                    label={props.label}
                    formatValue={formatValue}
                  />
                )}
              />
              {visible.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color}
                  maxBarSize={24}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={!reduced}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      <ChartDataTable
        caption={ariaLabel}
        columns={['Measure', ...layers.map((s) => s.label)]}
        rows={data.map((row) => [String(row[axis] ?? ''), ...layers.map((s) => formatValue(num(row, s.key)))])}
      />
    </figure>
  );
}
