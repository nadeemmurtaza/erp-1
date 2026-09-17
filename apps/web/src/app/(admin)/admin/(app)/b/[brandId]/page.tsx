'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import type { MyScope } from '@/types/api';
import { ROUTES } from '@/constants/routes';
import { Loading, MetricStrip, PageHeader } from '@/components/ui';
import { ScopeChips } from '@/components/admin/scope-chips';

/**
 * The brand-level dashboard (RETAIL-ERP.md R19) — branch chips over that
 * brand's combined figures. `Node` carries no `retailBrandId` (branches are
 * shared infrastructure across a brand's sub-brands, Part 1), so the branch
 * list below is simply every node this actor can see — correct today
 * because nothing in this database's `Node` table belongs to any brand but
 * this one; a second, "100% separate" brand is its own deployment entirely
 * (Part 1), never a second set of rows here.
 */
export default function BrandDashboardPage() {
  const params = useParams<{ brandId: string }>();
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
          setError(cause instanceof Error ? cause.message : 'Could not load this brand');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.brandId]);

  if (error) {
    return (
      <p role="alert" className="text-sm text-feedback-negative">
        {error}
      </p>
    );
  }

  if (!scope) return <Loading />;

  const brand = scope.brands.find((candidate) => candidate.id === params.brandId);

  return (
    <>
      <PageHeader title={brand?.name ?? 'Brand'} />

      <ScopeChips
        chips={scope.nodes.map((node) => ({
          id: node.id,
          label: node.label,
          href: ROUTES.admin.organizationBranch(node.id),
        }))}
        allHref={ROUTES.admin.organizationBrand(params.brandId)}
      />

      <MetricStrip
        label="Brand summary"
        lead="branches"
        items={[{ key: 'nodes', label: 'Branches', value: String(scope.nodes.length) }]}
      />
    </>
  );
}
