'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { formatDateTime } from '@newax/shared';
import { PageHeader, EmptyState, Loading, Dialog, Disclosure } from '@/components/ui';
import { useAdminSession } from '@/components/admin/session';

interface AttendanceException {
  id: string;
  eventId: string;
  eventOccurredAt: string;
  userId: string;
  orgUnitId: string;
  reason:
    | 'NO_MATCHING_SHIFT'
    | 'OUTSIDE_ROSTER'
    | 'WRONG_UNIT'
    | 'WHILE_ON_LEAVE'
    | 'DUPLICATE_SUSPECTED'
    | 'MISSING_COUNTERPART';
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  note: string | null;
}

const REASON_LABEL: Record<AttendanceException['reason'], string> = {
  NO_MATCHING_SHIFT: 'No matching shift',
  OUTSIDE_ROSTER: 'Outside the roster window',
  WRONG_UNIT: 'Wrong unit',
  WHILE_ON_LEAVE: 'Punched while on leave',
  DUPLICATE_SUSPECTED: 'Duplicate suspected',
  MISSING_COUNTERPART: 'Missing counterpart',
};

/**
 * attendance-workforce/22-attendance-shifts-leave.md WO-22.5 — the queue
 * that makes "a punch is never refused" safe. Every punch that does not fit
 * the roster lands here, never dropped, never silently coerced onto the
 * nearest shift.
 */
export default function AttendancePage() {
  const { can } = useAdminSession();
  const canReconcile = can('hr.attendance.reconcile');

  const [exceptions, setExceptions] = useState<AttendanceException[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [resolving, setResolving] = useState<AttendanceException | null>(null);
  const [note, setNote] = useState('');

  const load = () => {
    adminFetch<AttendanceException[]>('/admin/attendance/exceptions?resolved=false')
      .then(setExceptions)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load attendance exceptions'));
  };

  useEffect(load, []);

  const [resolved, setResolved] = useState<AttendanceException[]>([]);
  useEffect(() => {
    if (!canReconcile) return;
    adminFetch<AttendanceException[]>('/admin/attendance/exceptions?resolved=true').then(setResolved).catch(() => undefined);
  }, [canReconcile]);

  const submitResolve = async () => {
    if (!resolving) return;
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/attendance/exceptions/${resolving.id}/resolve`, { method: 'POST', body: { note: note || undefined } });
      setResolving(null);
      setNote('');
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not resolve this exception');
    } finally {
      setBusy(false);
    }
  };

  if (!exceptions) {
    return error ? (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    ) : (
      <Loading label="Loading attendance exceptions" />
    );
  }

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Every punch that did not fit a shift — never dropped, cleared by a human here."
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {exceptions.length === 0 ? (
        <EmptyState title="No open exceptions" description="Every recent punch matched its shift." />
      ) : (
        <div className="table-flat">
          {exceptions.map((exc) => (
            <div key={exc.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div>
                <span className="font-medium text-neutral-900">{exc.userId}</span>{' '}
                <span className="chip">{REASON_LABEL[exc.reason]}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs tabular-nums text-neutral-900/60">{formatDateTime(new Date(exc.eventOccurredAt))}</span>
                {canReconcile ? (
                  <button
                    className="btn-text"
                    onClick={() => {
                      setResolving(exc);
                      setNote('');
                    }}
                  >
                    Resolve
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {canReconcile && resolved.length > 0 ? (
        <Disclosure label={`Resolved · ${resolved.length}`} className="mt-6">
          <div className="table-flat">
            {resolved.map((exc) => (
              <div key={exc.id} className="flex items-center justify-between py-2 text-sm text-neutral-900/60">
                <span>
                  {exc.userId} <span className="text-xs">({REASON_LABEL[exc.reason]})</span>
                </span>
                <span className="text-xs">{exc.resolvedAt ? formatDateTime(new Date(exc.resolvedAt)) : ''}</span>
              </div>
            ))}
          </div>
        </Disclosure>
      ) : null}

      <Dialog open={resolving !== null} onClose={busy ? () => {} : () => setResolving(null)} title="Resolve this exception">
        <p className="text-sm text-neutral-900/70">
          {resolving ? `${resolving.userId} — ${REASON_LABEL[resolving.reason]}` : ''}
        </p>
        <label className="mt-3 block">
          <span className="field-label">Note (optional)</span>
          <input className="field-input w-full" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Linked to the 9am shift" />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" disabled={busy} onClick={() => setResolving(null)}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy} onClick={submitResolve}>
            Resolve
          </button>
        </div>
      </Dialog>
    </>
  );
}
