'use client';

import { useEffect, useRef, useState, use } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { ROUTES } from '@/constants/routes';
import { PageHeader, DataTable, Loading } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';

interface SpotCheckDetail {
  id: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  location: { id: string; name: string };
  lines: Array<{ id: string; expected: number; counted: number | null; variance: number | null; variant: { id: string; sku: string; label: string; barcode: string | null } }>;
}

export default function SpotCheckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [check, setCheck] = useState<SpotCheckDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [barcode, setBarcode] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    adminFetch<SpotCheckDetail>(`/admin/inventory/spot-checks/${id}`)
      .then(setCheck)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load spot check'));
  };

  useEffect(load, [id]);
  useEffect(() => {
    if (check?.status === 'IN_PROGRESS') inputRef.current?.focus();
  }, [check?.status]);

  const start = async () => {
    try {
      await adminFetch(`/admin/inventory/spot-checks/${id}/start`, { method: 'POST' });
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start');
    }
  };

  const scan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim()) return;
    try {
      await adminFetch(`/admin/inventory/spot-checks/${id}/scan`, { method: 'POST', body: { barcode: barcode.trim() } });
      setBarcode('');
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Barcode not found in this check');
    }
  };

  const complete = async () => {
    try {
      await adminFetch(`/admin/inventory/spot-checks/${id}/complete`, { method: 'POST' });
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not complete');
    }
  };

  if (!check) {
    return error ? (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    ) : (
      <Loading label="Loading spot check" />
    );
  }

  return (
    <>
      <PageHeader
        context={
          <Link href={ROUTES.admin.spotChecks} className="hover:underline">
            ← Spot checks
          </Link>
        }
        title={`Spot check · ${check.location.name}`}
        description={`${check.lines.length} SKUs, counted against current stock — never against the count's own snapshot.`}
        action={<StatusBadge status={check.status} />}
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {check.status === 'PENDING' ? (
        <button onClick={start} className="btn-primary mb-6">
          Start counting
        </button>
      ) : null}

      {check.status === 'IN_PROGRESS' ? (
        <form onSubmit={scan} className="card p-6 mb-6 max-w-md">
          <label htmlFor="spot-check-barcode" className="mb-1 block text-sm font-medium text-neutral-900">
            Scan barcode
          </label>
          <input
            id="spot-check-barcode"
            ref={inputRef}
            className="field-input w-full"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Scan or type a barcode, then Enter"
          />
        </form>
      ) : null}

      <div className="overflow-hidden mb-6">
        <DataTable
          rows={check.lines}
          rowKey={(l) => l.id}
          columns={[
            { header: 'Item', cell: (l) => `${l.variant.label} (${l.variant.sku})` },
            { header: 'Expected', align: 'end', cell: (l) => l.expected },
            { header: 'Counted', align: 'end', cell: (l) => l.counted ?? '—' },
            { header: 'Variance', align: 'end', cell: (l) => (l.variance != null ? l.variance : '—') },
          ]}
        />
      </div>

      {check.status === 'IN_PROGRESS' ? (
        <button onClick={complete} className="btn-primary">
          Complete count
        </button>
      ) : null}
    </>
  );
}
