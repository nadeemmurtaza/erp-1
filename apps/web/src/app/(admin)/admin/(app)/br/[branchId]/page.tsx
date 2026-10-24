'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import type { MyScope } from '@/types/api';
import { Loading, PageHeader, Section } from '@/components/ui';

/**
 * The branch-level dashboard (RETAIL-ERP.md R19) — the leaf. No chips: this
 * is the smallest scope there is, one physical branch, nothing to switch to
 * below it. What's real today: this node's own registry record (WO-18.1)
 * and its replication status — not invented sales figures. R19's per-branch
 * P&L is the same Tranche-2 dependency the org and brand pages carry.
 */
export default function BranchDashboardPage() {
  const params = useParams<{ branchId: string }>();
  const [scope, setScope] = useState<MyScope | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch<MyScope>('/organization/me/scope')
      .then((result) => {
        if (!cancelled) setScope(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load this branch');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.branchId]);

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
    </>
  );
}
