'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import type { MyScope } from '@/types/api';
import { ROUTES } from '@/constants/routes';
import { Loading, MetricStrip, PageHeader } from '@/components/ui';
import { ScopeChips } from '@/components/admin/scope-chips';

/**
 * The org-level dashboard (RETAIL-ERP.md R19) — brand chips over combined
 * figures. There is one node role that serves this page (ORG), and at most
 * one Organization row in its database (WO-18.3), so `[orgId]` identifies
 * it for the URL's sake (deep-linkable, shareable, back button works — R19)
 * without the backend needing it as a query param: `GET /organization/me/scope`
 * always answers for the one organization the caller's node describes.
 *
 * "Combined figures" is R19's promise once accounting exists (R15 — Tranche
 * 2, unbuilt): org/brand/branch P&L as the same query at three scopes. Not
 * here yet. What's real today: how many brands and branches this
 * organization has — a plain count, not invented revenue.
 */
export default function OrganizationDashboardPage() {
  const params = useParams<{ orgId: string }>();
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
          setError(cause instanceof Error ? cause.message : 'Could not load this organization');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.orgId]);

  if (error) {
    return (
      <p role="alert" className="text-sm text-feedback-negative">
        {error}
      </p>
    );
  }

  if (!scope) return <Loading />;

  return (
    <>
      <PageHeader title={scope.organization?.name ?? 'Organization'} />

      <ScopeChips
        chips={scope.brands.map((brand) => ({
          id: brand.id,
          label: brand.name,
          href: ROUTES.admin.organizationBrand(brand.id),
        }))}
        allHref={ROUTES.admin.organizationOrg(params.orgId)}
      />

      <MetricStrip
        label="Organization summary"
        lead="brands"
        items={[
          { key: 'brands', label: 'Brands', value: String(scope.brands.length) },
          { key: 'nodes', label: 'Branches', value: String(scope.nodes.length) },
        ]}
      />
    </>
  );
}
