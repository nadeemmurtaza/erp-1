'use client';

import { useEffect, useRef, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { formatMoney } from '@newax/shared';
import { PageHeader, DataTable, EmptyState } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import type { AdminProduct, PaginatedResponse } from '@/types/api';
import { Select } from '@/components/ui/select';

const AUDIENCES = ['RETAILER', 'DISTRIBUTOR', 'SUPPLIER', 'DIRECT_CUSTOMER'] as const;

interface Listing {
  id: string;
  kind: 'PRODUCT' | 'SERVICE';
  externalRef: string;
  title: string;
  priceMinorUnits: number | null;
  visibleTo: (typeof AUDIENCES)[number][];
  engagementMode: 'DISCOVERY_ONLY' | 'DISCOVERY_AND_TRANSACT';
  status: 'ACTIVE' | 'PAUSED' | 'DELISTED';
}

/**
 * 165-cross-tenant-marketplace-directory.md §2, WO-165.2 — "Publish to
 * marketplace": the actual UI for the owner's own "he can control who can
 * see his product/services... let the client choose" ask, not a backend
 * flag nobody can reach. Off by default (`marketplace` module) — a
 * deployment with no `MarketplacePublisherCredential` never sees this nav
 * entry at all.
 */
export default function MarketplacePage() {
  const [rows, setRows] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [options, setOptions] = useState<AdminProduct[]>([]);
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [visibleTo, setVisibleTo] = useState<Set<(typeof AUDIENCES)[number]>>(new Set());
  const [engagementMode, setEngagementMode] = useState<'DISCOVERY_ONLY' | 'DISCOVERY_AND_TRANSACT'>('DISCOVERY_ONLY');
  const [publishing, setPublishing] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = () => {
    adminFetch<Listing[]>('/admin/marketplace/listings')
      .then(setRows)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load your marketplace listings'));
  };

  useEffect(load, []);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (!q.trim() || product) {
      setOptions([]);
      return;
    }
    debounce.current = setTimeout(() => {
      adminFetch<PaginatedResponse<AdminProduct>>('/admin/catalog/products', { query: { q, pageSize: 6 } })
        .then((page) => setOptions(page.data))
        .catch(() => setOptions([]));
    }, 300);
    return () => clearTimeout(debounce.current);
  }, [q, product]);

  const toggleAudience = (audience: (typeof AUDIENCES)[number]) => {
    const next = new Set(visibleTo);
    if (next.has(audience)) next.delete(audience);
    else next.add(audience);
    setVisibleTo(next);
  };

  const publish = async () => {
    if (!product || visibleTo.size === 0) return;
    setPublishing(true);
    setError(null);
    try {
      await adminFetch('/admin/marketplace/listings', {
        method: 'POST',
        body: {
          kind: 'PRODUCT',
          externalRef: product.id,
          title: product.translations.find((t) => t.locale === 'en')?.name ?? product.slug,
          description: product.translations.find((t) => t.locale === 'en')?.description ?? '',
          priceMinorUnits: product.basePrice,
          imageUrl: product.images[0]?.url,
          visibleTo: [...visibleTo],
          engagementMode,
        },
      });
      setProduct(null);
      setQ('');
      setVisibleTo(new Set());
      setEngagementMode('DISCOVERY_ONLY');
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not publish this listing');
    } finally {
      setPublishing(false);
    }
  };

  const act = async (id: string, action: 'pause' | 'resume' | 'delist') => {
    setBusyId(id);
    setError(null);
    try {
      await adminFetch(`/admin/marketplace/listings/${id}/${action}`, { method: 'POST' });
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this listing');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Marketplace"
        description="Publish products and services to the cross-tenant directory, and control who sees them."
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="card p-6 mb-6 space-y-4 max-w-md">
        <h2 className="font-medium text-neutral-900">Publish a product</h2>
        <div>
          {product ? (
            <div className="flex items-center justify-between field-input">
              <span>{product.translations.find((t) => t.locale === 'en')?.name ?? product.slug}</span>
              <button type="button" onClick={() => setProduct(null)} className="text-xs text-accent-hover hover:underline">
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                className="field-input w-full"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search a product by name..."
              />
              {options.length > 0 ? (
                <ul className="mt-2 divide-y divide-neutral-100 rounded border border-neutral-100">
                  {options.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setProduct(p);
                          setOptions([]);
                        }}
                        className="w-full p-2 text-start text-sm hover:bg-neutral-50"
                      >
                        {p.translations.find((t) => t.locale === 'en')?.name ?? p.slug}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-neutral-900">Who can see this — pick at least one</span>
          <div className="flex flex-wrap gap-3">
            {AUDIENCES.map((audience) => (
              <label key={audience} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="field-check"
                  checked={visibleTo.has(audience)}
                  onChange={() => toggleAudience(audience)}
                />
                {audience.replace('_', ' ').toLowerCase()}
              </label>
            ))}
          </div>
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-neutral-900">What a viewer can do</span>
          <Select
            label="What a viewer can do"
            value={engagementMode}
            onChange={(next) => setEngagementMode(next as typeof engagementMode)}
            options={[
              { value: 'DISCOVERY_ONLY', label: 'Discovery only' },
              { value: 'DISCOVERY_AND_TRANSACT', label: 'Discovery and transact' },
            ]}
          />
          {/* The two labels are short enough to sit in one row; what each one allows is said under it. */}
          <p className="mt-1 text-sm text-neutral-900/70">
            {engagementMode === 'DISCOVERY_ONLY' ? 'They can view and inquire.' : 'They can view, inquire and also order.'}
          </p>
        </div>

        <button onClick={publish} disabled={publishing || !product || visibleTo.size === 0} className="btn-primary">
          Publish
        </button>
      </div>

      {rows && rows.length === 0 ? (
        <EmptyState title="Nothing published yet" description="Publish a product above to make it visible in the directory." />
      ) : (
        <DataTable
          rows={rows}
          loading={!rows}
          emptyLabel="No listings found."
          rowKey={(r) => r.id}
          columns={[
            { header: 'Title', cell: (r) => r.title },
            { header: 'Visible to', muted: true, cell: (r) => r.visibleTo.join(', ') },
            { header: 'Mode', muted: true, cell: (r) => (r.engagementMode === 'DISCOVERY_AND_TRANSACT' ? 'Discovery + transact' : 'Discovery only') },
            {
              header: 'Price',
              align: 'end',
              numeric: true,
              cell: (r) => (r.priceMinorUnits != null ? formatMoney(r.priceMinorUnits) : '—'),
            },
            {
              header: 'Status',
              cell: (r) =>
                r.status === 'ACTIVE' ? (
                  <StatusBadge status="ACTIVE" label="Active" />
                ) : r.status === 'PAUSED' ? (
                  <StatusBadge status="PENDING" label="Paused" />
                ) : (
                  <StatusBadge status="CANCELLED" label="Delisted" />
                ),
            },
            {
              header: '',
              align: 'end',
              cell: (r) => (
                <div className="flex justify-end gap-2">
                  {r.status !== 'DELISTED' ? (
                    <>
                      {r.status === 'ACTIVE' ? (
                        <button onClick={() => act(r.id, 'pause')} disabled={busyId === r.id} className="btn-secondary">
                          Pause
                        </button>
                      ) : (
                        <button onClick={() => act(r.id, 'resume')} disabled={busyId === r.id} className="btn-secondary">
                          Resume
                        </button>
                      )}
                      <button onClick={() => act(r.id, 'delist')} disabled={busyId === r.id} className="btn-danger">
                        Delist
                      </button>
                    </>
                  ) : null}
                </div>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
