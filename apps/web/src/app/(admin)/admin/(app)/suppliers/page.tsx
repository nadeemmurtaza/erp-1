'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { Badge, DataTable } from '@/components/ui';
import { ROUTES } from '@/constants/routes';

interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  isActive: boolean;
}

export default function SuppliersListPage() {
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    adminFetch<{ data: Supplier[] }>('/admin/suppliers')
      .then((res) => setSuppliers(res.data))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load suppliers'))
      .finally(() => setBusy(false));
  }, []);

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Suppliers</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        All registered suppliers and vendors.
      </p>

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="card overflow-hidden">
        <DataTable
          rows={suppliers}
          loading={busy && !suppliers}
          rowKey={(supplier) => supplier.id}
          emptyLabel="No suppliers found."
          columns={[
            {
              header: 'Name',
              cell: (supplier) => (
                <Link
                  href={ROUTES.admin.supplier(supplier.id)}
                  className="font-medium text-accent-hover hover:underline"
                >
                  {supplier.name}
                </Link>
              ),
            },
            { header: 'Contact', muted: true, cell: (s) => s.contactName || '—' },
            { header: 'Phone', muted: true, cell: (s) => s.phone || '—' },
            { header: 'Email', muted: true, cell: (s) => s.email || '—' },
            { header: 'City', muted: true, cell: (s) => s.city || '—' },
            {
              header: 'Status',
              cell: (s) => (
                <Badge tone={s.isActive ? 'success' : 'neutral'}>
                  {s.isActive ? 'Active' : 'Inactive'}
                </Badge>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}
