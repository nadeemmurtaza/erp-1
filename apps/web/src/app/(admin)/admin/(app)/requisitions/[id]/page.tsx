'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import { formatDate, formatMoney } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { PageHeader, DataTable, Loading } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { PartyPicker } from '@/components/admin/party-picker';

interface RequisitionDetail {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CONVERTED';
  justification: string;
  locationId: string;
  createdAt: string;
  rejectionNote: string | null;
  lines: Array<{ id: string; quantity: number; estimatedUnitCostMinor: number | null; variant: { sku: string; label: string } }>;
  convertedPurchaseOrder: { id: string; number: string; status: string } | null;
}

export default function RequisitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [requisition, setRequisition] = useState<RequisitionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [convertSupplierId, setConvertSupplierId] = useState('');
  const [showConvert, setShowConvert] = useState(false);

  const load = () => {
    adminFetch<RequisitionDetail>(`/admin/requisitions/${id}`)
      .then(setRequisition)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load requisition'));
  };

  useEffect(load, [id]);

  const decide = async (decision: 'approve' | 'reject') => {
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/requisitions/${id}/${decision}`, { method: 'POST', body: { comment: comment || undefined } });
      load();
      setComment('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not ${decision} requisition`);
    } finally {
      setBusy(false);
    }
  };

  const convert = async () => {
    if (!convertSupplierId) return;
    setBusy(true);
    setError(null);
    try {
      const po = await adminFetch<{ id: string }>(`/admin/requisitions/${id}/convert`, {
        method: 'POST',
        body: { supplierId: convertSupplierId },
      });
      router.push(ROUTES.admin.purchaseOrder(po.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not convert to a purchase order');
      setBusy(false);
    }
  };

  if (!requisition) {
    return error ? (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    ) : (
      <Loading label="Loading requisition" />
    );
  }

  return (
    <>
      <PageHeader
        context={
          <Link href={ROUTES.admin.requisitions} className="hover:underline">
            ← Requisitions
          </Link>
        }
        title={`Requisition · ${requisition.lines.length} line${requisition.lines.length === 1 ? '' : 's'}`}
        description={requisition.justification}
        action={<StatusBadge status={requisition.status} />}
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden mb-6">
        <DataTable
          rows={requisition.lines}
          rowKey={(l) => l.id}
          columns={[
            { header: 'Item', cell: (l) => `${l.variant.label} (${l.variant.sku})` },
            { header: 'Qty', align: 'end', cell: (l) => l.quantity },
            {
              header: 'Est. cost',
              align: 'end',
              numeric: true,
              cell: (l) => (l.estimatedUnitCostMinor != null ? formatMoney(l.estimatedUnitCostMinor) : '—'),
            },
          ]}
        />
      </div>

      <p className="text-sm text-neutral-900/60 mb-6">Requested {formatDate(requisition.createdAt)}.</p>

      {requisition.status === 'REJECTED' && requisition.rejectionNote ? (
        <p className="notice notice-error mb-6">Rejected: {requisition.rejectionNote}</p>
      ) : null}

      {requisition.convertedPurchaseOrder ? (
        <p className="notice notice-success mb-6">
          Converted to{' '}
          <Link href={ROUTES.admin.purchaseOrder(requisition.convertedPurchaseOrder.id)} className="font-medium hover:underline">
            {requisition.convertedPurchaseOrder.number}
          </Link>
          .
        </p>
      ) : null}

      {requisition.status === 'PENDING' ? (
        <div className="card p-6 max-w-md space-y-3">
          <h2 className="font-medium text-neutral-900">Decide</h2>
          <p className="text-xs text-neutral-900/60">
            The requester of a requisition cannot approve or reject their own request — that action is refused server-side.
          </p>
          <textarea
            className="field-input w-full"
            rows={2}
            placeholder="Optional comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flex gap-3">
            <button onClick={() => decide('approve')} disabled={busy} className="btn-primary">
              Approve
            </button>
            <button onClick={() => decide('reject')} disabled={busy} className="btn-danger">
              Reject
            </button>
          </div>
        </div>
      ) : null}

      {requisition.status === 'APPROVED' ? (
        <div className="card p-6 max-w-md space-y-3">
          <h2 className="font-medium text-neutral-900">Convert to purchase order</h2>
          <p className="text-xs text-neutral-900/60">
            A separate, explicit action — approving a requisition means &ldquo;yes, buy this,&rdquo; not the specific supplier or price.
          </p>
          {showConvert ? (
            <>
              <PartyPicker
                id="convert-supplier"
                partyRole="SUPPLIER"
                value={convertSupplierId}
                placeholder="Search suppliers by name or phone..."
                onSelect={(result) => setConvertSupplierId(result.supplierId ?? '')}
              />
              <button onClick={convert} disabled={busy || !convertSupplierId} className="btn-primary">
                Create purchase order
              </button>
            </>
          ) : (
            <button onClick={() => setShowConvert(true)} className="btn-primary">
              Choose supplier
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}
