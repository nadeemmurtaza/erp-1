'use client';

import type { ReactNode } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, type TooltipValueType } from 'recharts';
import { formatMoney, formatNumber } from '@newax/shared';
import { EmptyState } from '@/components/ui';
import { ChartDataTable } from './chart-data-table';
import { GRID, INK, paletteColor, type ValueFormat } from './chart-theme';

export interface ShareItem {
  label: string;
  value: number;
}

const OTHER_LABEL = 'Other';
const OTHER_COLOR = INK;

/**
 * A categorical share of a whole — `donut-chart.tsx`'s replacement (WO-E.2).
 * Only the top `maxSlices` are drawn; the rest fold into one "Other" slice
 * so a long tail can't crowd the ring or the legend.
 */
export function ShareChart({
  items,
  format = 'integer',
  maxSlices = 5,
}: {
  items: readonly ShareItem[];
  format?: ValueFormat;
  maxSlices?: number;
}) {
  if (items.length === 0) {
    return <EmptyState title="No data in this window." />;
  }

  const sorted = [...items].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, maxSlices);
  const rest = sorted.slice(maxSlices);
  const otherTotal = rest.reduce((sum, item) => sum + item.value, 0);
  const slices = otherTotal > 0 ? [...top, { label: OTHER_LABEL, value: otherTotal }] : top;
  const total = slices.reduce((sum, item) => sum + item.value, 0);

  const formatValue = (value: number) => (format === 'money' ? formatMoney(value) : formatNumber(value));
  const ariaLabel = `Share of ${formatValue(total)} across ${slices.length} categories`;

  return (
    <figure className="m-0 flex flex-col items-center gap-4 sm:flex-row" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width={140} height={140}>
        <PieChart>
          <Pie
            data={slices as ShareItem[]}
            dataKey="value"
            nameKey="label"
            innerRadius={42}
            outerRadius={62}
            stroke={GRID}
            strokeWidth={1}
          >
            {slices.map((slice, index) => (
              <Cell key={slice.label} fill={slice.label === OTHER_LABEL ? OTHER_COLOR : paletteColor(index)} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ border: `1px solid ${GRID}`, borderRadius: 4, fontSize: 12 }}
            formatter={(value: TooltipValueType | undefined, name: ReactNode) =>
              [formatValue(Number(value ?? 0)), name] as [string, ReactNode]
            }
          />
        </PieChart>
      </ResponsiveContainer>

      <ul className="w-full min-w-0 flex-1 divide-y divide-neutral-100 text-sm" aria-hidden="true">
        {slices.map((slice, index) => (
          <li key={slice.label} className="flex items-center justify-between gap-3 py-1.5">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: slice.label === OTHER_LABEL ? OTHER_COLOR : paletteColor(index) }}
              />
              <span className="truncate text-neutral-900">{slice.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-neutral-900/60">{formatValue(slice.value)}</span>
          </li>
        ))}
      </ul>

      <ChartDataTable
        caption={ariaLabel}
        columns={['Category', 'Value']}
        rows={slices.map((slice) => [slice.label, formatValue(slice.value)])}
      />
    </figure>
  );
}
