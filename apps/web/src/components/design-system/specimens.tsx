'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  Disclosure,
  EmptyState,
  Loading,
  MetricStrip,
  Pagination,
  Tabs,
  type BadgeTone,
} from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { ToastStack } from '@/components/admin/toast-stack';
import {
  CategoryBarChart,
  ShareChart,
  SparklineChart,
  TimeSeriesChart,
} from '@/components/admin/charts';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/utils/cn';
import { Group } from './foundations';

const TONES: readonly BadgeTone[] = ['neutral', 'success', 'warning', 'danger', 'info'];

/** A small stand-in for real data: enough rows to show alignment, not enough to scroll. */
const ORDERS = [
  { id: 'ORD-2041', customer: 'Amna Traders', status: 'DELIVERED', total: 1284500 },
  { id: 'ORD-2042', customer: 'Bilal & Sons', status: 'PENDING', total: 459900 },
  { id: 'ORD-2043', customer: 'City Mart', status: 'CANCELLED', total: 92000 },
  { id: 'ORD-2044', customer: 'Dawn Retail', status: 'IN_PROGRESS', total: 7311000 },
] as const;

const SERIES = Array.from({ length: 12 }, (_, i) => ({
  day: `2026-03-${String(i + 1).padStart(2, '0')}`,
  revenue: 420000 + ((i * 7919) % 9) * 38000 + i * 21000,
  orders: 30 + ((i * 13) % 11) + i,
}));

export function ComponentSpecimens() {
  const [dialog, setDialog] = useState<'plain' | 'confirm' | null>(null);
  const [page, setPage] = useState(2);
  const [chip, setChip] = useState('all');
  const { toasts, add, remove } = useToast();

  return (
    <>
      <Group title="Buttons" note="Four variants, one size. Primary is the page's one job; there is never more than one per view.">
        <div className="card flex flex-wrap items-center gap-3 p-4">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button>
          <Button disabled>Disabled</Button>
          <Button variant="secondary" disabled>Disabled</Button>
          <Button loading loadingLabel="Saving…">Save</Button>
          <button type="button" className="btn-text">Text action</button>
        </div>
      </Group>

      <Group title="Form controls" note="Labels above, always visible. The outline is neutral-200 (3:1), the focus ring is the accent, and an error says what happened and what to do.">
        <form className="card grid gap-4 p-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
          <div>
            <label className="field-label" htmlFor="ds-name">Name</label>
            <input id="ds-name" className="field-input" placeholder="Amna Traders" />
          </div>
          <div>
            <label className="field-label" htmlFor="ds-email">Email</label>
            <input
              id="ds-email"
              type="email"
              className="field-input border-feedback-negative"
              defaultValue="amna@"
              aria-invalid="true"
              aria-describedby="ds-email-error"
            />
            <p id="ds-email-error" className="mt-1 text-sm text-feedback-negative">
              That address is missing its domain. Add one, like name@example.com.
            </p>
          </div>
          <div>
            <label className="field-label" htmlFor="ds-select">Branch</label>
            <select id="ds-select" className="field-input" defaultValue="lhr">
              <option value="lhr">Lahore</option>
              <option value="khi">Karachi</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="ds-disabled">Reference</label>
            <input id="ds-disabled" className="field-input" value="Assigned on save" disabled readOnly />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="ds-note">Note</label>
            <textarea id="ds-note" rows={3} className="field-input" placeholder="Anything the next person should know" />
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-900">
            <input type="checkbox" className="field-check" defaultChecked /> Notify the customer
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-900">
            <input type="checkbox" className="field-check" /> Mark as gift
          </label>
        </form>
      </Group>

      <Group title="Status" note="A tint is the boundary, not a border. Five tones; StatusBadge maps a domain status onto them so a status means the same colour everywhere.">
        <div className="card grid gap-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {TONES.map((tone) => (
              <Badge key={tone} tone={tone}>{tone}</Badge>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {['DELIVERED', 'PENDING', 'CANCELLED', 'IN_PROGRESS', 'DRAFT'].map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <p className="notice notice-success">Payment received.</p>
            <p className="notice notice-error">The card was declined. Try another card.</p>
            <p className="notice notice-info">A link is on its way to your inbox.</p>
          </div>
        </div>
      </Group>

      <Group title="Data" note="Numbers are right-aligned with tabular figures. Rows are separated by a rule and nothing else.">
        <div className="card overflow-hidden">
          <MetricStrip
            label="Sales this month"
            items={[
              { key: 'rev', label: 'Revenue', value: '1.28M', delta: { label: '+12% vs last month', direction: 'up' } },
              { key: 'ord', label: 'Orders', value: '342', delta: { label: '−3%', direction: 'down' } },
              { key: 'aov', label: 'Average order', value: '3,750', delta: { label: 'no change', direction: 'flat' } },
            ]}
          />
          <DataTable
            rows={[...ORDERS]}
            rowKey={(row) => row.id}
            columns={[
              { header: 'Order', cell: (row) => row.id },
              { header: 'Customer', cell: (row) => row.customer },
              { header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
              { header: 'Total', numeric: true, align: 'end', cell: (row) => (row.total / 100).toFixed(2) },
            ]}
          />
          <Pagination
            meta={{ page, totalPages: 5, total: 98, hasNext: page < 5, hasPrevious: page > 1 }}
            onChange={setPage}
            itemLabel="orders"
          />
        </div>
      </Group>

      <Group title="Navigation and disclosure" note="Tabs for peers, a disclosure for power that is one level down. Nothing is removed to keep a page calm; it moves.">
        <div className="card grid gap-6 p-4">
          <Tabs
            label="Order sections"
            items={[
              { key: 'items', label: 'Items', badge: 3, content: <p className="text-sm text-neutral-900/70">Three lines on this order.</p> },
              { key: 'payments', label: 'Payments', content: <p className="text-sm text-neutral-900/70">Paid in full by card.</p> },
              { key: 'history', label: 'History', content: <p className="text-sm text-neutral-900/70">Created, paid, packed, delivered.</p> },
            ]}
          />
          <nav aria-label="Specimen navigation" className="flex flex-wrap gap-2">
            <a href="#nav" className="nav-link nav-link-active" aria-current="page">Orders</a>
            <a href="#nav" className="nav-link">Customers</a>
            <a href="#nav" className="nav-link">Inventory</a>
          </nav>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter">
            {['all', 'open', 'closed'].map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={chip === key}
                onClick={() => setChip(key)}
                className={cn('chip', chip === key ? 'chip-selected' : 'chip-unselected')}
              >
                {key}
              </button>
            ))}
          </div>
          <Disclosure label="Advanced options">
            <p className="text-sm text-neutral-900/70">Less common settings live here, one click down.</p>
          </Disclosure>
        </div>
      </Group>

      <Group title="Feedback and layers" note="A dialog sits on the overlay surface over a scrim; a toast is the highest layer. Every one is reachable and dismissable from the keyboard.">
        <div className="card flex flex-wrap items-center gap-3 p-4">
          <Button variant="secondary" onClick={() => setDialog('plain')}>Open dialog</Button>
          <Button variant="danger" onClick={() => setDialog('confirm')}>Confirm a deletion</Button>
          <Button variant="secondary" onClick={() => add('Order saved.', 'success')}>Success toast</Button>
          <Button variant="secondary" onClick={() => add('Could not reach the server. Try again.', 'error')}>Error toast</Button>
          <Button variant="secondary" onClick={() => add('Syncing in the background.', 'info')}>Info toast</Button>
        </div>
        <Dialog
          open={dialog === 'plain'}
          onClose={() => setDialog(null)}
          title="Edit address"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
              <Button onClick={() => setDialog(null)}>Save</Button>
            </div>
          }
        >
          <label className="field-label" htmlFor="ds-dialog-line">Address line</label>
          <input id="ds-dialog-line" className="field-input" defaultValue="12 Canal Road" />
        </Dialog>
        <ConfirmDialog
          open={dialog === 'confirm'}
          onClose={() => setDialog(null)}
          onConfirm={() => setDialog(null)}
          title="Delete this branch?"
          description="Its 214 stock movements stay in the ledger. Type the branch name to confirm."
          confirmLabel="Delete branch"
          typeToConfirm="Lahore"
        />
        <ToastStack toasts={toasts} onDismiss={remove} />
      </Group>

      <Group title="States" note="Empty, loading and failing are designed, not left to chance. Empty says which of its three meanings applies.">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card">
            <EmptyState
              title="No orders yet"
              description="Orders appear here as customers check out."
              action={<Button variant="secondary">Create an order</Button>}
            />
          </div>
          <div className="card p-4">
            <Loading label="Loading orders" className="p-0" />
            <div className="mt-4 grid gap-2" aria-hidden>
              <div className="skeleton h-4 w-3/4" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-1/2" />
            </div>
          </div>
          <div className="card p-4">
            <p className="notice notice-error">We could not load orders. Check your connection and try again.</p>
            <Button variant="secondary" className="mt-3">Try again</Button>
          </div>
        </div>
      </Group>

      <Group title="Pinned regions" note="A region can hold one theme whatever the page is in. A badge over a product photo, or an announcement bar, must stay light on a dark page: their ink is chosen for that surface, not for the theme.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div data-theme="light" className="rounded bg-surface p-4 text-neutral-900">
            <p className="text-sm font-medium">Pinned light</p>
            <Badge tone="success" className="mt-2">In stock</Badge>
          </div>
          <div data-theme="dark" className="rounded bg-surface p-4 text-neutral-900">
            <p className="text-sm font-medium">Pinned dark</p>
            <Badge tone="success" className="mt-2">In stock</Badge>
          </div>
        </div>
      </Group>

      <Group title="Charts" note="Drawn from the same custom properties as the page, so they repaint the moment the theme changes. Each pairs colour with a dash and a marker.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <TimeSeriesChart
              data={SERIES}
              x="day"
              series={[{ key: 'revenue', label: 'Revenue', format: 'money' }]}
              chart="area"
              height={220}
              ariaLabel="Revenue over twelve days"
            />
          </div>
          <div className="card p-4">
            <CategoryBarChart
              items={[
                { label: 'Lahore', value: 420 },
                { label: 'Karachi', value: 310 },
                { label: 'Islamabad', value: 190 },
              ]}
              height={220}
            />
          </div>
          <div className="card p-4">
            <ShareChart
              items={[
                { label: 'Card', value: 58 },
                { label: 'Cash', value: 27 },
                { label: 'Bank transfer', value: 15 },
              ]}
            />
          </div>
          <div className="card flex items-center gap-4 p-4">
            <SparklineChart values={SERIES.map((p) => p.orders)} label="Orders, last twelve days" />
            <p className="text-sm text-neutral-900/70">Orders, last twelve days</p>
          </div>
        </div>
      </Group>
    </>
  );
}
