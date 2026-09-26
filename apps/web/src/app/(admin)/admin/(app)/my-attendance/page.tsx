'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { formatDateTime } from '@newax/shared';
import { PageHeader, EmptyState, Loading } from '@/components/ui';

interface AttendanceEvent {
  id: string;
  kind: 'IN' | 'OUT' | 'BREAK_START' | 'BREAK_END' | 'ADJUSTMENT';
  occurredAt: string;
  orgUnitId: string;
}

const KIND_LABEL: Record<AttendanceEvent['kind'], string> = {
  IN: 'Clocked in',
  OUT: 'Clocked out',
  BREAK_START: 'Break started',
  BREAK_END: 'Break ended',
  ADJUSTMENT: 'Adjusted',
};

/**
 * attendance-workforce/22-attendance-shifts-leave.md — "Solo: self punch on
 * one screen, no devices, no roster." No permission required beyond being
 * signed in (nav-registry.ts's own `my-attendance` entry). A punch here is
 * never refused — whatever does not fit becomes an exception a reconciler
 * (a different screen, a different permission) clears later.
 */
export default function MyAttendancePage() {
  const [events, setEvents] = useState<AttendanceEvent[] | null>(null);
  const [orgUnitId, setOrgUnitId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    adminFetch<AttendanceEvent[]>(`/admin/attendance/events?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then((rows) => {
        setEvents(rows);
        if (!orgUnitId && rows.length > 0) setOrgUnitId(rows[0].orgUnitId);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load your attendance'));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- load-once on mount; orgUnitId is set BY this call, so including it would loop.
  useEffect(load, []);

  const punch = async (kind: AttendanceEvent['kind']) => {
    if (!orgUnitId.trim()) {
      setError('Enter your org unit once — it is remembered for next time from your last punch.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adminFetch('/admin/attendance/punch', {
        method: 'POST',
        body: {
          kind,
          occurredAt: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          orgUnitId,
        },
      });
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record this punch');
    } finally {
      setBusy(false);
    }
  };

  if (!events) {
    return error ? (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    ) : (
      <Loading label="Loading your attendance" />
    );
  }

  return (
    <>
      <PageHeader title="My attendance" description="Punch in and out — every punch is recorded, whatever the roster says." />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {events.length === 0 ? (
        <label className="mb-4 block max-w-xs">
          <span className="field-label">Org unit</span>
          <input className="field-input w-full" value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)} placeholder="org unit id" />
        </label>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button className="btn-primary" disabled={busy} onClick={() => punch('IN')}>
          Clock in
        </button>
        <button className="btn-secondary" disabled={busy} onClick={() => punch('OUT')}>
          Clock out
        </button>
        <button className="btn-secondary" disabled={busy} onClick={() => punch('BREAK_START')}>
          Start break
        </button>
        <button className="btn-secondary" disabled={busy} onClick={() => punch('BREAK_END')}>
          End break
        </button>
      </div>

      <div className="mt-8">
        <h2 className="eyebrow">Last 7 days</h2>
        {events.length === 0 ? (
          <EmptyState title="No punches yet" description="Clock in above to record your first one." />
        ) : (
          <div className="table-flat mt-2">
            {events
              .slice()
              .reverse()
              .map((event) => (
                <div key={event.id} className="flex justify-between py-2 text-sm">
                  <span>{KIND_LABEL[event.kind]}</span>
                  <span className="tabular-nums text-neutral-900/60">{formatDateTime(new Date(event.occurredAt))}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </>
  );
}
