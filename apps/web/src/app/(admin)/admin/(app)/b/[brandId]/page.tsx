'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import type { BrandPolicy, MyScope, UpdateBrandPolicyInput } from '@/types/api';
import { ROUTES } from '@/constants/routes';
import { Loading, MetricStrip, PageHeader, Section } from '@/components/ui';
import { ScopeChips } from '@/components/admin/scope-chips';
import { useAdminSession } from '@/components/admin/session';

const POLICY_SWITCHES: Array<{ key: keyof UpdateBrandPolicyInput; label: string; description: string }> = [
  {
    key: 'allowBranchLocalPurchasing',
    label: 'Branch-local purchasing',
    description: 'Let a branch admin create purchase orders scoped to their own branch, instead of only at brand scope.',
  },
  {
    key: 'allowBranchProductCreation',
    label: 'Branch product creation',
    description: 'Let a branch admin add products that belong to their own branch.',
  },
  {
    key: 'allowInterBranchTransfers',
    label: 'Inter-branch transfers',
    description: 'Let stock transfer directly between this brand’s own branches.',
  },
];

/**
 * The three branch policy switches (WO-23.3b, RETAIL-ERP.md R9/R13) — read
 * for anyone whose scope reaches this brand, editable only for a holder of
 * `organization.manage` (PRM-2: disabled with a reason, not hidden, since
 * a brand-scope actor without the permission should still see the current
 * state). A `null` GET result (no row yet) reads as every switch off — the
 * same default the API itself falls back to.
 */
function BrandPolicySection({ brandId, canManage }: { brandId: string; canManage: boolean }) {
  const [policy, setPolicy] = useState<BrandPolicy | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<keyof UpdateBrandPolicyInput | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch<BrandPolicy | null>(`/organization/brands/${brandId}/policy`)
      .then((result) => {
        if (!cancelled) setPolicy(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load this brand’s policy');
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  const toggle = async (key: keyof UpdateBrandPolicyInput, next: boolean) => {
    setSavingKey(key);
    setError(null);
    try {
      const updated = await adminFetch<BrandPolicy>(`/organization/brands/${brandId}/policy`, {
        method: 'PATCH',
        body: JSON.stringify({ [key]: next }),
      });
      setPolicy(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save that change');
    } finally {
      setSavingKey(null);
    }
  };

  if (error) {
    return (
      <Section title="Branch policy">
        <p role="alert" className="text-sm text-feedback-negative">
          {error}
        </p>
      </Section>
    );
  }

  if (policy === undefined) return <Loading />;

  return (
    <Section title="Branch policy" description="What this brand's own branches may do on their own, without asking the brand.">
      <ul className="flex flex-col gap-3">
        {POLICY_SWITCHES.map((item) => (
          <li key={item.key}>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={policy?.[item.key] ?? false}
                disabled={!canManage || savingKey !== null}
                onChange={(event) => void toggle(item.key, event.target.checked)}
                className="field-check mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-sm text-neutral-900">{item.label}</span>
                <span className="block text-sm text-neutral-900/60">{item.description}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {!canManage ? (
        <p className="mt-3 text-sm text-neutral-900/60">
          Read-only — changing this needs the organization.manage permission.
        </p>
      ) : null}
    </Section>
  );
}

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
  const { can } = useAdminSession();
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
  const canManage = can('organization.manage');

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

      <BrandPolicySection brandId={params.brandId} canManage={canManage} />
    </>
  );
}
