'use client';

import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { formatMoney, formatNumber } from '@newax/shared';
import { EmptyState } from '@/components/ui';
import { cn } from '@/utils/cn';
import { ChartDataTable } from './chart-data-table';
import { ChartLegendRow } from './chart-legend';
import { MAX_NAMED_SLICES, OTHER_LABEL, foldShares, sharePct, type Share } from './chart-math';
import { CONTEXT, paletteColor, type ValueFormat } from './chart-theme';
import { usePrefersReducedMotion } from './use-reduced-motion';

export type ShareItem = Share;

/** Degrees of empty ring between two slices; 2° is ~2.6 px at the outer edge of the 76 px ring below. */
const SLICE_GAP_DEG = 2;

/**
 * A categorical share of a whole.
 *
 * Only the top `maxSlices` are drawn (never more than five); the rest fold into
 * one gray "Other" slice so a long tail can't crowd the ring or the legend. That
 * keeps the donut at six segments at most, the ceiling dataviz sets for a form
 * whose slices are compared by angle.
 *
 * Flat on purpose. A tilted, extruded donut makes the near slices look larger
 * than the far ones, so the picture misreports the number it is there to show.
 * The depth here is the ring's own: rounded slice ends, a gap between slices,
 * and a centre that is the hero figure.
 *
 * The centre reads the total until a slice is chosen, then that slice's value
 * and share. A slice is chosen by pointing at it, or by pointing at, focusing or
 * pressing its legend row, so the legend is the keyboard path to the same
 * readout and nothing is reachable only by mouse. Pressing a row pins it; the
 * ring dims every other slice rather than recolouring it (colour follows the
 * entity). The table twin carries every figure for a screen reader.
 */
export function ShareChart({
  items,
  format = 'integer',
  maxSlices = MAX_NAMED_SLICES,
}: {
  items: readonly ShareItem[];
  format?: ValueFormat;
  maxSlices?: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const reduced = usePrefersReducedMotion();

  if (items.length === 0) {
    return <EmptyState title="No data in this window." />;
  }

  const slices = foldShares(items, maxSlices);
  const total = slices.reduce((sum, item) => sum + item.value, 0);

  // Rows that all say zero are not a share of anything; a ring with no arc is a blank, not an answer.
  if (total <= 0) {
    return <EmptyState title="No data in this window." />;
  }

  const formatValue = (value: number) => (format === 'money' ? formatMoney(value) : formatNumber(value));
  const share = (value: number) => sharePct(value, total);
  const colorOf = (slice: Share, index: number) => (slice.label === OTHER_LABEL ? CONTEXT : paletteColor(index));

  const activeIndex = hovered ?? pinned;
  const active = activeIndex == null ? null : slices[activeIndex];
  const headline = active ? formatValue(active.value) : formatValue(total);
  const ariaLabel = `Share of ${formatValue(total)} across ${slices.length} categories`;

  return (
    <figure className="m-0 flex flex-col items-center gap-6 sm:flex-row">
      <div role="img" aria-label={ariaLabel} className="relative h-48 w-48 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius={66}
              outerRadius={84}
              paddingAngle={slices.length > 1 ? SLICE_GAP_DEG : 0}
              cornerRadius={4}
              stroke="none"
              startAngle={90}
              endAngle={-270}
              isAnimationActive={!reduced}
              onMouseEnter={(_, index) => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              onClick={(_, index) => setPinned((prev) => (prev === index ? null : index))}
            >
              {slices.map((slice, index) => (
                <Cell
                  key={slice.label}
                  fill={colorOf(slice, index)}
                  fillOpacity={activeIndex == null || activeIndex === index ? 1 : 0.3}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-9 text-center">
          <span className="eyebrow max-w-full truncate">{active ? active.label : 'Total'}</span>
          <span
            className={cn(
              'font-semibold tabular-nums text-neutral-900',
              headline.length > 12 ? 'text-sm' : headline.length > 8 ? 'text-base' : 'text-2xl',
            )}
          >
            {headline}
          </span>
          {active ? <span className="text-xs tabular-nums text-neutral-900/70">{formatNumber(share(active.value))}%</span> : null}
        </div>
      </div>

      <ul className="grid w-full min-w-0 flex-1 grid-cols-1 gap-1 text-sm">
        {slices.map((slice, index) => (
          <li key={slice.label}>
            <ChartLegendRow
              color={colorOf(slice, index)}
              label={slice.label}
              pressed={pinned === index}
              onPress={() => setPinned((prev) => (prev === index ? null : index))}
              onActivate={() => setHovered(index)}
              onDeactivate={() => setHovered(null)}
            >
              <span className="tabular-nums text-neutral-900">{formatValue(slice.value)}</span>
              <span className="w-12 text-end tabular-nums text-neutral-900/60">{formatNumber(share(slice.value))}%</span>
            </ChartLegendRow>
          </li>
        ))}
      </ul>

      <ChartDataTable
        caption={ariaLabel}
        columns={['Category', 'Value', 'Share']}
        rows={slices.map((slice) => [slice.label, formatValue(slice.value), `${formatNumber(share(slice.value))}%`])}
      />
    </figure>
  );
}
