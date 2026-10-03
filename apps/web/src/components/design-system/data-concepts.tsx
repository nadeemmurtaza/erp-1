'use client';

import { useState } from 'react';
import { ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight, Check, Minus, RotateCcw } from 'lucide-react';
import { formatDateShort, formatMoney, formatNumber } from '@newax/shared';
import { PeriodComparisonChart, ShareChart } from '@/components/admin/charts';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge, Button, DataTable, MetricStrip, Switch, type BadgeTone, type DataTableColumn } from '@/components/ui';
import { Group } from './foundations';

/**
 * The data concepts from the images, expressed in components that already
 * exist: a column manager over `DataTable`, a period comparison over the new
 * `PeriodComparisonChart`, and a share-of-whole over the upgraded `ShareChart`.
 *
 * Nothing here is a new component a screen would import. The column manager is
 * written out from `Switch`, `Button` and `DataTable` because it has one
 * consumer so far (the rule of three, `.claude/rules/design.md`); when a
 * second and third list want saved column views it is promoted, and its
 * persistence (per user, per list) is that work order's problem, not a
 * gallery's.
 */

/* ── column manager ───────────────────────────────────────────────────── */

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  stock: number;
  price: number;
  status: string;
  priority: 'high' | 'medium' | 'low';
  updated: string;
}

const PRODUCTS: Product[] = [
  {
    id: '1',
    name: 'Linen shirt',
    sku: 'LS-001',
    category: 'Menswear',
    stock: 3,
    price: 349_900,
    status: 'ACTIVE',
    priority: 'high',
    updated: '2026-09-28',
  },
  {
    id: '2',
    name: 'Cotton kurta',
    sku: 'CK-014',
    category: 'Menswear',
    stock: 42,
    price: 289_900,
    status: 'ACTIVE',
    priority: 'low',
    updated: '2026-09-27',
  },
  {
    id: '3',
    name: 'Silk dupatta',
    sku: 'SD-203',
    category: 'Accessories',
    stock: 8,
    price: 159_900,
    status: 'PENDING',
    priority: 'medium',
    updated: '2026-09-26',
  },
  {
    id: '4',
    name: 'Denim jacket',
    sku: 'DJ-088',
    category: 'Outerwear',
    stock: 0,
    price: 599_900,
    status: 'BLOCKED',
    priority: 'high',
    updated: '2026-09-24',
  },
  {
    id: '5',
    name: 'Wool shawl',
    sku: 'WS-120',
    category: 'Accessories',
    stock: 17,
    price: 449_900,
    status: 'DRAFT',
    priority: 'low',
    updated: '2026-09-22',
  },
  {
    id: '6',
    name: 'Canvas tote',
    sku: 'CT-031',
    category: 'Accessories',
    stock: 64,
    price: 99_900,
    status: 'ACTIVE',
    priority: 'low',
    updated: '2026-09-21',
  },
  {
    id: '7',
    name: 'Chino trousers',
    sku: 'CT-077',
    category: 'Menswear',
    stock: 11,
    price: 329_900,
    status: 'PENDING',
    priority: 'medium',
    updated: '2026-09-20',
  },
];

const PRIORITY: Record<Product['priority'], { label: string; tone: BadgeTone; Icon: typeof ArrowUp }> = {
  high: { label: 'High', tone: 'danger', Icon: ArrowUp },
  medium: { label: 'Medium', tone: 'warning', Icon: Minus },
  low: { label: 'Low', tone: 'neutral', Icon: ArrowDown },
};

/**
 * Every column the grid can show. `locked` is the identity column: it names the
 * row, so it is always on, always first and pinned, and its control says why it
 * cannot be turned off instead of simply being greyed out.
 */
const COLUMNS: {
  key: string;
  label: string;
  locked?: boolean;
  column: DataTableColumn<Product>;
}[] = [
  {
    key: 'name',
    label: 'Product',
    locked: true,
    column: {
      header: 'Product',
      cell: (p) => <span className="font-medium">{p.name}</span>,
      className: 'whitespace-nowrap',
    },
  },
  {
    key: 'sku',
    label: 'SKU',
    column: {
      header: 'SKU',
      cell: (p) => p.sku,
      muted: true,
      numeric: true,
      className: 'whitespace-nowrap',
    },
  },
  {
    key: 'category',
    label: 'Category',
    column: {
      header: 'Category',
      cell: (p) => p.category,
      muted: true,
      className: 'whitespace-nowrap',
    },
  },
  {
    key: 'stock',
    label: 'In stock',
    column: {
      header: 'In stock',
      cell: (p) => formatNumber(p.stock),
      align: 'end',
      numeric: true,
      className: 'whitespace-nowrap',
    },
  },
  {
    key: 'price',
    label: 'Price',
    column: {
      header: 'Price',
      cell: (p) => formatMoney(p.price),
      align: 'end',
      numeric: true,
      className: 'whitespace-nowrap',
    },
  },
  {
    key: 'status',
    label: 'Status',
    column: {
      header: 'Status',
      cell: (p) => <StatusBadge status={p.status} />,
      className: 'whitespace-nowrap',
    },
  },
  {
    key: 'priority',
    label: 'Priority',
    column: {
      header: 'Priority',
      className: 'whitespace-nowrap',
      cell: (p) => {
        const { label, tone, Icon } = PRIORITY[p.priority];
        return (
          <Badge tone={tone}>
            <Icon aria-hidden="true" className="h-3 w-3" />
            {label}
          </Badge>
        );
      },
    },
  },
  {
    key: 'updated',
    label: 'Updated',
    column: {
      header: 'Updated',
      cell: (p) => formatDateShort(p.updated),
      muted: true,
      className: 'whitespace-nowrap',
    },
  },
];

interface ColumnState {
  key: string;
  on: boolean;
}

const DEFAULT_VIEW: ColumnState[] = COLUMNS.map((c) => ({
  key: c.key,
  on: ['name', 'sku', 'category', 'stock', 'price', 'status'].includes(c.key),
}));

const sameView = (a: ColumnState[], b: ColumnState[]) =>
  a.length === b.length && a.every((c, i) => c.key === b[i]!.key && c.on === b[i]!.on);

const REORDER_BUTTON =
  'inline-flex h-touch w-touch items-center justify-center rounded-md text-neutral-900 transition-colors duration-fast ease-standard hover:bg-neutral-100 fold:h-9 fold:w-9 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';

/**
 * The grid and the panel that decides which columns it has.
 *
 * Reordering is two buttons per row, not a drag handle. Dragging has no
 * keyboard path unless a library is added for it, and the dependency rule asks
 * what a package does that the platform cannot; a pair of buttons is
 * keyboard-complete, 44 px on touch, and announces its result. A drag layer can
 * come later as an enhancement over the same state, never instead of it.
 *
 * Changes apply to the grid at once, but nothing persists until "Save view":
 * the button is disabled while the view matches the saved one, and the text
 * beside it says so.
 */
export function ColumnManagerSpecimen() {
  const [view, setView] = useState<ColumnState[]>(DEFAULT_VIEW);
  const [saved, setSaved] = useState<ColumnState[]>(DEFAULT_VIEW);
  const [announce, setAnnounce] = useState('');

  const byKey = (key: string) => COLUMNS.find((c) => c.key === key)!;
  const dirty = !sameView(view, saved);
  const shown = view.filter((c) => c.on);

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    // Index 0 is the locked identity column, so nothing moves above index 1.
    if (target < 1 || target >= view.length) return;
    const next = [...view];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setView(next);
    setAnnounce(`${byKey(view[index]!.key).label} moved to position ${target + 1} of ${view.length}.`);
  };

  const toggle = (index: number, on: boolean) => {
    setView(view.map((c, i) => (i === index ? { ...c, on } : c)));
    setAnnounce(
      `${byKey(view[index]!.key).label} ${on ? 'shown' : 'hidden'}. ${shown.length + (on ? 1 : -1)} of ${view.length} columns shown.`,
    );
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[theme(spacing.80)_minmax(0,1fr)]">
      <div className="card min-w-0 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="eyebrow">Columns</h4>
          <p className="text-sm tabular-nums text-neutral-900/70">
            {formatNumber(shown.length)} of {formatNumber(view.length)} shown
          </p>
        </div>

        <ul className="mt-2 divide-y divide-neutral-100">
          {view.map((c, index) => {
            const def = byKey(c.key);
            return (
              <li key={c.key} className="flex items-center gap-1">
                <Switch
                  className="min-w-0 flex-1"
                  checked={c.on}
                  disabled={def.locked}
                  onChange={(next) => toggle(index, next)}
                  label={def.label}
                  description={def.locked ? 'Fixed: it names the row.' : undefined}
                />
                <button
                  type="button"
                  className={REORDER_BUTTON}
                  aria-label={`Move ${def.label} up`}
                  disabled={index <= 1}
                  title={
                    index === 0
                      ? 'This column is fixed first'
                      : index === 1
                        ? 'Nothing moves above the fixed column'
                        : undefined
                  }
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp aria-hidden="true" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={REORDER_BUTTON}
                  aria-label={`Move ${def.label} down`}
                  disabled={index === 0 || index === view.length - 1}
                  title={
                    index === 0 ? 'This column is fixed first' : index === view.length - 1 ? 'Already last' : undefined
                  }
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown aria-hidden="true" className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            onClick={() => {
              setSaved(view);
              setAnnounce('View saved.');
            }}
            disabled={!dirty}
          >
            Save view
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setView(DEFAULT_VIEW);
              setAnnounce('Columns reset to the default view.');
            }}
            disabled={sameView(view, DEFAULT_VIEW)}
          >
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            Reset
          </Button>
          <p className="flex items-center gap-1 text-sm text-neutral-900/70">
            {dirty ? (
              'Unsaved changes'
            ) : (
              <>
                <Check aria-hidden="true" className="h-4 w-4" />
                Matches your saved view
              </>
            )}
          </p>
        </div>
        <p role="status" className="sr-only">
          {announce}
        </p>
      </div>

      <div className="card min-w-0 self-start p-2">
        <DataTable stickyFirst rows={PRODUCTS} rowKey={(p) => p.id} columns={shown.map((c) => byKey(c.key).column)} />
      </div>
    </div>
  );
}

/* ── comparison and share ─────────────────────────────────────────────── */

const REGIONS = [
  { label: 'Lahore', current: 18_400_000, previous: 16_100_000 },
  { label: 'Karachi', current: 15_200_000, previous: 15_900_000 },
  { label: 'Islamabad', current: 9_600_000, previous: 7_300_000 },
  { label: 'Faisalabad', current: 6_100_000, previous: 6_100_000 },
  { label: 'Multan', current: 3_800_000, previous: 4_400_000 },
];

const BUDGET = [
  { label: 'Operations', value: 42_000_000 },
  { label: 'Marketing', value: 24_500_000 },
  { label: 'Technology', value: 18_000_000 },
  { label: 'People', value: 12_500_000 },
  { label: 'Finance', value: 6_000_000 },
  { label: 'Facilities', value: 3_000_000 },
  { label: 'Training', value: 1_500_000 },
];

const CHANNELS = [
  { label: 'Storefront', value: 412 },
  { label: 'Point of sale', value: 268 },
  { label: 'Marketplace', value: 97 },
];

const Delta = ({ up, children }: { up: boolean; children: string }) => (
  <span className="inline-flex items-center gap-1">
    {up ? (
      <ArrowUpRight aria-hidden="true" className="h-3 w-3" />
    ) : (
      <ArrowDownRight aria-hidden="true" className="h-3 w-3" />
    )}
    {children}
  </span>
);

/**
 * Regional performance: three headline figures, then this period against the
 * last with the table that carries the same numbers.
 *
 * "Direction" in the strip means which way is good, so a return rate that fell
 * is `up` (an improvement) while its label still reads as a fall: sign, arrow
 * and tone are three channels, so the delta survives greyscale.
 */
export function RegionalPerformanceSpecimen() {
  const revenue = REGIONS.reduce((sum, r) => sum + r.current, 0);

  return (
    <div className="grid grid-cols-1 gap-6">
      <MetricStrip
        label="Regional summary"
        items={[
          {
            key: 'revenue',
            label: 'Revenue',
            value: formatMoney(revenue),
            delta: {
              direction: 'up',
              label: <Delta up>+8.6% on last month</Delta>,
            },
          },
          {
            key: 'orders',
            label: 'Orders',
            value: formatNumber(1_284),
            delta: {
              direction: 'up',
              label: <Delta up>+5.1% on last month</Delta>,
            },
          },
          {
            key: 'returns',
            label: 'Return rate',
            value: '3.2%',
            delta: {
              direction: 'up',
              label: <Delta up={false}>0.8 pts lower</Delta>,
            },
          },
        ]}
      />
      <PeriodComparisonChart
        points={REGIONS}
        currentLabel="This month"
        previousLabel="Last month"
        categoryLabel="Region"
      />
    </div>
  );
}

/**
 * Share of a whole, twice: money (a budget) and counts (orders by channel).
 *
 * The image's tilted 3D donut is not reproduced. Depth in a chart distorts the
 * one thing a donut is for, comparing angles, so the premium treatment is
 * spent where it helps reading: rounded slice ends, a gap between slices, the
 * total as the hero figure in the centre, and a legend that is also the way to
 * pick a slice with the keyboard.
 */
export function ShareSpecimen() {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
      <Group title="Department budget" note="Five named departments, the long tail folded into Other.">
        <div className="card p-5">
          <ShareChart items={BUDGET} format="money" />
        </div>
      </Group>
      <Group
        title="Orders by channel"
        note="The same chart over counts. Press a row to pin it; press again to release."
      >
        <div className="card p-5">
          <ShareChart items={CHANNELS} />
        </div>
      </Group>
    </div>
  );
}
