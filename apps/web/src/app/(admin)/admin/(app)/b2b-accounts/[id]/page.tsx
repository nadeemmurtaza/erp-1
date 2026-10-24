'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { PageHeader, Loading, Section } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';

interface ContactOption {
  id: string;
  name: string;
  phoneE164: string | null;
}

interface B2BAccountDetail {
  id: string;
  customerId: string;
  isActive: boolean;
  requiresPurchaseOrder: boolean;
  approvalPolicy: { thresholdMinor: number; approverContactIds: string[] } | null;
}

/**
 * 149-b2b-accounts-approvals-sector-packs.md (WO-149.4) — the staff side of
 * setting an account's approval policy. The buyer's own portal
 * (/account/b2b) is the intended, everyday place to edit it (this doc's own
 * "Authority and blast radius" — the buyer's own contact, not this
 * organization's staff, decides who among their staff may approve); this
 * screen exists for initial setup and for a deployment with no live portal
 * yet, so the capability is never backend-only.
 */
export default function B2BAccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [account, setAccount] = useState<B2BAccountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [threshold, setThreshold] = useState('');
  const [approvers, setApprovers] = useState<ContactOption[]>([]);
  const [q, setQ] = useState('');
  const [options, setOptions] = useState<ContactOption[]>([]);

  const load = () => {
    adminFetch<B2BAccountDetail>(`/admin/accounts/b2b/${id}`)
      .then(async (res) => {
        setAccount(res);
        if (res.approvalPolicy) {
          setThreshold(String(Math.round(res.approvalPolicy.thresholdMinor / 100)));
          const contacts = await Promise.all(
            res.approvalPolicy.approverContactIds.map((cid) =>
              adminFetch<ContactOption>(`/admin/crm/contacts/${cid}`).catch(() => null),
            ),
          );
          setApprovers(contacts.filter((c): c is ContactOption => c !== null));
        }
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load this account'));
  };

  useEffect(load, [id]);

  useEffect(() => {
    if (!q.trim()) {
      setOptions([]);
      return;
    }
    const timer = setTimeout(() => {
      adminFetch<{ data: ContactOption[] }>('/admin/crm/contacts', { query: { q, pageSize: 5 } })
        .then((res) => setOptions(res.data.filter((o) => !approvers.some((a) => a.id === o.id))))
        .catch(() => setOptions([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [q, approvers]);

  const savePolicy = async () => {
    const thresholdMinor = Math.round(parseFloat(threshold) * 100);
    if (Number.isNaN(thresholdMinor) || thresholdMinor < 0 || approvers.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await adminFetch(`/admin/accounts/b2b/${id}/approval-policy`, {
        method: 'POST',
        body: { thresholdMinor, approverContactIds: approvers.map((a) => a.id) },
      });
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the approval policy');
    } finally {
      setSaving(false);
    }
  };

  if (!account) {
    return (
      <>
        <PageHeader title="B2B Account" description="Loading…" />
        <Loading />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="B2B Account"
        description="This account's own purchase-approval policy — the buyer's own internal control, held on their behalf."
      />
      <p className="mb-6">
        <Link href="/admin/b2b-accounts" className="text-sm text-accent-hover hover:underline">
          ← All B2B accounts
        </Link>
      </p>

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <Section title="Status">
        <p className="flex items-center gap-2">
          {account.isActive ? <StatusBadge status="ACTIVE" label="Active" /> : <StatusBadge status="CANCELLED" label="Inactive" />}
          {account.requiresPurchaseOrder ? <span className="text-sm text-neutral-900/60">Requires a purchase-order reference</span> : null}
        </p>
      </Section>

      <Section title="Approval policy">
        <div className="card p-6 space-y-4 max-w-md">
          <div>
            <label htmlFor="threshold" className="mb-1 block text-sm font-medium text-neutral-900">
              Orders at or above this amount need approval
            </label>
            <input
              id="threshold"
              type="number"
              min="0"
              step="0.01"
              className="field-input w-full"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-neutral-900">Approvers — any one of these buyer contacts may decide</span>
            <ul className="mb-2 space-y-1">
              {approvers.map((a) => (
                <li key={a.id} className="flex items-center justify-between field-input">
                  <span>
                    {a.name} {a.phoneE164 ? `· ${a.phoneE164}` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => setApprovers(approvers.filter((x) => x.id !== a.id))}
                    className="text-xs text-accent-hover hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <input
              className="field-input w-full"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search the buyer's own contacts to add as an approver..."
            />
            {options.length > 0 ? (
              <ul className="mt-2 divide-y divide-neutral-100 rounded border border-neutral-100">
                {options.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setApprovers([...approvers, o]);
                        setQ('');
                        setOptions([]);
                      }}
                      className="w-full p-2 text-start text-sm hover:bg-neutral-50"
                    >
                      {o.name} {o.phoneE164 ? `· ${o.phoneE164}` : ''}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <button onClick={savePolicy} disabled={saving || !threshold || approvers.length === 0} className="btn-primary">
            Save policy
          </button>
        </div>
      </Section>
    </>
  );
}
