'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { formatDateTime, formatMoney } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { PageHeader, DataTable, Section } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import type { PaginatedResult } from '@/types/api';

interface MerchantPayable {
  id: string;
  organizationId: string;
  orderId: string;
  grossMinor: number;
  platformFeeMinor: number;
  netPayableMinor: number;
  status: 'OPEN' | 'SCHEDULED' | 'PAID' | 'DISPUTED';
  scheduledPayoutAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

const STATUSES = ['', 'OPEN', 'SCHEDULED', 'PAID', 'DISPUTED'] as const;

/**
 * doc 155 §3 (WO-155.5) — a merchant's own payables, generalizing doc 145's
 * own supplier-bill-style screen. Off by default (`wallet` module) — see
 * DECISIONS.md. Scoped by the merchant tenant's own organizationId, the
 * same "whose rows" boundary SupplierBill already applies to a supplier.
 */
export default function MerchantPayablesPage() {
  const [organizationId, setOrganizationId] = useState('');
  const [payables, setPayables] = useState<MerchantPayable[] | null>(null);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('');
  const [error, setError] = useState<string | null>(null);
  const [merchantOwnerUserId, setMerchantOwnerUserId] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  function load() {
    if (!organizationId.trim()) return;
    setPayables(null);
    setError(null);
    adminFetch<PaginatedResult<MerchantPayable>>(`/admin/merchant-payables/organizations/${encodeURIComponent(organizationId.trim())}`, {
      query: { page: 1, pageSize: 50, status: status || undefined },
    })
      .then((result) => setPayables(result.data))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load payables.'));
  }

  useEffect(() => {
    if (organizationId.trim()) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function schedule() {
    if (!organizationId.trim() || !merchantOwnerUserId.trim()) return;
    setActionMessage(null);
    try {
      const result = await adminFetch<{ scheduledCount: number; verified: boolean }>(
        `/admin/merchant-payables/organizations/${encodeURIComponent(organizationId.trim())}/schedule-payout`,
        { method: 'POST', body: { merchantOwnerUserId: merchantOwnerUserId.trim() } },
      );
      setActionMessage(
        `Scheduled ${result.scheduledCount} payable(s) — merchant is ${result.verified ? 'verified' : 'not yet verified'}.`,
      );
      load();
    } catch (cause) {
      setActionMessage(cause instanceof Error ? cause.message : 'Could not schedule a payout run.');
    }
  }

  async function processPayout() {
    if (!organizationId.trim()) return;
    setActionMessage(null);
    try {
      const result = await adminFetch<{ paidCount: number; totalNetMinor: number }>(
        `/admin/merchant-payables/organizations/${encodeURIComponent(organizationId.trim())}/process-payout`,
        { method: 'POST' },
      );
      setActionMessage(`Paid ${result.paidCount} payable(s), ${formatMoney(result.totalNetMinor)} total.`);
      load();
    } catch (cause) {
      setActionMessage(cause instanceof Error ? cause.message : 'Could not process the payout run.');
    }
  }

  return (
    <>
      <PageHeader title="Merchant payables" description="What Newax owes each merchant for redeemed wallet credit — an ordinary trade payable, never an escrow release." />

      <Section title="Find a merchant's payables">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            load();
          }}
          className="flex max-w-lg items-end gap-2"
        >
          <div className="flex-1">
            <label className="field-label" htmlFor="organizationId">
              Merchant organization id
            </label>
            <input
              id="organizationId"
              className="field-input"
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary">
            Load
          </button>
        </form>
        {error ? (
          <p role="alert" className="notice notice-error mt-2">
            {error}
          </p>
        ) : null}
      </Section>

      {organizationId.trim() ? (
        <>
          <Section title="Payout run">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="field-label" htmlFor="merchantOwnerUserId">
                  Merchant owner user id (for verification timing)
                </label>
                <input
                  id="merchantOwnerUserId"
                  className="field-input"
                  value={merchantOwnerUserId}
                  onChange={(event) => setMerchantOwnerUserId(event.target.value)}
                />
              </div>
              <button type="button" onClick={schedule} className="btn-secondary">
                Schedule OPEN payables
              </button>
              <button type="button" onClick={processPayout} className="btn-primary">
                Process SCHEDULED payout
              </button>
            </div>
            {actionMessage ? <p className="notice notice-info mt-2">{actionMessage}</p> : null}
          </Section>

          <div className="mb-4 flex flex-wrap gap-2">
            {STATUSES.map((candidate) => (
              <button
                key={candidate || 'ALL'}
                type="button"
                onClick={() => setStatus(candidate)}
                className={status === candidate ? 'chip bg-inverse text-on-inverse' : 'chip'}
              >
                {candidate || 'All'}
              </button>
            ))}
          </div>

          <DataTable
            rows={payables}
            loading={payables === null}
            emptyLabel="No payables for this merchant yet."
            rowKey={(payable) => payable.id}
            onRowClick={(payable) => {
              window.location.href = ROUTES.admin.merchantPayable(payable.id);
            }}
            columns={[
              { header: 'Order', cell: (payable) => payable.orderId, muted: true },
              { header: 'Gross', cell: (payable) => formatMoney(payable.grossMinor), align: 'end' },
              { header: 'Fee', cell: (payable) => formatMoney(payable.platformFeeMinor), align: 'end', muted: true },
              { header: 'Net', cell: (payable) => formatMoney(payable.netPayableMinor), align: 'end' },
              { header: 'Status', cell: (payable) => <StatusBadge status={payable.status} /> },
              { header: 'Created', cell: (payable) => formatDateTime(payable.createdAt), align: 'end', muted: true },
            ]}
          />
        </>
      ) : null}
    </>
  );
}
