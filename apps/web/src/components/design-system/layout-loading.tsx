'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Plus, RotateCcw } from 'lucide-react';
import { formatMoney, formatNumber } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { TimeSeriesChart } from '@/components/admin/charts';
import { StatusBadge } from '@/components/common/status-badge';
import {
  Badge,
  Bento,
  BentoTile,
  Button,
  DataTable,
  EmptyState,
  Skeleton,
  SkeletonRegion,
  SkeletonText,
} from '@/components/ui';
import { cn } from '@/utils/cn';
import { Group } from './foundations';

/**
 * Two concepts from the Gemini images that are about how a page is laid out and
 * how it waits, not about what it says: the bento board and the skeleton.
 *
 * The bento is a primitive (`ui/bento.tsx`) because a dashboard, a branch
 * overview and a record home all want the same grid. The skeleton is a primitive
 * (`ui/skeleton.tsx`) because every list and card has a first-load state. What is
 * written out here is only the content a tile or a placeholder holds.
 */

/** Twelve days of sales in thousands of rupees, ending on the day the specimen was written. */
const SALES = [310, 340, 325, 380, 360, 410, 395, 430, 420, 465, 450, 482];

/** The same series in the shape a chart receives: a date and an amount in paisa. */
const SALES_POINTS = SALES.map((thousands, i) => ({
  date: `2026-09-${String(19 + i).padStart(2, '0')}`,
  sales: thousands * 100_000,
}));

const SALES_SERIES = [{ key: 'sales', label: 'Sales', format: 'money' as const }];

const LOW_STOCK = [
  { sku: 'Linen shirt, M', left: 3 },
  { sku: 'Cotton kurta, L', left: 5 },
  { sku: 'Denim jacket, S', left: 6 },
  { sku: 'Silk dupatta', left: 8 },
  { sku: 'Wool shawl', left: 9 },
  { sku: 'Canvas tote', left: 11 },
];

const TO_FULFIL = [
  { id: 'ORD-2041', who: 'Amna Khan', status: 'PENDING' },
  { id: 'ORD-2040', who: 'Bilal Ahmed', status: 'IN_PROGRESS' },
  { id: 'ORD-2038', who: 'Chand Bibi', status: 'READY' },
];

/**
 * A tile is one job. The hero carries the number the room asks about first; the
 * tall tile is a list that wants height; the small ones are single figures; the
 * accent tile is the one action; the inverse tile is the one quiet reassurance.
 * Nothing is a decorative card (`ui.md`: a card is a summary, object, status,
 * action, warning or result), and no tile carries a border: depth is the shadow
 * or the tint, never both on one edge.
 *
 * Below `md` the grid is one column and every span collapses, so a phone reads
 * the tiles in source order, hero first.
 */
export function BentoSpecimen() {
  return (
    <div className="mx-auto max-w-6xl">
      <Bento>
        <BentoTile size="hero" title="Sales today">
          <div className="flex h-full flex-col justify-between gap-4">
            <div>
              <p className="text-3xl font-semibold tabular-nums sm:text-4xl">
                {formatMoney(SALES_POINTS.at(-1)!.sales)}
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-900/70">
                <Badge tone="success" className="tabular-nums">
                  <ArrowUpRight aria-hidden="true" className="h-3 w-3" />
                  +12.4%
                </Badge>
                on yesterday
              </p>
            </div>
            <TimeSeriesChart
              data={SALES_POINTS}
              x="date"
              series={SALES_SERIES}
              chart="area"
              height={150}
              ariaLabel="Sales, last twelve days"
            />
          </div>
        </BentoTile>

        <BentoTile size="tall" title="Low stock">
          <div className="flex h-full flex-col justify-between gap-4">
            <ul className="grid gap-3">
              {LOW_STOCK.map((item) => (
                <li key={item.sku} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{item.sku}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{formatNumber(item.left)} left</span>
                </li>
              ))}
            </ul>
            <Link
              href={ROUTES.admin.inventoryReorder}
              className="btn-text inline-flex min-h-touch items-center gap-1 self-start text-sm"
            >
              See what to reorder
              <ArrowRight aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </div>
        </BentoTile>

        <BentoTile title="Returns open">
          <p className="text-3xl font-semibold tabular-nums">{formatNumber(7)}</p>
          <p className="mt-1 text-sm text-neutral-900/70">{formatNumber(2)} need approval</p>
        </BentoTile>

        <BentoTile tone="quiet" title="Average basket">
          <p className="text-3xl font-semibold tabular-nums">{formatMoney(384_000)}</p>
          <p className="mt-1 text-sm text-neutral-900/70">Across {formatNumber(126)} orders</p>
        </BentoTile>

        <BentoTile size="wide" title="To fulfil">
          <ul className="grid gap-2">
            {TO_FULFIL.map((order) => (
              <li key={order.id} className="flex min-h-touch items-center justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium tabular-nums">{order.id}</span>
                  <span className="ms-2 text-neutral-900/70">{order.who}</span>
                </span>
                <StatusBadge status={order.status} />
              </li>
            ))}
          </ul>
        </BentoTile>

        <BentoTile tone="accent" title="Start">
          <div className="flex h-full flex-col justify-between gap-4">
            <p className="text-lg font-semibold">Ring up a sale</p>
            <Button variant="secondary" className="self-start">
              <Plus aria-hidden="true" className="h-4 w-4" />
              New sale
            </Button>
          </div>
        </BentoTile>

        <BentoTile tone="inverse" title="Stock health">
          <div className="flex h-full flex-col justify-between gap-4">
            <p className="text-3xl font-semibold tabular-nums">94%</p>
            <p className="text-sm text-on-inverse/70">of lines are above their reorder point</p>
          </div>
        </BentoTile>
      </Bento>
    </div>
  );
}

type LoadState = 'loaded' | 'loading' | 'empty' | 'error';

const LOAD_STATES: { key: LoadState; label: string }[] = [
  { key: 'loaded', label: 'Loaded' },
  { key: 'loading', label: 'First load' },
  { key: 'empty', label: 'Empty' },
  { key: 'error', label: 'Failed' },
];

const ORDERS = [
  { id: 'ORD-2041', who: 'Amna Khan', total: 482_000 },
  { id: 'ORD-2040', who: 'Bilal Ahmed', total: 129_900 },
  { id: 'ORD-2038', who: 'Chand Bibi', total: 760_000 },
];

/**
 * One card per shape a page waits in: a figure, a person, a table, a chart.
 *
 * Each placeholder is drawn from the content it stands in for (same rows, same
 * widths, same heights), so nothing moves when the real data arrives; a skeleton
 * that is a different shape from its content is a layout shift with extra steps.
 * The four states are the four a screen has to design (`design.md`): the skeleton
 * is only the first, and it never stands in for the other two. An empty result is
 * an `EmptyState` with a way forward; a failure is a `.notice-error` that says what
 * happened and offers a retry. A refetch keeps the old data on screen and
 * spins on the control that asked, so the skeleton appears at most once per view.
 *
 * The shimmer is a 1.6 s gradient sweep; under `prefers-reduced-motion` the
 * stylesheet freezes it after one frame, so the placeholder reads as a flat tint.
 * The region is `role="status"` with a screen-reader label, and the pieces
 * inside are `aria-hidden`.
 */
export function SkeletonSpecimen() {
  const [state, setState] = useState<LoadState>('loading');

  return (
    <div className="grid grid-cols-1 gap-4">
      <div role="group" aria-label="State to preview" className="flex flex-wrap gap-2">
        {LOAD_STATES.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={state === s.key}
            onClick={() => setState(s.key)}
            className={cn('chip px-3 py-1.5', state === s.key ? 'chip-selected' : 'chip-unselected')}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Group title="A figure" className="card p-5">
          {state === 'loading' ? (
            <SkeletonRegion label="Loading sales">
              <div className="grid gap-3">
                <Skeleton className="w-24" />
                <Skeleton className="h-8 w-40 rounded-md" />
                <Skeleton className="w-16" />
              </div>
            </SkeletonRegion>
          ) : state === 'loaded' ? (
            <div className="grid gap-1">
              <p className="text-3xl font-semibold tabular-nums">{formatMoney(48_250_000)}</p>
              <p className="text-sm text-neutral-900/70">+12.4% on yesterday</p>
            </div>
          ) : (
            <StateBody state={state} noun="sales" />
          )}
        </Group>

        <Group title="A person" className="card p-5">
          {state === 'loading' ? (
            <SkeletonRegion label="Loading profile">
              <div className="flex items-center gap-3">
                <Skeleton shape="circle" />
                <div className="grid flex-1 gap-2">
                  <Skeleton className="w-32" />
                  <Skeleton className="w-20" />
                </div>
              </div>
            </SkeletonRegion>
          ) : state === 'loaded' ? (
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent-hover"
              >
                AK
              </span>
              <div>
                <p className="text-sm font-medium">Amna Khan</p>
                <p className="text-sm text-neutral-900/70">Branch manager</p>
              </div>
            </div>
          ) : (
            <StateBody state={state} noun="the profile" />
          )}
        </Group>

        <Group title="A table" className="card p-5">
          {state === 'loading' ? (
            <SkeletonRegion label="Loading orders">
              <div className="grid gap-3">
                {ORDERS.map((o) => (
                  <div key={o.id} className="flex items-center gap-3">
                    <Skeleton className="w-20" />
                    <Skeleton className="flex-1" />
                    <Skeleton className="w-16" />
                  </div>
                ))}
              </div>
            </SkeletonRegion>
          ) : state === 'loaded' ? (
            <DataTable
              rows={ORDERS}
              rowKey={(o) => o.id}
              columns={[
                { header: 'Order', cell: (o) => o.id, numeric: true },
                { header: 'Customer', cell: (o) => o.who, muted: true },
                {
                  header: 'Total',
                  cell: (o) => formatMoney(o.total),
                  align: 'end',
                  numeric: true,
                },
              ]}
            />
          ) : (
            <StateBody state={state} noun="orders" />
          )}
        </Group>

        <Group title="A chart" className="card p-5">
          {state === 'loading' ? (
            <SkeletonRegion label="Loading chart">
              <div className="grid gap-3">
                <Skeleton shape="block" className="h-32" />
                <div className="flex justify-between gap-3">
                  <Skeleton className="w-10" />
                  <Skeleton className="w-10" />
                  <Skeleton className="w-10" />
                  <Skeleton className="w-10" />
                </div>
              </div>
            </SkeletonRegion>
          ) : state === 'loaded' ? (
            <TimeSeriesChart
              data={SALES_POINTS}
              x="date"
              series={SALES_SERIES}
              chart="area"
              height={168}
              ariaLabel="Sales, last twelve days"
            />
          ) : (
            <StateBody state={state} noun="the chart" />
          )}
        </Group>
      </div>

      <Group title="Text">
        <SkeletonRegion label="Loading description">
          <SkeletonText lines={3} className="max-w-prose" />
        </SkeletonRegion>
      </Group>
    </div>
  );
}

function StateBody({ state, noun }: { state: 'empty' | 'error'; noun: string }) {
  if (state === 'empty') {
    return (
      <EmptyState
        className="py-6"
        title={`No ${noun} yet.`}
        description="They appear here as soon as the first one is recorded."
        action={<Button variant="secondary">Add one</Button>}
      />
    );
  }
  return (
    <div className="notice notice-error grid gap-2" role="alert">
      <p>Could not load {noun}. The server did not answer, and nothing was changed.</p>
      <div>
        <Button variant="secondary">
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          Try again
        </Button>
      </div>
    </div>
  );
}
