'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { PageHeader, EmptyState, Loading } from '@/components/ui';
import { useAdminSession } from '@/components/admin/session';

interface EscalationRuleRow {
  id: string;
  sourceType: string;
  afterMinutes: number;
  stepsPerFire: number;
  ceilingRankLevel: number | null;
  maxFires: number;
}

/** tasks-notifications-support/24-internal-notifications-meetings-escalation.md WO-24.6 — which stalled tasks escalate, and how far. */
export default function EscalationRulesPage() {
  const { can } = useAdminSession();
  const canManage = can('notify.escalation.manage');

  const [rules, setRules] = useState<EscalationRuleRow[] | null>(null);
  const [sourceType, setSourceType] = useState('');
  const [afterMinutes, setAfterMinutes] = useState('60');
  const [ceilingRankLevel, setCeilingRankLevel] = useState('');
  const [maxFires, setMaxFires] = useState('3');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => adminFetch<EscalationRuleRow[]>('/admin/notify/escalation-rules').then(setRules).catch(() => setRules([]));

  useEffect(() => {
    if (canManage) load();
  }, [canManage]);

  const create = async () => {
    setError(null);
    setBusy(true);
    try {
      await adminFetch('/admin/notify/escalation-rules', {
        method: 'POST',
        body: {
          sourceType: sourceType.trim(),
          afterMinutes: Number(afterMinutes),
          ceilingRankLevel: ceilingRankLevel.trim() ? Number(ceilingRankLevel) : undefined,
          maxFires: Number(maxFires),
        },
      });
      setSourceType('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create this rule');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await adminFetch(`/admin/notify/escalation-rules/${id}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove this rule');
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) {
    return (
      <>
        <PageHeader title="Escalation rules" description="Which stalled tasks escalate, and how far up the org chart." />
        <p className="notice">You do not hold the permission needed to manage escalation rules.</p>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Escalation rules" description="Which stalled tasks escalate, and how far up the org chart." />

      <div className="card space-y-4">
        <div>
          <label className="field-label" htmlFor="sourceType">Task source type (matches Task.sourceType)</label>
          <input id="sourceType" className="field-input" value={sourceType} onChange={(e) => setSourceType(e.target.value)} placeholder="e.g. requisition" />
        </div>
        <div>
          <label className="field-label" htmlFor="afterMinutes">Fire after this many minutes without a state change</label>
          <input id="afterMinutes" type="number" className="field-input" value={afterMinutes} onChange={(e) => setAfterMinutes(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="ceilingRankLevel">Ceiling rank level (blank = climb to the root)</label>
          <input id="ceilingRankLevel" type="number" className="field-input" value={ceilingRankLevel} onChange={(e) => setCeilingRankLevel(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="maxFires">Maximum fires</label>
          <input id="maxFires" type="number" className="field-input" value={maxFires} onChange={(e) => setMaxFires(e.target.value)} />
        </div>
        {error ? <p className="notice notice-error">{error}</p> : null}
        <button className="btn btn-primary" onClick={create} disabled={busy || !sourceType.trim()}>
          {busy ? <Loading /> : 'Add rule'}
        </button>
      </div>

      {rules === null ? (
        <Loading />
      ) : rules.length === 0 ? (
        <EmptyState title="No escalation rules configured yet" />
      ) : (
        <table className="table-flat w-full text-sm">
          <thead>
            <tr>
              <th>Source type</th>
              <th>After (min)</th>
              <th>Ceiling rank</th>
              <th>Max fires</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td>{rule.sourceType}</td>
                <td className="text-end tabular-nums">{rule.afterMinutes}</td>
                <td className="text-end tabular-nums">{rule.ceilingRankLevel ?? '—'}</td>
                <td className="text-end tabular-nums">{rule.maxFires}</td>
                <td>
                  <button className="btn btn-text" onClick={() => remove(rule.id)} disabled={busy}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
