'use client';

import { useState } from 'react';
import { CircleCheck, OctagonAlert, TriangleAlert } from 'lucide-react';
import { formatMoney, formatNumber } from '@newax/shared';
import { Badge, EmptyState, type BadgeTone } from '@/components/ui';
import { cn } from '@/utils/cn';
import { ChartDataTable } from './chart-data-table';
import { ChartLegendRow } from './chart-legend';
import { gaugeState, type GaugeKind, type GaugeStatus } from './chart-math';
import { GRID, NEGATIVE, WARNING, paletteColor, type ValueFormat } from './chart-theme';

export interface GaugeRing {
  label: string;
  value: number;
  /** The goal, or the limit, this ring is measured against. */
  max: number;
}

/**
 * Four rings is the most the geometry carries: at 8 px strokes on a 13 px pitch the
 * innermost ring leaves a centre about 90 px across, enough for a figure and a
 * label, and a fifth would leave one too small to read.
 */
export const MAX_GAUGE_RINGS = 4;

const SIZE = 200;
const CENTRE = SIZE / 2;
const OUTER_RADIUS = 88;
/** One or two rings are 10 px strokes on a 16 px pitch; three or four thin to 8 px on 13 so the centre keeps a figure's room. */
const DENSE_FROM = 3;
/** The sweep is three quarters of a turn, opening at the bottom, so a full ring reads as "full" and an empty one as "empty". */
const SWEEP = 0.75;
/** 135° puts the start of the sweep at the bottom left, so it runs clockwise over the top to the bottom right. */
const START_ANGLE = 135;

const STATUS: Record<GaugeStatus, { text: string; tone: BadgeTone; icon: typeof CircleCheck } | null> = {
  ok: null,
  complete: { text: 'Goal met', tone: 'success', icon: CircleCheck },
  warning: { text: 'Filling up', tone: 'warning', icon: TriangleAlert },
  critical: { text: 'Almost full', tone: 'danger', icon: OctagonAlert },
};

function StatusTag({ status }: { status: GaugeStatus }) {
  const meta = STATUS[status];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone}>
      <Icon aria-hidden="true" className="h-3 w-3" />
      {meta.text}
    </Badge>
  );
}

/**
 * One value against a fixed goal or limit, as an arc; several, as concentric
 * arcs read from the outside in. Two jobs share the shape and differ in what a
 * full ring means:
 *
 * - `progress`: full is the goal, and good. Reaching it says "Goal met".
 * - `capacity`: full is a limit, and bad. Storage, seats, an API quota. Past
 *   80% it says "Filling up" and past 95% "Almost full", in an amber and then a
 *   red ring.
 *
 * Severity is never the ring colour alone: the state is a badge with an icon and
 * the words, in the legend row beside the ring or under it, and in the table
 * twin. The track is a lighter step of the neutral ramp, so an empty ring still
 * shows where the goal is. A value past its max fills the ring and keeps its true
 * percentage (110% reads 110%, not 100%).
 *
 * With several rings the centre reads the summary (goals met, or rings needing
 * attention) until one is chosen by pointing at it, or by pointing at, focusing
 * or pressing its legend row, which is the keyboard path. Other rings dim rather
 * than recolour, because colour follows the entity.
 *
 * Why these thresholds, and why custom SVG, are in ADR-083's third 2026-10-01
 * addendum.
 */
export function GaugeChart({
  rings,
  kind = 'progress',
  format = 'integer',
  unit,
}: {
  rings: readonly GaugeRing[];
  kind?: GaugeKind;
  format?: ValueFormat;
  /** Shown after each figure, for a measure that is not money or a count: "GB", "seats". */
  unit?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);

  if (rings.length === 0) {
    return <EmptyState title="Nothing to measure yet." />;
  }

  const shown = rings.slice(0, MAX_GAUGE_RINGS);
  const formatValue = (value: number) =>
    (format === 'money' ? formatMoney(value) : formatNumber(value)) + (unit ? ` ${unit}` : '');
  const states = shown.map((ring) => gaugeState(ring.value, ring.max, { kind }));
  const many = shown.length > 1;
  const dense = shown.length >= DENSE_FROM;
  const stroke = dense ? 8 : 10;
  const pitch = dense ? 13 : 16;

  // A ring's colour is its identity, except a capacity ring past a limit, where it is the severity.
  const colourOf = (index: number) => {
    const status = states[index]!.status;
    if (kind === 'capacity' && status === 'critical') return NEGATIVE;
    if (kind === 'capacity' && status === 'warning') return WARNING;
    return paletteColor(index);
  };

  const activeIndex = hovered ?? pinned;
  const active = activeIndex == null ? null : { ring: shown[activeIndex]!, state: states[activeIndex]! };

  const met = states.filter((s) => s.status === 'complete').length;
  const attention = states.filter((s) => s.status === 'warning' || s.status === 'critical').length;
  const summary =
    kind === 'progress'
      ? { eyebrow: 'Goals met', figure: `${met} of ${shown.length}` }
      : { eyebrow: 'Need attention', figure: `${attention} of ${shown.length}` };

  const centre = active
    ? { eyebrow: active.ring.label, figure: `${formatNumber(active.state.pct)}%` }
    : many
      ? summary
      : { eyebrow: shown[0]!.label, figure: `${formatNumber(states[0]!.pct)}%` };

  const ariaLabel = many
    ? `${shown.length} ${kind === 'progress' ? 'goals' : 'limits'}: ${shown
        .map((r, i) => `${r.label} ${formatNumber(states[i]!.pct)}%`)
        .join(', ')}`
    : `${shown[0]!.label}: ${formatNumber(states[0]!.pct)}% of ${formatValue(shown[0]!.max)}`;

  const press = (index: number) => setPinned((prev) => (prev === index ? null : index));

  return (
    <figure className={cn('m-0 flex items-center justify-center gap-x-6 gap-y-4', many ? 'flex-wrap' : 'flex-col')}>
      <div role="img" aria-label={ariaLabel} className="relative h-48 w-48 shrink-0">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full">
          {shown.map((ring, index) => {
            const radius = OUTER_RADIUS - index * pitch;
            const circumference = 2 * Math.PI * radius;
            const arc = SWEEP * circumference;
            const fill = states[index]!.fill * arc;
            const dim = activeIndex != null && activeIndex !== index;
            return (
              <g
                key={ring.label}
                transform={`rotate(${START_ANGLE} ${CENTRE} ${CENTRE})`}
                opacity={dim ? 0.3 : 1}
                className="transition-opacity duration-fast ease-standard motion-reduce:transition-none"
              >
                <circle
                  cx={CENTRE}
                  cy={CENTRE}
                  r={radius}
                  fill="none"
                  stroke={GRID}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={`${arc} ${circumference}`}
                />
                {fill > 0 ? (
                  <circle
                    cx={CENTRE}
                    cy={CENTRE}
                    r={radius}
                    fill="none"
                    stroke={colourOf(index)}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={`${fill} ${circumference}`}
                    className="transition-[stroke-dasharray] duration-slow ease-standard motion-reduce:transition-none"
                  />
                ) : null}
                {many ? (
                  <circle
                    cx={CENTRE}
                    cy={CENTRE}
                    r={radius}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={pitch}
                    strokeDasharray={`${arc} ${circumference}`}
                    pointerEvents="stroke"
                    onMouseEnter={() => setHovered(index)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => press(index)}
                  />
                ) : null}
              </g>
            );
          })}
        </svg>

        <div
          className={cn(
            'pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center',
            dense ? 'px-12' : 'px-10',
          )}
        >
          <span className="eyebrow max-w-full truncate">{centre.eyebrow}</span>
          <span className={cn('font-semibold tabular-nums text-neutral-900', many && !active ? 'text-xl' : 'text-2xl')}>
            {centre.figure}
          </span>
        </div>
      </div>

      {many ? (
        <ul className="grid w-full min-w-0 flex-1 basis-56 grid-cols-1 gap-1 text-sm">
          {shown.map((ring, index) => (
            <li key={ring.label}>
              <ChartLegendRow
                color={colourOf(index)}
                label={ring.label}
                pressed={pinned === index}
                onPress={() => press(index)}
                onActivate={() => setHovered(index)}
                onDeactivate={() => setHovered(null)}
              >
                <StatusTag status={states[index]!.status} />
                <span className="tabular-nums text-neutral-900">{formatValue(ring.value)}</span>
                <span className="w-12 text-end tabular-nums text-neutral-900/60">
                  {formatNumber(states[index]!.pct)}%
                </span>
              </ChartLegendRow>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex min-w-0 flex-col items-center gap-2 text-sm">
          <StatusTag status={states[0]!.status} />
          <p className="m-0 tabular-nums text-neutral-900">
            {formatValue(shown[0]!.value)} of {formatValue(shown[0]!.max)}
          </p>
          <p className="m-0 tabular-nums text-neutral-900/70">
            {formatValue(Math.max(0, shown[0]!.max - shown[0]!.value))} {kind === 'capacity' ? 'left' : 'to go'}
          </p>
        </div>
      )}

      <ChartDataTable
        caption={ariaLabel}
        columns={
          kind === 'capacity'
            ? ['Measure', 'Used', 'Limit', 'Share of limit', 'State']
            : ['Measure', 'Reached', 'Goal', 'Share of goal', 'State']
        }
        rows={shown.map((ring, index) => [
          ring.label,
          formatValue(ring.value),
          formatValue(ring.max),
          `${formatNumber(states[index]!.pct)}%`,
          STATUS[states[index]!.status]?.text ?? 'On track',
        ])}
      />
    </figure>
  );
}
