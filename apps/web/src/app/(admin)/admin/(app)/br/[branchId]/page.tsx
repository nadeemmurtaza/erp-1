'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import type { MyScope } from '@/types/api';
import { Loading, PageHeader, Section } from '@/components/ui';
import { useAdminSession } from '@/components/admin/session';
import { Select } from '@/components/ui/select';

/**
 * The branch-level dashboard (RETAIL-ERP.md R19) — the leaf. No chips: this
 * is the smallest scope there is, one physical branch, nothing to switch to
 * below it. What's real today: this node's own registry record (WO-18.1),
 * its replication status, and which brand it belongs to (WO-23.3c/e) — not
 * invented sales figures. R19's per-branch P&L is the same Tranche-2
 * dependency the org and brand pages carry.
 */
export default function BranchDashboardPage() {
  const params = useParams<{ branchId: string }>();
  const [scope, setScope] = useState<MyScope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingBrand, setSavingBrand] = useState(false);
  const { can } = useAdminSession();

  const canManage = can('organization.manage');

  const load = useCallback(async () => {
    try {
      const result = await adminFetch<MyScope>('/organization/me/scope');
      setScope(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this branch');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setBrand(retailBrandId: string) {
    setSavingBrand(true);
    setError(null);
    try {
      await adminFetch(`/organization/nodes/${params.branchId}/brand`, {
        method: 'PATCH',
        body: { retailBrandId: retailBrandId || undefined },
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not set this branch’s brand');
    } finally {
      setSavingBrand(false);
    }
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-feedback-negative">
        {error}
      </p>
    );
  }

  if (!scope) return <Loading />;

  const branch = scope.nodes.find((candidate) => candidate.id === params.branchId);

  return (
    <>
      <PageHeader title={branch?.label ?? 'Branch'} />

      <Section title="Node">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-neutral-900/60">Status</dt>
            <dd className="text-neutral-900">{branch?.status ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-900/60">Node id</dt>
            <dd className="text-neutral-900">{branch?.nodeId ?? '—'}</dd>
          </div>
        </dl>
      </Section>

      <Section
        title="Brand"
        description="Which brand this branch belongs to — governs its BrandPolicy checks (branch-local purchasing and the like)."
      >
        {canManage ? (
          <Select
            label="Brand"
            className="max-w-xs"
            value={branch?.retailBrandId ?? ''}
            disabled={savingBrand}
            onChange={(next) => void setBrand(next)}
            options={[{ value: '', label: 'No brand set' }, ...scope.brands.map((candidate) => ({ value: candidate.id, label: candidate.name }))]}
          />
        ) : (
          <p className="text-sm text-neutral-900">
            {scope.brands.find((candidate) => candidate.id === branch?.retailBrandId)?.name ?? 'No brand set'}
          </p>
        )}
      </Section>
    </>
  );
}
