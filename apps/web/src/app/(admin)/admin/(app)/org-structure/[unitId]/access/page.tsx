'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { PERMISSION_CATALOG, formatDate } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { PageHeader, EmptyState, Loading, Dialog, ConfirmDialog } from '@/components/ui';
import { useAdminSession } from '@/components/admin/session';
import { DateField } from '@/components/ui/date-field';

interface PostingAccess {
  userId: string;
  positionTitle: string;
  orgUnitId: string;
  startedOn: string;
}

interface GrantAccess {
  id: string;
  userId: string;
  orgUnitId: string;
  permissionKeys: string[];
  mode: 'READ' | 'ACTING';
  expiresAt: string;
  grantedByUserId: string;
  countersignedByUserId: string | null;
  reason: string;
  revokedAt: string | null;
}

interface AccessResponse {
  postings: PostingAccess[];
  grants: GrantAccess[];
}

interface GrantRefusal {
  code: string;
  message: string;
}

const LABEL_BY_KEY = new Map(PERMISSION_CATALOG.map((permission) => [permission.key as string, permission.label]));

/**
 * access-control-identity/21-access-over-the-org-tree.md WO-21.6 — "one
 * access screen per unit: who reaches this unit, by posting or by grant,
 * with the expiry visible and a revoke action." Reached by clicking
 * "Access" from the org-structure tree (Law 7 — overview first, detail on
 * click), not a separate nav entry.
 */
export default function OrgUnitAccessPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = use(params);
  const { can } = useAdminSession();
  const canGrant = can('org.access.grant');

  const [access, setAccess] = useState<AccessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [issuing, setIssuing] = useState(false);
  const [targetUserId, setTargetUserId] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'READ' | 'ACTING'>('READ');
  const [expiresAt, setExpiresAt] = useState('');
  const [reason, setReason] = useState('');
  const [countersignedByUserId, setCountersignedByUserId] = useState('');
  const [refusals, setRefusals] = useState<GrantRefusal[]>([]);

  const [revoking, setRevoking] = useState<GrantAccess | null>(null);

  const load = () => {
    adminFetch<AccessResponse>(`/admin/org-structure/${unitId}/access`)
      .then(setAccess)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load access for this unit'));
  };

  useEffect(load, [unitId]);

  const issueInput = () => ({
    userId: targetUserId,
    permissionKeys: [...selectedKeys],
    mode,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : '',
    reason,
    countersignedByUserId: mode === 'ACTING' ? countersignedByUserId || undefined : undefined,
  });

  useEffect(() => {
    if (!issuing || !targetUserId || selectedKeys.size === 0 || !expiresAt || !reason.trim()) {
      setRefusals([]);
      return;
    }
    adminFetch<{ refusals: GrantRefusal[] }>(`/admin/org-structure/${unitId}/access/preview`, {
      method: 'POST',
      body: issueInput(),
    })
      .then((res) => setRefusals(res.refusals))
      .catch(() => setRefusals([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issuing, targetUserId, selectedKeys, mode, expiresAt, reason, countersignedByUserId]);

  const toggleKey = (key: string) => {
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedKeys(next);
  };

  const openIssue = () => {
    setTargetUserId('');
    setSelectedKeys(new Set());
    setMode('READ');
    setExpiresAt('');
    setReason('');
    setCountersignedByUserId('');
    setRefusals([]);
    setIssuing(true);
  };

  const submitIssue = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/org-structure/${unitId}/access`, { method: 'POST', body: issueInput() });
      setIssuing(false);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not issue this grant');
    } finally {
      setBusy(false);
    }
  };

  const submitRevoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      await adminFetch(`/admin/org-structure/${unitId}/access/${revoking.id}/revoke`, { method: 'POST' });
      setRevoking(null);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not revoke this grant');
      setRevoking(null);
    } finally {
      setBusy(false);
    }
  };

  if (!access) {
    return error ? (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    ) : (
      <Loading label="Loading access for this unit" />
    );
  }

  const canIssue =
    !!targetUserId && selectedKeys.size > 0 && !!expiresAt && reason.trim().length > 0 && refusals.length === 0;

  return (
    <>
      <PageHeader
        title="Who reaches this unit"
        description="By posting — an open position in or under this unit — or by a time-boxed explicit grant."
        action={
          <Link className="btn-secondary" href={ROUTES.admin.orgStructure}>
            Back to the tree
          </Link>
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="space-y-8">
        <section>
          <h2 className="eyebrow">Postings</h2>
          {access.postings.length === 0 ? (
            <EmptyState title="No open posting reaches this unit" description="Nobody holds a position in this unit or one of its ancestors." />
          ) : (
            <div className="table-flat mt-2">
              {access.postings.map((p) => (
                <div key={`${p.userId}-${p.orgUnitId}`} className="flex justify-between py-2 text-sm">
                  <span>
                    {p.userId} <span className="text-xs text-neutral-900/60">— {p.positionTitle}</span>
                  </span>
                  <span className="text-xs tabular-nums text-neutral-900/60">Since {formatDate(new Date(p.startedOn))}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between">
            <h2 className="eyebrow">Explicit grants</h2>
            {canGrant ? (
              <button className="btn-primary" onClick={openIssue}>
                Issue a grant
              </button>
            ) : null}
          </div>
          {access.grants.length === 0 ? (
            <EmptyState
              title="No active grant over this unit"
              description={canGrant ? 'Issue one for acting cover, an audit, or a temporary need.' : 'Nobody holds view-only visibility here beyond ADMIN.'}
            />
          ) : (
            <div className="table-flat mt-2">
              {access.grants.map((g) => (
                <div key={g.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span className="font-medium text-neutral-900">{g.userId}</span>{' '}
                    <span className="chip">{g.mode}</span>{' '}
                    <span className="text-xs text-neutral-900/60">{g.permissionKeys.map((k) => LABEL_BY_KEY.get(k) ?? k).join(', ')}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs tabular-nums text-neutral-900/60">Expires {formatDate(new Date(g.expiresAt))}</span>
                    {canGrant ? (
                      <button className="btn-text text-red-700" onClick={() => setRevoking(g)}>
                        Revoke
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <Dialog open={issuing} onClose={busy ? () => {} : () => setIssuing(false)} title="Issue an access grant">
        <div className="space-y-3">
          <label className="block">
            <span className="field-label">Recipient — user id</span>
            <input className="field-input w-full" value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} placeholder="user id" />
          </label>

          <fieldset className="space-y-2">
            <legend className="field-label">What it confers</legend>
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {PERMISSION_CATALOG.map((permission) => (
                <li key={permission.key}>
                  <label className="field-check">
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(permission.key)}
                      onChange={() => toggleKey(permission.key)}
                    />
                    <span>{permission.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <label className="field-check">
            <input type="checkbox" checked={mode === 'ACTING'} onChange={(e) => setMode(e.target.checked ? 'ACTING' : 'READ')} />
            <span>Acting — lets the holder approve at the target post&apos;s rank (needs a countersignature)</span>
          </label>

          {mode === 'ACTING' ? (
            <label className="block">
              <span className="field-label">Countersigner — user id, must outrank the recipient</span>
              <input
                className="field-input w-full"
                value={countersignedByUserId}
                onChange={(e) => setCountersignedByUserId(e.target.value)}
              />
            </label>
          ) : null}

          <div>
            <label htmlFor="grant-expires" className="field-label">
              Expires on
            </label>
            <DateField id="grant-expires" value={expiresAt} onChange={setExpiresAt} />
          </div>

          <label className="block">
            <span className="field-label">Reason</span>
            <input className="field-input w-full" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Covering leave, 2 weeks" />
          </label>

          {refusals.length > 0 ? (
            <div className="notice notice-error space-y-1">
              {refusals.map((r) => (
                <p key={r.code}>{r.message}</p>
              ))}
            </div>
          ) : null}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" disabled={busy} onClick={() => setIssuing(false)}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || !canIssue} onClick={submitIssue}>
            Issue
          </button>
        </div>
      </Dialog>

      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        onConfirm={submitRevoke}
        title="Revoke this grant?"
        description="Ends the recipient's explicit access immediately. Anything they already exported stays as it is — this only stops further access."
        confirmLabel="Revoke grant"
        variant="danger"
        busy={busy}
      />
    </>
  );
}
