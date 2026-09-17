'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';

interface TradingPartnerListRow {
  id: string;
  name: string;
  kind: 'SUPPLIER' | 'CUSTOMER' | 'BOTH';
  outboundBaseUrl: string | null;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  _count: { suppliers: number };
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={clsx('px-3 py-3 text-start font-medium text-ink/70', className)}>
      {children}
    </th>
  );
}

export default function TradingPartnersPage() {
  const [partners, setPartners] = useState<TradingPartnerListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    adminFetch<{ data: TradingPartnerListRow[] }>('/admin/trading-partners')
      .then((res) => setPartners(res.data))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load trading partners'))
      .finally(() => setBusy(false));
  }, []);

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-xl font-semibold text-ink">Trading Partners</h1>
          <p className="text-sm text-ink/60">
            Suppliers and buyers connected electronically — link a supplier to
            one so its bills arrive automatically instead of being typed in
            by hand.
          </p>
        </div>
        <Link href="/admin/trading-partners/new" className="btn-primary">
          New partner
        </Link>
      </div>

      {error ? (
        <p role="alert" className="card mb-4 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="whitespace-nowrap border-b border-sand-200 bg-sand-50">
              <tr>
                <Th>Name</Th>
                <Th>Kind</Th>
                <Th>Status</Th>
                <Th>Outbound URL</Th>
                <Th className="text-end">Linked suppliers</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {busy && !partners ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-ink/50">
                    Loading...
                  </td>
                </tr>
              ) : partners?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-ink/50">
                    No trading partners yet.
                  </td>
                </tr>
              ) : (
                partners?.map((partner) => (
                  <tr key={partner.id} className="hover:bg-sand-50/50">
                    <td className="px-3 py-3 font-medium">
                      <Link href={`/admin/trading-partners/${partner.id}`} className="text-brand-600 hover:underline">
                        {partner.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-ink/80">{partner.kind}</td>
                    <td className="px-3 py-3">
                      <span
                        className={clsx(
                          'rounded px-2 py-0.5 text-xs font-medium',
                          partner.status === 'ACTIVE'
                            ? 'bg-green-100 text-green-800'
                            : partner.status === 'SUSPENDED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-sand-200 text-ink/80',
                        )}
                      >
                        {partner.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-ink/60">{partner.outboundBaseUrl || '—'}</td>
                    <td className="px-3 py-3 text-end text-ink/60">{partner._count.suppliers}</td>
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
