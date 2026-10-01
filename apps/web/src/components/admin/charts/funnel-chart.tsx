'use client';

import { ArrowDownRight, TrendingDown } from 'lucide-react';
import { formatMoney, formatNumber } from '@newax/shared';
import { Badge, DataTable, EmptyState } from '@/components/ui';
import { ChartDataTable } from './chart-data-table';
import { funnelSteps, largestDropIndex, type FunnelStage } from './chart-math';
import { paletteColor, type ValueFormat } from './chart-theme';

export type { FunnelStage };

/**
 * A sequence where each stage is meant to be a subset of the one before: leads,
 * qualified, proposals, signed. Each stage's width is its count against the
 * first, and the slope from one stage to the next is the loss, so the narrowing is
 * the whole message and the bottleneck is the steepest slope.
 *
 * One hue for every stage. The stages are ordered, not different kinds of thing,
 * so a ramp would double-encode what the width already says (dataviz
 * `anti-patterns.md`, "a value ramp on nominal categories"), and the palest steps
 * would fall under the 3:1 floor for a mark. The 2 px gap between stages is the
 * surface showing through.
 *
 * Drawn as one row per stage with the name and the figures beside the shape, never
 * inside it: text on a mark has to clear the mark's own contrast in both themes,
 * and a small last stage has no room for it. Plain SVG polygons in a 100-unit
 * viewBox stretched to the width, so there is no chart library measuring a box.
 *
 * The table under it carries the conversion: what share reached each stage from the
 * one before, what was lost, and a "Largest drop" tag with an icon and words on the
 * stage that lost the most, so the bottleneck is never found by colour alone.
 */
export function FunnelChart({
  stages,
  format = 'integer',
  stageLabel = 'Stage',
  showTable = true,
}: {
  stages: readonly FunnelStage[];
  format?: ValueFormat;
  /** The first column's heading in the table, if "Stage" is not the right word. */
  stageLabel?: string;
  /** The conversion table under the chart. Off when the screen has its own. */
  showTable?: boolean;
}) {
  if (stages.length === 0) {
    return <EmptyState title="No data in this window." />;
  }
  if (stages.length < 2) {
    return <EmptyState title="A funnel needs at least two stages." description="With one, the number is the chart." />;
  }

  const formatValue = (value: number) => (format === 'money' ? formatMoney(value) : formatNumber(value));
  const steps = funnelSteps(stages);
  const worst = largestDropIndex(steps);
  const first = steps[0]!.value;
  const widthOf = (value: number) => (first > 0 ? Math.min(100, (Math.max(0, value) / first) * 100) : 0);
  const ariaLabel = `Funnel across ${stages.length} stages, from ${formatValue(steps[0]!.value)} to ${formatValue(steps.at(-1)!.value)}${
    worst == null ? '' : `; the largest drop is into ${steps[worst]!.label}`
  }`;

  return (
    <div className="grid grid-cols-1 gap-4">
      <div role="img" aria-label={ariaLabel} className="grid grid-cols-1 gap-0.5">
        {steps.map((step, index) => {
          const top = widthOf(step.value);
          // The last stage ends square: there is no next stage to slope towards.
          const bottom = index + 1 < steps.length ? widthOf(steps[index + 1]!.value) : top;
          return (
            <div
              key={step.label}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 sm:min-h-11 sm:grid-cols-[minmax(4.5rem,7rem)_minmax(0,1fr)_minmax(3.5rem,auto)] sm:items-center"
            >
              <span className="truncate text-sm text-neutral-900">{step.label}</span>
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
                className="order-last col-span-2 block h-11 w-full sm:order-none sm:col-span-1"
              >
                <polygon
                  fill={paletteColor(0)}
                  points={`${50 - top / 2},0 ${50 + top / 2},0 ${50 + bottom / 2},100 ${50 - bottom / 2},100`}
                />
              </svg>
              <span className="flex items-baseline justify-end gap-2 text-end leading-tight sm:block">
                <span className="text-sm font-semibold tabular-nums text-neutral-900 sm:block">
                  {formatValue(step.value)}
                </span>
                <span className="text-xs tabular-nums text-neutral-900/70 sm:block">{formatNumber(step.ofFirst)}%</span>
              </span>
            </div>
          );
        })}
      </div>

      {showTable ? (
        <DataTable
          stacked
          rows={steps}
          rowKey={(s) => s.label}
          columns={[
            {
              header: stageLabel,
              cell: (s, i) => (
                <span className="grid justify-items-start gap-1">
                  {s.label}
                  {i === worst ? (
                    <Badge tone="warning">
                      <TrendingDown aria-hidden="true" className="h-3 w-3" />
                      Largest drop
                    </Badge>
                  ) : null}
                </span>
              ),
            },
            { header: 'Reached', align: 'end', numeric: true, cell: (s) => formatValue(s.value) },
            {
              header: 'Of previous',
              align: 'end',
              numeric: true,
              muted: true,
              cell: (s) => (s.ofPrevious == null ? '—' : `${formatNumber(s.ofPrevious)}%`),
            },
            {
              header: 'Lost',
              align: 'end',
              numeric: true,
              cell: (s) =>
                s.droppedPct == null ? (
                  '—'
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <ArrowDownRight aria-hidden="true" className="h-3 w-3" />
                    {formatNumber(s.droppedPct)}%
                  </span>
                ),
            },
          ]}
        />
      ) : (
        <ChartDataTable
          caption={ariaLabel}
          columns={[stageLabel, 'Reached', 'Of first']}
          rows={steps.map((s) => [s.label, formatValue(s.value), `${formatNumber(s.ofFirst)}%`])}
        />
      )}
    </div>
  );
}
