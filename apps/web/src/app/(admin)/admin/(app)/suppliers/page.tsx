'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';

interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  isActive: boolean;
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={clsx('px-3 py-3 text-start font-medium text-ink/70', className)}>
      {children}
    </th>
  );
}

export default function SuppliersListPage() {
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    adminFetch<{ data: Supplier[] }>('/api/admin/suppliers')
      .then((res) => setSuppliers(res.data))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load suppliers'))
      .finally(() => setBusy(false));
  }, []);

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-ink">Suppliers</h1>
      <p className="mb-6 text-sm text-ink/60">
        All registered suppliers and vendors.
      </p>

      {error ? (
        <p role="alert" className="card mb-4 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-sand-200 bg-sand-50 whitespace-nowrap">
              <tr>
                <Th>Name</Th>
                <Th>Contact</Th>
                <Th>Phone</Th>
                <Th>Email</Th>
                <Th>City</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {busy && !suppliers ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-ink/50">
                    Loading...
                  </td>
                </tr>
              ) : suppliers?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-ink/50">
                    No suppliers found.
                  </td>
                </tr>
              ) : (
                suppliers?.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-sand-50/50">
                    <td className="px-3 py-3 font-medium">
                      <Link href={`/admin/suppliers/${supplier.id}`} className="text-brand-600 hover:underline">
                        {supplier.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-ink/80">{supplier.contactName || '—'}</td>
                    <td className="px-3 py-3 text-ink/80">{supplier.phone || '—'}</td>
                    <td className="px-3 py-3 text-ink/80">{supplier.email || '—'}</td>
                    <td className="px-3 py-3 text-ink/80">{supplier.city || '—'}</td>
                    <td className="px-3 py-3">
                      {supplier.isActive ? (
                        <span className="text-green-600">Active</span>
                      ) : (
                        <span className="text-ink/50">Inactive</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
