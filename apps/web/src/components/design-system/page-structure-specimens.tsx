'use client';

import { Suspense, useState } from 'react';
import {
  Button,
  DataTable,
  EmptyState,
  FilterBar,
  ListPageSkeleton,
  PageEnter,
  PageHeader,
  RevealScope,
  Section,
  SectionRail,
  SwapText,
  type DataTableColumn,
} from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { Group } from './foundations';

/**
 * The page-level primitives the gallery had not shown: how a page is headed and
 * divided (`Section`, `SectionRail`), how a list page is filtered and how it
 * waits (`FilterBar`, `ListPageSkeleton`), and how things arrive and change in
 * place (`PageEnter`, `RevealScope`, `SwapText`). Each is the real component with
 * a few realistic rows; nothing here is a picture of one.
 */

/* ── Page anatomy ───────────────────────────────────────────────────────── */

const RAIL_SECTIONS = [
  {
    id: 'rail-details',
    label: 'Details',
    content: (
      <Section title="Details" description="Name, description and the code the till scans." headingLevel="h3">
        <p className="text-sm text-neutral-900/70">Linen shirt, slim fit. Code LS-0042. Sold in five sizes.</p>
      </Section>
    ),
  },
  {
    id: 'rail-stock',
    label: 'Stock',
    badge: '3',
    content: (
      <Section title="Stock" description="By branch. Three branches hold fewer than five." headingLevel="h3">
        <p className="text-sm text-neutral-900/70">Main street 12 · Mall road 4 · Airport 2 · Warehouse 140.</p>
      </Section>
    ),
  },
  {
    id: 'rail-history',
    label: 'History',
    content: (
      <Section title="History" description="Every change, newest first." headingLevel="h3">
        <p className="text-sm text-neutral-900/70">Price changed on 28 September. Restocked on 24 September.</p>
      </Section>
    ),
  },
];

export function PageAnatomySpecimen() {
  return (
    <div className="grid gap-8">
      <div>
        <PageHeader
          headingLevel="h3"
          context="Products"
          title="Linen shirt"
          description="One title, one line, and the one primary action."
          action={<Button>Edit product</Button>}
        />
        <Section
          title="Variants"
          description="A titled region has no box around it: space and the heading do the grouping."
          action={<Button variant="secondary">Add variant</Button>}
          headingLevel="h3"
        >
          <p className="text-sm text-neutral-900/70">Five sizes, two colours. Ten variants in all.</p>
        </Section>
      </div>
      <div>
        <p className="mb-3 text-xs text-neutral-900/60">
          A long object keeps every part on the page and adds a rail to jump between them. Below the large width the rail becomes
          a row above the content.
        </p>
        <SectionRail label="Product sections" sections={RAIL_SECTIONS} />
      </div>
    </div>
  );
}

/* ── A list page: its filters and its wait ──────────────────────────────── */

interface OrderRow {
  number: string;
  customer: string;
  status: string;
}

const ORDERS: OrderRow[] = [
  { number: 'ORD-2041', customer: 'Amna Khan', status: 'PENDING' },
  { number: 'ORD-2040', customer: 'Bilal Ahmed', status: 'PROCESSING' },
  { number: 'ORD-2038', customer: 'Chand Bibi', status: 'SHIPPED' },
];

const ORDER_COLUMNS: DataTableColumn<OrderRow>[] = [
  { header: 'Order', cell: (row) => row.number },
  { header: 'Customer', cell: (row) => row.customer },
  { header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
];

export function ListPageSpecimen() {
  return (
    <div className="grid gap-8">
      <div className="min-w-0">
        <p className="mb-3 text-xs text-neutral-900/60">
          The filters live in the address bar, so a refresh, a bookmark and the back button all behave. Type or choose and watch
          the query string change; nothing below is filtered, because this page is not a list.
        </p>
        <Suspense fallback={<div className="skeleton h-9 w-full rounded" aria-hidden="true" />}>
          <FilterBar
            filters={[
              { key: 'q', type: 'search', placeholder: 'Search order or customer' },
              {
                key: 'status',
                type: 'select',
                placeholder: 'Any status',
                options: [
                  { value: 'PENDING', label: 'Pending' },
                  { value: 'PROCESSING', label: 'Processing' },
                  { value: 'SHIPPED', label: 'Shipped' },
                ],
              },
              { key: 'unpaid', type: 'toggle', label: 'Unpaid only' },
            ]}
          />
        </Suspense>
        <DataTable columns={ORDER_COLUMNS} rows={ORDERS} rowKey={(row) => row.number} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-3 text-xs text-neutral-900/60">
            While the list loads: the shape of the page that is coming (header, filters, table), not a spinner.
          </p>
          <ListPageSkeleton filters={2} rows={3} columns={4} />
        </div>
        <div>
          <p className="mb-3 text-xs text-neutral-900/60">
            When nothing matches the filters, which is a different state from having none at all and is never a skeleton.
          </p>
          <EmptyState
            title="No orders match these filters"
            description="Clear a filter to see more of them."
            action={<Button variant="secondary">Clear filters</Button>}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Arrival and change in place ────────────────────────────────────────── */

const STATUS_STEPS = ['Pending', 'Confirmed', 'Packed', 'Shipped'];

const TILES = [
  'Sales today',
  'Orders to pack',
  'Low stock',
  'Returns open',
  'New customers',
  'Cash in drawer',
];

export function ArrivalSpecimen() {
  const [step, setStep] = useState(0);
  return (
    <div className="grid gap-8">
      <div>
        <p className="mb-3 text-xs text-neutral-900/60">
          <code>PageEnter</code> wraps a layout&rsquo;s children: this block rose into place when the page loaded, and plays again
          whenever the pathname changes, not when a filter changes the query string.
        </p>
        <PageEnter>
          <p className="text-sm text-neutral-900/70">A page arrives as a fade and 8 px of travel, once.</p>
        </PageEnter>
      </div>

      <div>
        <p className="mb-3 text-xs text-neutral-900/60">
          A short value that changes in place: the old word leaves as the new one arrives, so a status is seen to move. A
          screen reader hears the new value once.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-sm">
            Order status: <strong className="font-semibold"><SwapText value={STATUS_STEPS[step]!} /></strong>
          </p>
          <Button
            variant="secondary"
            onClick={() => setStep((current) => (current + 1) % STATUS_STEPS.length)}
          >
            Move to next status
          </Button>
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs text-neutral-900/60">
          A board below the fold assembles as it scrolls into view, a few tiles at a time and once each. Reduced motion shows
          them all at once.
        </p>
        <RevealScope className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TILES.map((tile) => (
            <div key={tile} data-reveal-item className="card p-4 text-sm">
              {tile}
            </div>
          ))}
        </RevealScope>
      </div>
    </div>
  );
}

/** The three groups, in the order a page is built: its frame, its list, its motion. */
export function PageStructureSpecimens() {
  return (
    <>
      <Group
        title="Page anatomy"
        note="A header with one primary action, titled regions with no box around them, and a rail for a long object whose parts are all present."
      >
        <PageAnatomySpecimen />
      </Group>
      <Group
        title="A list page: filters, waiting, and none found"
        note="The filter row is held in the address bar. The skeleton is the page that is coming. An empty result says why and offers the way out."
      >
        <ListPageSpecimen />
      </Group>
      <Group
        title="Arrival and change in place"
        note="A page rises in once, a status changes where it stands, and a board assembles as it scrolls into view."
      >
        <ArrivalSpecimen />
      </Group>
    </>
  );
}
