'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { formatMoney, formatDate } from '@newax/shared';
import { PageHeader, DataTable, Dialog, Button, Section } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { useAdminSession } from '@/components/admin/session';
import { adminFetch } from '@/lib/admin-client';
import { Select } from '@/components/ui/select';
import { DateField } from '@/components/ui/date-field';

interface UserRef {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

interface Assignment {
  id: string;
  userId: string;
  issuedAt: string;
  returnedAt: string | null;
  condition: string | null;
  user: UserRef;
  issuedBy: UserRef;
  returnedBy: UserRef | null;
}

interface AssetDetail {
  id: string;
  assetTag: string;
  category: string;
  description: string;
  purchaseCostMinor: number | null;
  purchasedOn: string | null;
  status: 'AVAILABLE' | 'ASSIGNED' | 'RETIRED' | 'LOST';
  assignments: Assignment[];
}

function personLabel(u: UserRef): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ');
  return name || u.email || u.id;
}

/**
 * hr-people-org/79-employee-asset-management.md WO-79.5 — one asset's full
 * custody history, chronological, never a bare "currently assigned" label
 * with no drill-down (the doc's own "Click the number" lens).
 */
export default function AssetDetailPage() {
  const params = useParams<{ id: string }>();
  const session = useAdminSession();
  const canManage = session.can('hr.assets.manage');
  const canWriteOff = session.can('hr.assets.writeoff');

  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [writeOffStatus, setWriteOffStatus] = useState<'RETIRED' | 'LOST' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    adminFetch<AssetDetail>(`/admin/hr/assets/${params.id}`)
      .then(setAsset)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load this asset'));
  };

  useEffect(load, [params.id]);

  const openAssignment = asset?.assignments.find((a) => !a.returnedAt) ?? null;

  const writeOff = async () => {
    if (!writeOffStatus) return;
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/hr/assets/${params.id}/write-off`, { method: 'POST', body: { status: writeOffStatus } });
      setWriteOffStatus(null);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not write off this asset');
    } finally {
      setBusy(false);
    }
  };

  if (!asset) {
    return error ? (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    ) : (
      <p className="text-sm text-neutral-900/60">Loading…</p>
    );
  }

  return (
    <>
      <PageHeader
        title={asset.assetTag}
        description={`${asset.category} — ${asset.description}`}
        action={
          <div className="flex gap-2">
            {canManage && asset.status === 'AVAILABLE' ? <Button onClick={() => setIssueOpen(true)}>Issue</Button> : null}
            {canManage && asset.status === 'ASSIGNED' ? (
              <Button variant="secondary" onClick={() => setReturnOpen(true)}>
                Return
              </Button>
            ) : null}
            {canWriteOff && (asset.status === 'AVAILABLE' || asset.status === 'ASSIGNED') ? (
              <Button variant="danger" onClick={() => setWriteOffStatus('LOST')}>
                Write off
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <Section title="Details">
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 text-sm">
          <div>
            <p className="text-xs text-neutral-900/60">Status</p>
            <StatusBadge status={asset.status} />
          </div>
          <div>
            <p className="text-xs text-neutral-900/60">Purchase cost</p>
            <p className="tabular-nums text-neutral-900">
              {asset.purchaseCostMinor != null ? formatMoney(asset.purchaseCostMinor) : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-neutral-900/60">Purchased on</p>
            <p className="text-neutral-900">{asset.purchasedOn ? formatDate(asset.purchasedOn) : '—'}</p>
          </div>
          {openAssignment ? (
            <div>
              <p className="text-xs text-neutral-900/60">Currently held by</p>
              <p className="text-neutral-900">{personLabel(openAssignment.user)}</p>
            </div>
          ) : null}
        </div>
      </Section>

      <Section title="Assignment history">
        <DataTable
          rows={asset.assignments}
          rowKey={(a) => a.id}
          emptyLabel="Never issued."
          columns={[
            { header: 'Held by', cell: (a) => personLabel(a.user) },
            { header: 'Issued', cell: (a) => formatDate(a.issuedAt), muted: true },
            { header: 'Issued by', cell: (a) => personLabel(a.issuedBy), muted: true },
            { header: 'Returned', cell: (a) => (a.returnedAt ? formatDate(a.returnedAt) : '—') },
            { header: 'Returned by', cell: (a) => (a.returnedBy ? personLabel(a.returnedBy) : '—'), muted: true },
            { header: 'Condition', cell: (a) => a.condition ?? '—', muted: true },
          ]}
        />
      </Section>

      <DepreciationSection asset={asset} />

      <IssueDialog
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        assetId={asset.id}
        onIssued={() => {
          setIssueOpen(false);
          load();
        }}
      />

      <ReturnDialog
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        assignmentId={openAssignment?.id ?? null}
        onReturned={() => {
          setReturnOpen(false);
          load();
        }}
      />

      <WriteOffDialog
        open={writeOffStatus !== null}
        status={writeOffStatus}
        onChangeStatus={setWriteOffStatus}
        onClose={() => setWriteOffStatus(null)}
        onConfirm={writeOff}
        assetTag={asset.assetTag}
        busy={busy}
      />
    </>
  );
}

function WriteOffDialog({
  open,
  status,
  onChangeStatus,
  onClose,
  onConfirm,
  assetTag,
  busy,
}: {
  open: boolean;
  status: 'RETIRED' | 'LOST' | null;
  onChangeStatus: (status: 'RETIRED' | 'LOST') => void;
  onClose: () => void;
  onConfirm: () => void;
  assetTag: string;
  busy: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      title={`Write off ${assetTag}?`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy} loading={busy} loadingLabel="Working…">
            Write off
          </Button>
        </div>
      }
    >
      <p className="text-sm text-neutral-900/70">
        A real cost, distinct from an ordinary return. Either choice closes any open assignment and the asset never
        returns to AVAILABLE.
      </p>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => onChangeStatus('LOST')}
          className={status === 'LOST' ? 'btn-secondary' : 'btn-ghost'}
        >
          Lost
        </button>
        <button
          type="button"
          onClick={() => onChangeStatus('RETIRED')}
          className={status === 'RETIRED' ? 'btn-secondary' : 'btn-ghost'}
        >
          Retired
        </button>
      </div>
    </Dialog>
  );
}

interface DepreciationPosting {
  id: string;
  periodStart: string;
  periodEnd: string;
  amountMinor: number;
}

interface DepreciationSchedule {
  id: string;
  method: 'STRAIGHT_LINE' | 'DECLINING_BALANCE';
  acquisitionCostMinor: number;
  salvageValueMinor: number;
  usefulLifeMonths: number;
  decliningRateBps: number | null;
  startDate: string;
  closedAt: string | null;
  postings: DepreciationPosting[];
}

/**
 * finance-accounting/147-fixed-asset-depreciation.md WO-147.6 — on doc 79's
 * own asset detail screen, never a second page (the doc's own instruction).
 * Fetches best-effort and renders nothing on failure: `accounting` is off by
 * default (module-packs.ts), so a 403/404 here most often means the module
 * simply is not installed for this deployment, not a real error — the same
 * "layout closes over absence" posture `GrossProfitTodayWidget` already
 * takes for its own optional dependency.
 */
function DepreciationSection({ asset }: { asset: AssetDetail }) {
  const session = useAdminSession();
  const canDepreciate = session.can('finance.assets.depreciate');
  const canDispose = session.can('finance.assets.dispose');

  const [schedule, setSchedule] = useState<DepreciationSchedule | null | undefined>(undefined);
  const [newScheduleOpen, setNewScheduleOpen] = useState(false);
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    adminFetch<DepreciationSchedule>(`/admin/accounting/assets/${asset.id}/depreciation-schedule`)
      .then(setSchedule)
      .catch(() => setSchedule(null));
  };

  useEffect(load, [asset.id]);

  if (!canDepreciate && !canDispose) return null;
  if (schedule === undefined) return null;

  const totalPosted = schedule?.postings.reduce((sum, p) => sum + p.amountMinor, 0) ?? 0;
  const remainingBookValue = schedule ? schedule.acquisitionCostMinor - totalPosted : 0;
  const active = schedule && !schedule.closedAt;

  return (
    <Section
      title="Depreciation"
      action={
        canDepreciate && !active ? (
          <Button variant="secondary" onClick={() => setNewScheduleOpen(true)}>
            {schedule ? 'New schedule' : 'Put on schedule'}
          </Button>
        ) : canDispose && active ? (
          <Button variant="danger" onClick={() => setDisposeOpen(true)}>
            Dispose
          </Button>
        ) : undefined
      }
    >
      {error ? (
        <p role="alert" className="notice notice-error mb-3">
          {error}
        </p>
      ) : null}

      {!schedule ? (
        <p className="text-sm text-neutral-900/60">Not on a depreciation schedule.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 text-sm">
            <div>
              <p className="text-xs text-neutral-900/60">Method</p>
              <p className="text-neutral-900">{schedule.method === 'STRAIGHT_LINE' ? 'Straight line' : 'Declining balance'}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-900/60">Useful life</p>
              <p className="text-neutral-900">{schedule.usefulLifeMonths} months</p>
            </div>
            <div>
              <p className="text-xs text-neutral-900/60">Posted so far</p>
              <p className="tabular-nums text-neutral-900">{formatMoney(totalPosted)}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-900/60">Remaining book value</p>
              <p className="tabular-nums text-neutral-900">{formatMoney(remainingBookValue)}</p>
            </div>
            {schedule.closedAt ? (
              <div>
                <p className="text-xs text-neutral-900/60">Closed</p>
                <p className="text-neutral-900">{formatDate(schedule.closedAt)}</p>
              </div>
            ) : null}
          </div>

          {schedule.postings.length > 0 ? (
            <DataTable
              className="mt-4"
              rows={schedule.postings}
              rowKey={(p) => p.id}
              emptyLabel="No periods posted yet."
              columns={[
                { header: 'Period', cell: (p) => formatDate(p.periodStart) },
                { header: 'Amount', align: 'end', numeric: true, cell: (p) => formatMoney(p.amountMinor) },
              ]}
            />
          ) : null}
        </>
      )}

      <NewScheduleDialog
        open={newScheduleOpen}
        onClose={() => setNewScheduleOpen(false)}
        assetId={asset.id}
        defaultCostMinor={asset.purchaseCostMinor}
        onCreated={() => {
          setNewScheduleOpen(false);
          load();
        }}
        onError={setError}
      />

      <DisposeDialog
        open={disposeOpen}
        onClose={() => setDisposeOpen(false)}
        assetId={asset.id}
        assetTag={asset.assetTag}
        remainingBookValue={remainingBookValue}
        onDisposed={() => {
          setDisposeOpen(false);
          load();
        }}
        onError={setError}
      />
    </Section>
  );
}

function NewScheduleDialog({
  open,
  onClose,
  assetId,
  defaultCostMinor,
  onCreated,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  assetId: string;
  defaultCostMinor: number | null;
  onCreated: () => void;
  onError: (message: string | null) => void;
}) {
  const [method, setMethod] = useState<'STRAIGHT_LINE' | 'DECLINING_BALANCE'>('STRAIGHT_LINE');
  const [acquisitionCost, setAcquisitionCost] = useState('');
  const [salvageValue, setSalvageValue] = useState('0');
  const [usefulLifeMonths, setUsefulLifeMonths] = useState('36');
  const [decliningRateBps, setDecliningRateBps] = useState('2000');
  const [startDate, setStartDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMethod('STRAIGHT_LINE');
      setAcquisitionCost(defaultCostMinor != null ? (defaultCostMinor / 100).toFixed(2) : '');
      setSalvageValue('0');
      setUsefulLifeMonths('36');
      setDecliningRateBps('2000');
      setStartDate(new Date().toISOString().slice(0, 10));
      onError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    setSaving(true);
    onError(null);
    try {
      await adminFetch(`/admin/accounting/assets/${assetId}/depreciation-schedule`, {
        method: 'POST',
        body: {
          method,
          acquisitionCostMinor: acquisitionCost ? Math.round(parseFloat(acquisitionCost) * 100) : undefined,
          salvageValueMinor: Math.round(parseFloat(salvageValue || '0') * 100),
          usefulLifeMonths: parseInt(usefulLifeMonths, 10),
          decliningRateBps: method === 'DECLINING_BALANCE' ? parseInt(decliningRateBps, 10) : undefined,
          startDate,
        },
      });
      onCreated();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not create the depreciation schedule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Put this asset on a depreciation schedule"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !usefulLifeMonths || !startDate} loading={saving}>
            Create
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label htmlFor="depr-method" className="field-label">
            Method
          </label>
          <Select
            id="depr-method"
            label="Method"
            className="mt-1"
            value={method}
            onChange={(next) => setMethod(next as 'STRAIGHT_LINE' | 'DECLINING_BALANCE')}
            options={[
              { value: 'STRAIGHT_LINE', label: 'Straight line' },
              { value: 'DECLINING_BALANCE', label: 'Declining balance' },
            ]}
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="depr-cost" className="field-label">
              Acquisition cost
            </label>
            <input
              id="depr-cost"
              type="number"
              min="0"
              step="0.01"
              className="field-input mt-1 w-full"
              value={acquisitionCost}
              onChange={(e) => setAcquisitionCost(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="depr-salvage" className="field-label">
              Salvage value
            </label>
            <input
              id="depr-salvage"
              type="number"
              min="0"
              step="0.01"
              className="field-input mt-1 w-full"
              value={salvageValue}
              onChange={(e) => setSalvageValue(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="depr-life" className="field-label">
              Useful life (months)
            </label>
            <input
              id="depr-life"
              type="number"
              min="1"
              className="field-input mt-1 w-full"
              value={usefulLifeMonths}
              onChange={(e) => setUsefulLifeMonths(e.target.value)}
            />
          </div>
          {method === 'DECLINING_BALANCE' ? (
            <div className="flex-1">
              <label htmlFor="depr-rate" className="field-label">
                Rate (bps)
              </label>
              <input
                id="depr-rate"
                type="number"
                min="1"
                className="field-input mt-1 w-full"
                value={decliningRateBps}
                onChange={(e) => setDecliningRateBps(e.target.value)}
              />
            </div>
          ) : null}
        </div>
        <div>
          <label htmlFor="depr-start" className="field-label">
            Start date
          </label>
          <DateField id="depr-start" className="mt-1" value={startDate} onChange={setStartDate} />
        </div>
      </div>
    </Dialog>
  );
}

function DisposeDialog({
  open,
  onClose,
  assetId,
  assetTag,
  remainingBookValue,
  onDisposed,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  assetId: string;
  assetTag: string;
  remainingBookValue: number;
  onDisposed: () => void;
  onError: (message: string | null) => void;
}) {
  const [saleProceeds, setSaleProceeds] = useState('');
  const [disposalDate, setDisposalDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSaleProceeds('');
      setDisposalDate(new Date().toISOString().slice(0, 10));
      onError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dispose = async () => {
    setSaving(true);
    onError(null);
    try {
      await adminFetch(`/admin/accounting/assets/${assetId}/dispose`, {
        method: 'POST',
        body: {
          disposalDate: disposalDate || undefined,
          saleProceedsMinor: saleProceeds ? Math.round(parseFloat(saleProceeds) * 100) : undefined,
        },
      });
      onDisposed();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not dispose this asset');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={saving ? () => {} : onClose}
      title={`Dispose ${assetTag}?`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="danger" onClick={dispose} disabled={saving} loading={saving} loadingLabel="Working…">
            Dispose
          </Button>
        </div>
      }
    >
      <p className="text-sm text-neutral-900/70">
        Posts the remaining book value ({formatMoney(remainingBookValue)}) as a loss, and any sale proceeds as a gain.
        Closes the depreciation schedule and retires the asset. This cannot be undone.
      </p>
      <div className="mt-3 flex gap-3">
        <div className="flex-1">
          <label htmlFor="dispose-proceeds" className="field-label">
            Sale proceeds (optional)
          </label>
          <input
            id="dispose-proceeds"
            type="number"
            min="0"
            step="0.01"
            className="field-input mt-1 w-full"
            value={saleProceeds}
            onChange={(e) => setSaleProceeds(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="dispose-date" className="field-label">
            Disposal date
          </label>
          <DateField id="dispose-date" className="mt-1" value={disposalDate} onChange={setDisposalDate} />
        </div>
      </div>
    </Dialog>
  );
}

function IssueDialog({
  open,
  onClose,
  assetId,
  onIssued,
}: {
  open: boolean;
  onClose: () => void;
  assetId: string;
  onIssued: () => void;
}) {
  const [q, setQ] = useState('');
  const [staff, setStaff] = useState<UserRef[]>([]);
  const [user, setUser] = useState<UserRef | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setUser(null);
    setError(null);
    // `GET /admin/users` (users.manage) has no server-side search — its
    // back-office list is small enough to fetch once per open and filter
    // in the browser, never a debounced refetch of the same unfiltered list.
    adminFetch<UserRef[]>('/admin/users')
      .then((res) => setStaff(Array.isArray(res) ? res : []))
      .catch(() => setStaff([]));
  }, [open]);

  const options = q.trim()
    ? staff.filter((u) => personLabel(u).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : [];

  const save = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await adminFetch(`/admin/hr/assets/${assetId}/issue`, { method: 'POST', body: { userId: user.id } });
      onIssued();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not issue this asset');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Issue this asset"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !user} loading={saving}>
            Issue
          </Button>
        </div>
      }
    >
      {error ? (
        <p role="alert" className="notice notice-error mb-3">
          {error}
        </p>
      ) : null}
      {user ? (
        <div className="flex items-center justify-between field-input">
          <span>{personLabel(user)}</span>
          <button type="button" onClick={() => setUser(null)} className="text-xs text-accent-hover hover:underline">
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            className="field-input w-full"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search staff by name or email…"
          />
          {options.length > 0 ? (
            <ul className="mt-2 divide-y divide-neutral-100 rounded border border-neutral-100">
              {options.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setUser(o)}
                    className="w-full p-2 text-start text-sm hover:bg-neutral-50"
                  >
                    {personLabel(o)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </Dialog>
  );
}

function ReturnDialog({
  open,
  onClose,
  assignmentId,
  onReturned,
}: {
  open: boolean;
  onClose: () => void;
  assignmentId: string | null;
  onReturned: () => void;
}) {
  const [condition, setCondition] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCondition('');
      setError(null);
    }
  }, [open]);

  const save = async () => {
    if (!assignmentId) return;
    setSaving(true);
    setError(null);
    try {
      await adminFetch(`/admin/hr/assets/assignments/${assignmentId}/return`, {
        method: 'POST',
        body: { condition: condition || undefined },
      });
      onReturned();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not return this asset');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Return this asset"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !assignmentId} loading={saving}>
            Return
          </Button>
        </div>
      }
    >
      {error ? (
        <p role="alert" className="notice notice-error mb-3">
          {error}
        </p>
      ) : null}
      <label htmlFor="return-condition" className="field-label">
        Condition (optional)
      </label>
      <input
        id="return-condition"
        className="field-input mt-1 w-full"
        value={condition}
        onChange={(e) => setCondition(e.target.value)}
        placeholder="scratched screen, good condition…"
      />
    </Dialog>
  );
}
