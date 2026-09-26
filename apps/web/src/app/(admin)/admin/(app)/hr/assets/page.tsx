'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatMoney, formatDate } from '@newax/shared';
import { PageHeader, DataTable, EmptyState, Dialog, Button, FilterBar, useFilterParam } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { useAdminSession } from '@/components/admin/session';
import { adminFetch } from '@/lib/admin-client';

interface Asset {
  id: string;
  assetTag: string;
  category: string;
  description: string;
  purchaseCostMinor: number | null;
  status: 'AVAILABLE' | 'ASSIGNED' | 'RETIRED' | 'LOST';
  createdAt: string;
}

const STATUS_OPTIONS = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'RETIRED', label: 'Retired' },
  { value: 'LOST', label: 'Lost' },
];

/**
 * hr-people-org/79-employee-asset-management.md WO-79.5 — which physical
 * equipment the shop owns. Issue/return/write-off and the full per-asset
 * custody history live on the detail screen (`[id]/page.tsx`) — Law 5, one
 * job here: see what exists and register a new one.
 */
export default function AssetsPage() {
  const session = useAdminSession();
  const canManage = session.can('hr.assets.manage');

  const [assets, setAssets] = useState<Asset[] | null>(null);
  const status = useFilterParam('status');
  const [error, setError] = useState<string | null>(null);
  const [newAssetOpen, setNewAssetOpen] = useState(false);

  const load = () => {
    adminFetch<{ data: Asset[] }>('/admin/hr/assets', { query: status ? { status } : undefined })
      .then((res) => setAssets(res.data))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load assets'));
  };

  useEffect(() => {
    setAssets(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <>
      <PageHeader
        title="Assets"
        description="Company equipment — laptops, phones, uniforms — and who currently holds each one."
        action={canManage ? <Button onClick={() => setNewAssetOpen(true)}>Register asset</Button> : undefined}
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <FilterBar
        filters={[{ key: 'status', type: 'select', placeholder: 'All statuses', options: STATUS_OPTIONS }]}
        className="mb-4"
      />

      {assets && assets.length === 0 ? (
        <EmptyState
          title="No assets registered"
          description="Register a laptop, phone or uniform to start tracking who has it."
          action={canManage ? <Button onClick={() => setNewAssetOpen(true)}>Register asset</Button> : undefined}
        />
      ) : (
        <DataTable
          rows={assets}
          loading={!assets}
          emptyLabel="No assets found."
          rowKey={(a) => a.id}
          columns={[
            {
              header: 'Tag',
              cell: (a) => (
                <Link href={`/admin/hr/assets/${a.id}`} className="text-neutral-900 hover:underline">
                  {a.assetTag}
                </Link>
              ),
            },
            { header: 'Category', cell: (a) => a.category, muted: true },
            { header: 'Description', cell: (a) => a.description, muted: true },
            {
              header: 'Cost',
              align: 'end',
              numeric: true,
              cell: (a) => (a.purchaseCostMinor != null ? formatMoney(a.purchaseCostMinor) : '—'),
            },
            { header: 'Registered', cell: (a) => formatDate(a.createdAt), muted: true },
            { header: 'Status', cell: (a) => <StatusBadge status={a.status} /> },
          ]}
        />
      )}

      <NewAssetDialog open={newAssetOpen} onClose={() => setNewAssetOpen(false)} onCreated={load} />
    </>
  );
}

function NewAssetDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [assetTag, setAssetTag] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAssetTag('');
      setCategory('');
      setDescription('');
      setCost('');
      setError(null);
    }
  }, [open]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const purchaseCostMinor = cost ? Math.round(parseFloat(cost) * 100) : undefined;
      await adminFetch('/admin/hr/assets', {
        method: 'POST',
        body: { assetTag, category, description, purchaseCostMinor },
      });
      onCreated();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not register the asset');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Register an asset"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !assetTag || !category || !description} loading={saving}>
            Register
          </Button>
        </div>
      }
    >
      {error ? (
        <p role="alert" className="notice notice-error mb-3">
          {error}
        </p>
      ) : null}
      <div className="space-y-3">
        <div>
          <label htmlFor="asset-tag" className="field-label">
            Asset tag
          </label>
          <input
            id="asset-tag"
            className="field-input mt-1 w-full"
            value={assetTag}
            onChange={(e) => setAssetTag(e.target.value)}
            placeholder="LT-014"
          />
        </div>
        <div>
          <label htmlFor="asset-category" className="field-label">
            Category
          </label>
          <input
            id="asset-category"
            className="field-input mt-1 w-full"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="laptop, phone, uniform…"
          />
        </div>
        <div>
          <label htmlFor="asset-description" className="field-label">
            Description
          </label>
          <input
            id="asset-description"
            className="field-input mt-1 w-full"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Dell Latitude 14, silver"
          />
        </div>
        <div>
          <label htmlFor="asset-cost" className="field-label">
            Purchase cost (optional)
          </label>
          <input
            id="asset-cost"
            type="number"
            min="0"
            step="0.01"
            className="field-input mt-1 w-full"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>
    </Dialog>
  );
}
