'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import type { MyScope } from '@/types/api';
import { ROUTES } from '@/constants/routes';
import { EmptyState, Loading } from '@/components/ui';

/**
 * The three-level admin shell's one entry point (RETAIL-ERP.md R19,
 * WO-18.5). Nobody navigates here with an id in hand — the nav item
 * (nav-registry.ts) just says "Organization" — so this page resolves the
 * caller's own `AdminScope` and redirects to whichever of the three real
 * pages is theirs: the org dashboard for an org-wide grant, their (first)
 * brand for a brand grant, their (first) branch for a branch-only grant.
 *
 * Landing on the "first" of several is a real simplification — a user
 * holding grants on two different brands has no way to choose here yet.
 * Not attempted: nobody today can hold more than one grant, since nothing
 * writes an AdminScope row at all (WO-18.3 shipped the table, not an admin
 * screen to grant from). Worth a picker once that exists.
 */
export default function OrganizationLandingPage() {
  const router = useRouter();
  const [scope, setScope] = useState<MyScope | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    adminFetch<MyScope>('/organization/me/scope')
      .then((result) => {
        if (cancelled) return;
        // `level`, never brands.length/nodes.length — brands is widened to
        // include a BRANCH grant's own parent brand for breadcrumb
        // visibility, so it is non-empty even for a BRANCH-level actor. See
        // MyScope's own doc comment.
        if (result.level === 'ORG' && result.organization) {
          router.replace(ROUTES.admin.organizationOrg(result.organization.id));
        } else if (result.level === 'BRAND' && result.brands.length > 0) {
          router.replace(ROUTES.admin.organizationBrand(result.brands[0].id));
        } else if (result.level === 'BRANCH' && result.nodes.length > 0) {
          router.replace(ROUTES.admin.organizationBranch(result.nodes[0].id));
        } else {
          setScope(result);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not resolve your scope');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return (
      <p role="alert" className="text-sm text-feedback-negative">
        {error}
      </p>
    );
  }

  // scope is only ever set here when there was nowhere to redirect to.
  if (!scope) return <Loading />;

  return (
    <EmptyState
      title="No organization scope yet"
      description="Your account has no brand or branch assigned. Ask a super admin to grant you one."
    />
  );
}
