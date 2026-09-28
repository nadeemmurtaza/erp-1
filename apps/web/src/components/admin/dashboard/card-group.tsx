'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ICON_MAP } from '@/components/admin/nav-registry';
import { STORAGE_KEYS } from '@/constants/storage';
import type { DashboardCard, DashboardGroupKey } from './card-registry';
import { MetricCard, MetricCardWithSparkline, formatValue, type MetricCardData } from './metric-card';

function readCollapsed(): Record<string, boolean> {
  // Private windows and "block site data" throw rather than return null — a
  // group that cannot remember its state should still open and close.
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.admin.dashboardCollapsed);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/**
 * One of the dashboard's nine group rows (the "collapsed groups" layout):
 * closed by default, showing only its headline figure, expanding on click
 * to the full card grid — the shape that reconciles a ~55-card dashboard
 * with Law 3 ("feel like there are only a few features") and Law 7
 * ("overview first, detail on click") without deleting any card.
 */
export function CardGroup({
  groupKey,
  label,
  icon,
  href,
  cards,
  metricsByKey,
  seriesByKey,
  days,
  canSee,
}: {
  groupKey: DashboardGroupKey;
  label: string;
  icon: keyof typeof ICON_MAP;
  href: string;
  cards: readonly DashboardCard[];
  metricsByKey: Record<string, MetricCardData>;
  seriesByKey: Record<string, readonly number[]>;
  days: number;
  canSee: (card: DashboardCard) => boolean;
}) {
  const [collapsed, setCollapsed] = useState(true);

  // Read after mount: the value is per-browser, so rendering it on the first
  // pass would differ from what the server produced (same idiom as
  // admin-shell.tsx's own nav-group collapse state).
  useEffect(() => {
    setCollapsed(readCollapsed()[groupKey] ?? true);
  }, [groupKey]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(STORAGE_KEYS.admin.dashboardCollapsed, JSON.stringify({ ...readCollapsed(), [groupKey]: next }));
    } catch {
      // Preference not persisted; the dashboard still works.
    }
  }

  const Icon = ICON_MAP[icon];
  const headlineCard = cards[0];
  const headline = headlineCard ? metricsByKey[headlineCard.metric] : undefined;
  const panelId = `dashboard-group-${groupKey}`;

  return (
    <section className="card p-0">
      <div className="flex items-center justify-between gap-3 p-4">
        <Link href={href} className="flex min-w-0 items-center gap-2 font-medium text-neutral-900 hover:underline">
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{label}</span>
        </Link>
        <div className="flex shrink-0 items-center gap-3">
          {collapsed && headlineCard ? (
            <span className="hidden text-sm tabular-nums text-neutral-900/70 sm:inline">
              {headlineCard.label}: {headline ? formatValue(headlineCard.format, headline.value, headline.label) : '—'}
            </span>
          ) : null}
          <button
            type="button"
            onClick={toggle}
            className="icon-btn"
            aria-expanded={!collapsed}
            aria-controls={panelId}
            aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronUp className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {!collapsed ? (
        <div
          id={panelId}
          className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 border-t border-neutral-100 p-4"
        >
          {cards.map((card) =>
            card.sparkline ? (
              <MetricCardWithSparkline
                key={card.key}
                card={card}
                data={metricsByKey[card.metric]}
                days={days}
                canSee={canSee(card)}
                series={seriesByKey[card.sparkline]}
              />
            ) : (
              <MetricCard key={card.key} card={card} data={metricsByKey[card.metric]} days={days} canSee={canSee(card)} />
            ),
          )}
        </div>
      ) : null}
    </section>
  );
}
