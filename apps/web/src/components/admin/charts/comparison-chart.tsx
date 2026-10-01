'use client';

import type { ReactNode } from 'react';
import { Bar, ComposedChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipValueType } from 'recharts';
import { formatDateShort, formatMoney } from '@newax/shared';
import { EmptyState } from '@/components/ui';
import { ChartDataTable } from './chart-data-table';
import { usePrefersReducedMotion } from './use-reduced-motion';
import { GRID, INK, INK_FAINT, compactMoney, paletteColor } from './chart-theme';

export interface ComparisonBucketPoint {
  t: string;
  sales: number;
  purchases: number;
  expenses: number;
  grossProfit: number | null;
  net: number | null;
}

/**
 * WO-B.5's own headline chart, and the dashboard's empty comparison slot
 * (WO-A.4). Purchases and expenses stack — together they are "money that
 * left" — with sales as a line overlay, and net (when the caller holds
 * `inventory.view_cost`) a third line.
 */
export function ComparisonChart({ buckets }: { buckets: readonly ComparisonBucketPoint[] }) {
  const reduced = usePrefersReducedMotion();

  if (buckets.length === 0) {
    return <EmptyState title="No activity in this window." />;
  }

  const hasNet = buckets.some((b) => b.net !== null);
  const ariaLabel = `Sales, purchases and expenses over ${buckets.length} periods`;

  return (
    <figure className="m-0" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={buckets as ComparisonBucketPoint[]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={(value: string) => formatDateShort(value)}
            tick={{ fontSize: 11, fill: INK_FAINT }}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(value: number) => compactMoney(value)}
            tick={{ fontSize: 11, fill: INK_FAINT }}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip
            contentStyle={{ border: `1px solid ${GRID}`, borderRadius: 4, fontSize: 12 }}
            labelFormatter={(label: ReactNode) => formatDateShort(String(label), 'en', { withWeekday: true })}
            formatter={(value: TooltipValueType | undefined, name: ReactNode) =>
              [formatMoney(Number(value ?? 0)), name] as [string, ReactNode]
            }
          />
          <Bar dataKey="purchases" name="Purchases" stackId="outflow" fill={paletteColor(2)} isAnimationActive={!reduced} />
          <Bar dataKey="expenses" name="Expenses" stackId="outflow" fill={paletteColor(3)} isAnimationActive={!reduced} />
          <Line
            dataKey="sales"
            name="Sales"
            type="monotone"
            stroke={paletteColor(0)}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5 }}
            isAnimationActive={!reduced}
          />
          {hasNet ? (
            <Line
              dataKey="net"
              name="Net"
              type="monotone"
              stroke={INK}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 5 }}
              isAnimationActive={!reduced}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-900/60" aria-hidden="true">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ backgroundColor: paletteColor(0) }} />
          Sales
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5" style={{ backgroundColor: paletteColor(2) }} />
          Purchases
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5" style={{ backgroundColor: paletteColor(3) }} />
          Expenses
        </li>
        {hasNet ? (
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 border-t-2 border-dashed" style={{ borderColor: INK }} />
            Net
          </li>
        ) : null}
      </ul>

      <ChartDataTable
        caption={ariaLabel}
        columns={hasNet ? ['Period', 'Sales', 'Purchases', 'Expenses', 'Net'] : ['Period', 'Sales', 'Purchases', 'Expenses']}
        rows={buckets.map((b) =>
          hasNet
            ? [b.t, formatMoney(b.sales), formatMoney(b.purchases), formatMoney(b.expenses), formatMoney(b.net ?? 0)]
            : [b.t, formatMoney(b.sales), formatMoney(b.purchases), formatMoney(b.expenses)],
        )}
      />
    </figure>
  );
}
