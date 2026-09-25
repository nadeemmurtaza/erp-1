'use client';

import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { formatNumber } from '@newax/shared';
import { ChartDataTable } from './chart-data-table';
import { paletteColor } from './chart-theme';

/**
 * The small trend line inside a dashboard card (D1's `sparkline` field). No
 * axis, no grid, no tooltip — decoration-scale, not a report — but still
 * `role="img"` with a real label and a screen-reader table, same as every
 * other wrapper (WO-A.2's rule applies uniformly).
 */
export function SparklineChart({
  values,
  label,
  tone = 'neutral',
}: {
  values: readonly number[];
  label: string;
  tone?: 'up-good' | 'up-bad' | 'neutral';
}) {
  if (values.length < 2) return null;

  const color = tone === 'up-bad' ? paletteColor(3) : tone === 'up-good' ? paletteColor(4) : paletteColor(0);
  const data = values.map((v, i) => ({ i, v }));

  return (
    <figure className="m-0 h-8 w-full" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line dataKey="v" type="monotone" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <ChartDataTable caption={label} columns={['Point', 'Value']} rows={values.map((v, i) => [i + 1, formatNumber(v)])} />
    </figure>
  );
}
