'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatDate } from '@newax/shared';
import { PageHeader, Section, DataTable, EmptyState, Dialog, ConfirmDialog, Button } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { useAdminSession } from '@/components/admin/session';
import { adminFetch } from '@/lib/admin-client';
import { DateField } from '@/components/ui/date-field';

interface FiscalYear {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  closedAt: string | null;
}

interface FiscalPeriod {
  id: string;
  fiscalYearId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: 'OPEN' | 'CLOSED' | 'LOCKED';
}

/**
 * 04-finance.md WO-4.6 — the ledger's own `FiscalPeriod` open/close/reopen/
 * lock already had a full API (`FiscalPeriodsController`) with no admin
 * screen anywhere; this is that screen. Reads sit behind `accounting.view`
 * (the nav entry); every write below is additionally gated behind
 * `accounting.manage_periods` (`session.can`), matching the controller's own
 * split — a caller who can only view the calendar never sees an action they
 * would be refused server-side anyway (design law PRM-2: hide, don't grey).
 */
export default function FiscalPeriodsPage() {
  const session = useAdminSession();
  const canManage = session.can('accounting.manage_periods');

  const [years, setYears] = useState<FiscalYear[] | null>(null);
  const [periods, setPeriods] = useState<FiscalPeriod[] | null>(null);
  const [selectedYearId, setSelectedYearId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const loadYears = () => {
    adminFetch<{ data: FiscalYear[] }>('/admin/accounting/fiscal-years')
      .then((res) => setYears(res.data))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load fiscal years'));
  };

  const loadPeriods = (fiscalYearId: string) => {
    adminFetch<{ data: FiscalPeriod[] }>('/admin/accounting/fiscal-periods', {
      query: fiscalYearId ? { fiscalYearId } : undefined,
    })
      .then((res) => setPeriods(res.data))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load fiscal periods'));
  };

  useEffect(loadYears, []);

  // Default the period filter to the most recent fiscal year once years load.
  useEffect(() => {
    if (years && years.length > 0 && !selectedYearId) {
      setSelectedYearId(years[0]!.id);
    }
  }, [years, selectedYearId]);

  useEffect(() => {
    setPeriods(null);
    loadPeriods(selectedYearId);
  }, [selectedYearId]);

  const selectedYear = useMemo(() => years?.find((y) => y.id === selectedYearId) ?? null, [years, selectedYearId]);

  const [newYearOpen, setNewYearOpen] = useState(false);
  const [newPeriodOpen, setNewPeriodOpen] = useState(false);
  const [closingYear, setClosingYear] = useState<FiscalYear | null>(null);
  const [lockingPeriod, setLockingPeriod] = useState<FiscalPeriod | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refreshAll = () => {
    loadYears();
    loadPeriods(selectedYearId);
  };

  const closePeriod = async (period: FiscalPeriod) => {
    setBusyId(period.id);
    setError(null);
    try {
      await adminFetch(`/admin/accounting/fiscal-periods/${period.id}/close`, { method: 'POST' });
      loadPeriods(selectedYearId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not close the period');
    } finally {
      setBusyId(null);
    }
  };

  const reopenPeriod = async (period: FiscalPeriod) => {
    setBusyId(period.id);
    setError(null);
    try {
      await adminFetch(`/admin/accounting/fiscal-periods/${period.id}/reopen`, { method: 'POST' });
      loadPeriods(selectedYearId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reopen the period');
    } finally {
      setBusyId(null);
    }
  };

  const lockPeriod = async () => {
    if (!lockingPeriod) return;
    setBusyId(lockingPeriod.id);
    setError(null);
    try {
      await adminFetch(`/admin/accounting/fiscal-periods/${lockingPeriod.id}/lock`, { method: 'POST' });
      setLockingPeriod(null);
      loadPeriods(selectedYearId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not lock the period');
    } finally {
      setBusyId(null);
    }
  };

  const closeYear = async () => {
    if (!closingYear) return;
    setBusyId(closingYear.id);
    setError(null);
    try {
      await adminFetch(`/admin/accounting/fiscal-years/${closingYear.id}/close`, { method: 'POST' });
      setClosingYear(null);
      refreshAll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not close the fiscal year');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Fiscal periods"
        description="The calendar that governs when a posting is allowed — open, close, reopen and lock."
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <Section
        title="Fiscal years"
        action={
          canManage ? (
            <Button variant="secondary" onClick={() => setNewYearOpen(true)}>
              New fiscal year
            </Button>
          ) : undefined
        }
      >
        {years && years.length === 0 ? (
          <EmptyState
            title="No fiscal year yet"
            description="Open one to start posting journal entries into a named period."
            action={
              canManage ? (
                <Button onClick={() => setNewYearOpen(true)}>New fiscal year</Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            rows={years}
            loading={!years}
            emptyLabel="No fiscal years found."
            rowKey={(y) => y.id}
            isRowSelected={(y) => y.id === selectedYearId}
            onRowClick={(y) => setSelectedYearId(y.id)}
            columns={[
              { header: 'Name', cell: (y) => y.name },
              { header: 'Starts', cell: (y) => formatDate(y.startsOn), muted: true },
              { header: 'Ends', cell: (y) => formatDate(y.endsOn), muted: true },
              {
                header: 'Status',
                cell: (y) => (y.closedAt ? <StatusBadge status="CLOSED" /> : <StatusBadge status="OPEN" label="Open" />),
              },
              {
                header: '',
                align: 'end',
                cell: (y) =>
                  canManage && !y.closedAt ? (
                    <Button
                      variant="danger"
                      onClick={(event) => {
                        event.stopPropagation();
                        setClosingYear(y);
                      }}
                    >
                      Close year
                    </Button>
                  ) : null,
              },
            ]}
          />
        )}
      </Section>

      <Section
        title={`Fiscal periods${selectedYear ? ` — ${selectedYear.name}` : ''}`}
        action={
          canManage && selectedYearId ? (
            <Button variant="secondary" onClick={() => setNewPeriodOpen(true)}>
              New period
            </Button>
          ) : undefined
        }
      >
        {!years || years.length === 0 ? (
          <EmptyState title="Open a fiscal year first" description="A period belongs to a fiscal year." />
        ) : periods && periods.length === 0 ? (
          <EmptyState
            title="No periods in this fiscal year"
            description="Open one — e.g. a calendar month — to let postings land in it."
            action={canManage ? <Button onClick={() => setNewPeriodOpen(true)}>New period</Button> : undefined}
          />
        ) : (
          <DataTable
            rows={periods}
            loading={!periods}
            emptyLabel="No fiscal periods found."
            rowKey={(p) => p.id}
            columns={[
              { header: 'Name', cell: (p) => p.name },
              { header: 'Starts', cell: (p) => formatDate(p.startsOn), muted: true },
              { header: 'Ends', cell: (p) => formatDate(p.endsOn), muted: true },
              { header: 'Status', cell: (p) => <StatusBadge status={p.status} label={STATUS_LABEL[p.status]} /> },
              {
                header: '',
                align: 'end',
                cell: (p) => {
                  if (!canManage) return null;
                  const busy = busyId === p.id;
                  if (p.status === 'OPEN') {
                    return (
                      <Button variant="secondary" onClick={() => closePeriod(p)} loading={busy}>
                        Close
                      </Button>
                    );
                  }
                  if (p.status === 'CLOSED') {
                    return (
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => reopenPeriod(p)} loading={busy}>
                          Reopen
                        </Button>
                        <Button variant="danger" onClick={() => setLockingPeriod(p)} disabled={busy}>
                          Lock
                        </Button>
                      </div>
                    );
                  }
                  return null;
                },
              },
            ]}
          />
        )}
      </Section>

      <NewFiscalYearDialog open={newYearOpen} onClose={() => setNewYearOpen(false)} onCreated={refreshAll} />
      <NewFiscalPeriodDialog
        open={newPeriodOpen}
        onClose={() => setNewPeriodOpen(false)}
        onCreated={() => loadPeriods(selectedYearId)}
        fiscalYears={years ?? []}
        defaultFiscalYearId={selectedYearId}
      />

      <ConfirmDialog
        open={closingYear !== null}
        onClose={() => setClosingYear(null)}
        onConfirm={closeYear}
        title={closingYear ? `Close ${closingYear.name}?` : 'Close fiscal year?'}
        description="Zeros every income and expense account's activity for the year into Retained Earnings with one posted journal entry, then marks the year closed. Every period in the year must already be closed or locked. This cannot be undone."
        confirmLabel="Close year"
        typeToConfirm={closingYear?.name}
        busy={busyId === closingYear?.id}
      />

      <ConfirmDialog
        open={lockingPeriod !== null}
        onClose={() => setLockingPeriod(null)}
        onConfirm={lockPeriod}
        title={lockingPeriod ? `Lock ${lockingPeriod.name}?` : 'Lock period?'}
        description="Refuses every posting into this period from now on, including a late fact backdated into it. A locked period can never be reopened."
        confirmLabel="Lock period"
        typeToConfirm={lockingPeriod?.name}
        busy={busyId === lockingPeriod?.id}
      />
    </>
  );
}

const STATUS_LABEL: Record<FiscalPeriod['status'], string> = {
  OPEN: 'Open',
  CLOSED: 'Closed',
  LOCKED: 'Locked',
};

function NewFiscalYearDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setStartsOn('');
      setEndsOn('');
      setError(null);
    }
  }, [open]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminFetch('/admin/accounting/fiscal-years', { method: 'POST', body: { name, startsOn, endsOn } });
      onCreated();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the fiscal year');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Open a fiscal year"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !name || !startsOn || !endsOn} loading={saving}>
            Open
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
          <label htmlFor="fy-name" className="field-label">
            Name
          </label>
          <input
            id="fy-name"
            className="field-input mt-1 w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="FY2026"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="fy-starts" className="field-label">
              Starts on
            </label>
            <DateField id="fy-starts" className="mt-1" value={startsOn} onChange={setStartsOn} />
          </div>
          <div className="flex-1">
            <label htmlFor="fy-ends" className="field-label">
              Ends on
            </label>
            <DateField id="fy-ends" className="mt-1" value={endsOn} onChange={setEndsOn} />
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function NewFiscalPeriodDialog({
  open,
  onClose,
  onCreated,
  fiscalYears,
  defaultFiscalYearId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  fiscalYears: FiscalYear[];
  defaultFiscalYearId: string;
}) {
  const [fiscalYearId, setFiscalYearId] = useState(defaultFiscalYearId);
  const [name, setName] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFiscalYearId(defaultFiscalYearId);
      setName('');
      setStartsOn('');
      setEndsOn('');
      setError(null);
    }
  }, [open, defaultFiscalYearId]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminFetch('/admin/accounting/fiscal-periods', {
        method: 'POST',
        body: { fiscalYearId, name, startsOn, endsOn },
      });
      onCreated();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the period');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Open a fiscal period"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !fiscalYearId || !name || !startsOn || !endsOn} loading={saving}>
            Open
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
          <label htmlFor="fp-year" className="field-label">
            Fiscal year
          </label>
          <select
            id="fp-year"
            className="field-input mt-1 w-full"
            value={fiscalYearId}
            onChange={(e) => setFiscalYearId(e.target.value)}
          >
            {fiscalYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fp-name" className="field-label">
            Name
          </label>
          <input
            id="fp-name"
            className="field-input mt-1 w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="2026-01"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="fp-starts" className="field-label">
              Starts on
            </label>
            <DateField id="fp-starts" className="mt-1" value={startsOn} onChange={setStartsOn} />
          </div>
          <div className="flex-1">
            <label htmlFor="fp-ends" className="field-label">
              Ends on
            </label>
            <DateField id="fp-ends" className="mt-1" value={endsOn} onChange={setEndsOn} />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
