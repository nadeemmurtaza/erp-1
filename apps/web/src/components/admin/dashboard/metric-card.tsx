'use client';

import Link from 'next/link';
import { formatMoney, formatNumber } from '@newax/shared';
import { SparklineChart } from '@/components/admin/charts';
import type { DashboardCard, ValueFormat } from './card-registry';

export interface MetricCardData {
  value: number;
  previous: number | null;
  label?: string;
}

export function formatValue(format: ValueFormat, value: number, label?: string): string {
  switch (format) {
    case 'money':
      return formatMoney(value);
    case 'percent':
      return `${value}%`;
    case 'percent-bps':
      return `${(value / 100).toFixed(1)}%`;
    case 'days':
      return `${value} ${value === 1 ? 'day' : 'days'}`;
    case 'text':
      return label ?? '—';
    case 'integer':
    default:
      return formatNumber(value);
  }
}

/** Percentage change from `previous` to `value`, or null when there's nothing to compare against. */
function deltaPercent(value: number, previous: number | null): number | null {
  if (previous === null) return null;
  if (previous === 0) return value === 0 ? 0 : null; // "infinite growth" is not a number (same idiom as finance's changeBps)
  return Math.round(((value - previous) / Math.abs(previous)) * 1000) / 10;
}

/**
 * The whole dashboard card grid boils down to this one component
 * (10-admin-dashboard.md D1) — every card is a registry entry, this is the
 * only place that renders one. The whole tile is a link; the delta carries
 * an arrow AND the words up/down, never colour alone; an absent metric is
 * an em-dash whose `title` says WHY (permission vs. module), never a
 * silent zero.
 */
export function MetricCard({
  card,
  data,
  days,
  canSee,
}: {
  card: DashboardCard;
  data: MetricCardData | undefined;
  days: number;
  canSee: boolean;
}) {
  const tone = card.tone ?? 'neutral';
  const delta = data ? deltaPercent(data.value, data.previous) : null;
  const isUp = delta !== null && delta > 0;
  const isDown = delta !== null && delta < 0;
  // tone 'up-bad' inverts the COLOUR (up reads as a problem), never the arrow direction.
  const deltaIsGood = tone === 'neutral' ? null : tone === 'up-good' ? isUp : isDown;

  const valueText = data ? formatValue(card.format, data.value, data.label) : '—';
  const missingReason = !canSee ? 'You do not have permission to view this figure.' : 'Not available for this deployment.';
  const deltaText =
    delta === null ? '' : `, ${isUp ? 'up' : isDown ? 'down' : 'flat'} ${Math.abs(delta)}% versus the previous ${days} days`;
  const ariaLabel = `${card.label}: ${data ? valueText : 'not available'}${deltaText}`;

  return (
    <Link
      href={card.href}
      className="card flex min-h-[104px] flex-col justify-between gap-2 p-4 transition-colors hover:border-neutral-200"
      aria-label={ariaLabel}
      title={data ? undefined : missingReason}
    >
      <span className="text-xs font-medium text-neutral-900/60">{card.label}</span>

      {data ? (
        <span
          className="text-xl font-semibold tabular-nums text-neutral-900"
          title={card.format === 'text' && card.hint ? card.hint : undefined}
        >
          {valueText}
        </span>
      ) : (
        <span className="text-xl font-semibold text-neutral-900/60" aria-hidden="true">
          —
        </span>
      )}

      {card.format === 'text' && data?.label ? (
        <span className="truncate text-sm text-neutral-900/70">{data.label}</span>
      ) : card.format !== 'text' && data?.label ? (
        <span className="truncate text-xs text-neutral-900/60">{data.label}</span>
      ) : null}

      {delta !== null ? (
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium ${
            deltaIsGood === null ? 'text-neutral-900/60' : deltaIsGood ? 'text-emerald-700' : 'text-rose-700'
          }`}
        >
          <span aria-hidden="true">{isUp ? '↑' : isDown ? '↓' : '→'}</span>
          {isUp ? 'Up' : isDown ? 'Down' : 'Flat'} {Math.abs(delta)}%
        </span>
      ) : null}
    </Link>
  );
}

/** The sparkline-bearing variant of the same tile, for the handful of headline cards D1 names. */
export function MetricCardWithSparkline({
  card,
  data,
  days,
  canSee,
  series,
}: {
  card: DashboardCard;
  data: MetricCardData | undefined;
  days: number;
  canSee: boolean;
  series: readonly number[] | undefined;
}) {
  return (
    <div className="relative">
      <MetricCard card={card} data={data} days={days} canSee={canSee} />
      {series && series.length >= 2 ? (
        <div className="pointer-events-none absolute inset-x-4 bottom-2 opacity-60">
          <SparklineChart values={series} label={`${card.label} trend`} tone={card.tone ?? 'neutral'} />
        </div>
      ) : null}
    </div>
  );
}
