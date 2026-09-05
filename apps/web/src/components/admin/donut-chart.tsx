'use client';

import { useMemo } from 'react';
import { THEME_COLORS } from '@yaseen/shared';

/**
 * Small donut chart for a categorical breakdown, with a legend beside it.
 *
 * Matches sales-chart.tsx's idiom: inline SVG, minimal direct labelling (just
 * the grand total, centered in the ring), muted neutral-toned legend text.
 * SVG `stroke`/`fill` can't take a Tailwind class, so the slice colours are
 * built from THEME_COLORS — the same accent teal and neutral ramp every other
 * chart and both apps use — rather than each chart hardcoding its own
 * approximation of the palette. "Other" always gets the same muted neutral
 * tone so the eye reads it as a catch-all, not a category.
 *
 * Only the top `maxSlices` categories are drawn individually; the rest are
 * folded into one "Other" slice so a long tail of tiny categories can't
 * crowd the ring or the legend.
 */
const PALETTE = [
  THEME_COLORS.accent.DEFAULT,
  THEME_COLORS.accent.hover,
  THEME_COLORS.neutral[600],
  THEME_COLORS.neutral[400],
  THEME_COLORS.neutral[300],
];
const OTHER_COLOR = THEME_COLORS.neutral[300];
const OTHER_LABEL = 'Other';
const TRACK = THEME_COLORS.neutral[100];

const SIZE = 116;
const CENTER = SIZE / 2;
const RADIUS = 42;
const STROKE = 16;

export interface DonutItem {
  label: string;
  value: number;
}

export function DonutChart({
  items,
  valueFormatter = (value: number) => String(value),
  maxSlices = 5,
}: {
  items: DonutItem[];
  valueFormatter?: (value: number) => string;
  maxSlices?: number;
}) {
  const slices = useMemo(() => {
    const sorted = [...items].filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, maxSlices);
    const rest = sorted.slice(maxSlices);
    const otherTotal = rest.reduce((sum, item) => sum + item.value, 0);
    const grouped = otherTotal > 0 ? [...top, { label: OTHER_LABEL, value: otherTotal }] : top;
    const total = grouped.reduce((sum, item) => sum + item.value, 0);

    // Cumulative offset is tracked on the unrounded percent so slice
    // boundaries stay exact; only the displayed figure is rounded.
    let cumulative = 0;
    return grouped.map((item, index) => {
      const exactPercent = total > 0 ? (item.value / total) * 100 : 0;
      const offset = cumulative;
      cumulative += exactPercent;
      return {
        label: item.label,
        value: item.value,
        exactPercent,
        percent: Math.round(exactPercent),
        offset,
        color: item.label === OTHER_LABEL ? OTHER_COLOR : PALETTE[index % PALETTE.length]!,
      };
    });
  }, [items, maxSlices]);

  const total = slices.reduce((sum, item) => sum + item.value, 0);

  if (slices.length === 0) {
    return <p className="p-8 text-center text-sm text-neutral-900/50">No revenue in this window.</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        className="shrink-0"
        role="img"
        aria-label="Revenue by category"
      >
        {/* Rotated so the first (largest) slice starts at 12 o'clock. */}
        <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke={TRACK} strokeWidth={STROKE} />
          {slices.map((slice) => (
            <circle
              key={slice.label}
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke={slice.color}
              strokeWidth={STROKE}
              pathLength={100}
              strokeDasharray={`${slice.exactPercent} ${100 - slice.exactPercent}`}
              strokeDashoffset={-slice.offset}
            />
          ))}
        </g>
        <text x={CENTER} y={CENTER + 4} textAnchor="middle" className="fill-neutral-900" fontSize={11} fontWeight={600}>
          {valueFormatter(total)}
        </text>
      </svg>

      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: slice.color }}
                aria-hidden="true"
              />
              <span className="truncate text-neutral-900/80">{slice.label}</span>
            </span>
            <span className="shrink-0 text-neutral-900/60">
              {valueFormatter(slice.value)} <span className="text-neutral-900/40">· {slice.percent}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
