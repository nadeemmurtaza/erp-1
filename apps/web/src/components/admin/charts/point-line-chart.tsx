'use client';

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney, formatNumber } from '@newax/shared';
import { EmptyState } from '@/components/ui';
import { ChartDataTable } from './chart-data-table';
import { ChartMarker } from './chart-marker';
import { ChartTooltip } from './chart-tooltip';
import { GRID, INK, INK_FAINT, INK_SOFT, compactMoney, paletteColor, type ValueFormat } from './chart-theme';
import { usePrefersReducedMotion } from './use-reduced-motion';

export interface PointLinePoint {
  label: string;
  value: number;
}

/**
 * A volatile series where the individual readings matter more than the trend: the
 * errors a workflow threw each day, the alerts a rule raised. The line is straight
 * between points (smoothing would invent values nobody measured), every reading
 * is an 8 px marker with a surface ring, and the eye is led to the one that
 * matters by two things only: the peak carries its value, and any reading above
 * the alert level is a diamond instead of a circle. The shape change is the
 * second channel, so "above the line" never relies on colour.
 *
 * The alert level is a dashed rule because it is a threshold, not a grid line
 * (dashing a grid is noise; dashing a limit says "this is not data"). It carries
 * its own name at the end of the rule.
 *
 * Arrow keys walk the points and show the same readout a pointer does (Recharts'
 * accessibility layer), and the table twin lists every reading with whether it
 * was above the level.
 */
export function PointLineChart({
  points,
  format = 'integer',
  alert,
  valueLabel = 'Value',
  height = 220,
}: {
  points: readonly PointLinePoint[];
  format?: ValueFormat;
  /** A level worth reacting to, drawn as a rule and used to mark readings above it. */
  alert?: { value: number; label: string };
  valueLabel?: string;
  height?: number;
}) {
  const reduced = usePrefersReducedMotion();

  if (points.length === 0) {
    return <EmptyState title="No data in this window." />;
  }

  const formatValue = (value: number) => (format === 'money' ? formatMoney(value) : formatNumber(value));
  const peak = points.reduce((best, p, i) => (p.value > points[best]!.value ? i : best), 0);
  const above = (value: number) => alert != null && value > alert.value;
  const ariaLabel = `${valueLabel} across ${points.length} readings, highest ${formatValue(points[peak]!.value)} on ${points[peak]!.label}`;

  return (
    <figure className="m-0">
      <div role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={points as PointLinePoint[]} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="label"
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
              width={44}
            />
            {alert ? (
              <ReferenceLine
                y={alert.value}
                stroke={INK_SOFT}
                strokeDasharray="4 4"
                label={{ value: alert.label, position: 'insideTopLeft', fontSize: 11, fill: INK_SOFT }}
              />
            ) : null}
            <Tooltip
              cursor={{ stroke: GRID }}
              content={(props) => (
                <ChartTooltip
                  active={props.active}
                  payload={props.payload}
                  label={props.label}
                  formatValue={formatValue}
                />
              )}
            />
            <Line
              dataKey="value"
              name={valueLabel}
              type="linear"
              stroke={paletteColor(0)}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              isAnimationActive={!reduced}
              activeDot={{ r: 6, stroke: INK, strokeWidth: 2 }}
              dot={(props: { cx?: number; cy?: number; index?: number; payload?: PointLinePoint }) => {
                const { cx = 0, cy = 0, index = 0, payload } = props;
                const hot = payload != null && above(payload.value);
                return (
                  <g key={`dot-${index}`}>
                    <ChartMarker
                      cx={cx}
                      cy={cy}
                      shape={hot ? 'diamond' : 'circle'}
                      color={paletteColor(0)}
                      size={hot ? 5 : 4}
                    />
                    {index === peak ? (
                      <text x={cx} y={cy - 12} textAnchor="middle" fontSize={12} fontWeight={600} fill={INK}>
                        {formatValue(payload?.value ?? 0)}
                      </text>
                    ) : null}
                  </g>
                );
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartDataTable
        caption={ariaLabel}
        columns={['Reading', valueLabel, ...(alert ? ['Against ' + alert.label] : [])]}
        rows={points.map((p) => [
          p.label,
          formatValue(p.value),
          ...(alert ? [above(p.value) ? 'Above' : 'Within'] : []),
        ])}
      />
    </figure>
  );
}
