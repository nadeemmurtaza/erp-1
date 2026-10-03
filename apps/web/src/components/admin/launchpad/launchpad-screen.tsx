'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LaunchpadAudience, LaunchpadTier, ResolvedLaunchpadApp } from '@newax/shared';
import { Button, EmptyState, PageHeader, Segmented, Skeleton, SkeletonRegion } from '@/components/ui';
import { FilterBar, useFilterParam, useSetFilterParam } from '@/components/ui/filter-bar';
import { RevealScope } from '@/components/ui/reveal-scope';
import { useAdminSession } from '@/components/admin/session';
import { useEnabledModules } from '@/components/admin/deployment-modules';
import { navFor } from '@/components/admin/nav-registry';
import { adminFetch } from '@/lib/admin-client';
import { ROUTES } from '@/constants/routes';
import { AppTile } from './app-tile';
import { ManageApps } from './manage-apps';
import {
  AUDIENCE_LABEL,
  TIER_LABEL,
  audiencesPresent,
  filterTiles,
  tiersPresent,
  tilesFor,
} from './launchpad';

/** Below this many tiles a filter row is more furniture than help (Law 6). */
const FILTER_THRESHOLD = 6;

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4';

/**
 * The launchpad: the apps this person can open, one tile each.
 *
 * Two stages decide a tile (`@newax/shared` launchpad.ts): the server says which
 * apps this deployment and organization show, and `navFor()` — the sidebar's own
 * function — says which of an app's doors this person can reach. An app with no
 * reachable door never renders. The page has one job, opening an app, so its
 * header carries no action.
 */
export function LaunchpadScreen() {
  const session = useAdminSession();
  const enabledModules = useEnabledModules();
  const [apps, setApps] = useState<ResolvedLaunchpadApp[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tierParam = useFilterParam('tier');
  const audienceParam = useFilterParam('audience');
  const setTier = useSetFilterParam('tier');
  const setAudience = useSetFilterParam('audience');

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await adminFetch<{ apps: ResolvedLaunchpadApp[] }>('/launchpad');
      setApps(response.apps);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your apps.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tiles = useMemo(
    () => (apps ? tilesFor(apps, navFor(session.permissions, enabledModules)) : []),
    [apps, session.permissions, enabledModules],
  );

  const tiers = tiersPresent(tiles);
  const audiences = audiencesPresent(tiles);
  // A stale or hand-edited URL value is ignored rather than filtering to nothing.
  const tier = tiers.includes(tierParam as LaunchpadTier) ? (tierParam as LaunchpadTier) : '';
  const audience = audiences.includes(audienceParam as LaunchpadAudience)
    ? (audienceParam as LaunchpadAudience)
    : '';
  const shown = filterTiles(tiles, { tier, audience });
  const showFilters = tiles.length > FILTER_THRESHOLD && (tiers.length > 1 || audiences.length > 1);

  return (
    <>
      <PageHeader title="Apps" description="Everything you can open, in one place." />

      {error ? (
        <div className="notice notice-error flex flex-wrap items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          <span className="flex gap-2">
            <Button variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
            <Link href={ROUTES.admin.dashboard} className="btn-secondary">
              Open the dashboard
            </Link>
          </span>
        </div>
      ) : !apps ? (
        <SkeletonRegion label="Loading your apps…">
          <div className={GRID}>
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        </SkeletonRegion>
      ) : tiles.length === 0 ? (
        <EmptyState
          title="No apps are available to you yet"
          description="Ask an administrator to give you access to the parts of the system you work in."
          action={
            <Link href={ROUTES.admin.account} className="btn-secondary">
              Your account
            </Link>
          }
        />
      ) : (
        <>
          {showFilters ? (
            <FilterBar
              filters={[]}
              trailing={
                <>
                  {tiers.length > 1 ? (
                    <Segmented
                      label="Show apps of kind"
                      value={tier}
                      onChange={(value) => setTier(value || null)}
                      options={[
                        { value: '', label: 'All kinds' },
                        ...tiers.map((value) => ({ value, label: TIER_LABEL[value] })),
                      ]}
                    />
                  ) : null}
                  {audiences.length > 1 ? (
                    <Segmented
                      label="Show apps for"
                      value={audience}
                      onChange={(value) => setAudience(value || null)}
                      options={[
                        { value: '', label: 'All audiences' },
                        ...audiences.map((value) => ({ value, label: AUDIENCE_LABEL[value] })),
                      ]}
                    />
                  ) : null}
                </>
              }
            />
          ) : null}

          {shown.length === 0 ? (
            <EmptyState
              title="No apps match those filters"
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setTier(null);
                    setAudience(null);
                  }}
                >
                  Show every app
                </Button>
              }
            />
          ) : (
            <RevealScope className={GRID}>
              {shown.map((tile) => (
                <AppTile key={tile.app.key} tile={tile} />
              ))}
            </RevealScope>
          )}
        </>
      )}

      {session.can('launchpad.manage') ? <ManageApps onChanged={() => void load()} /> : null}
    </>
  );
}
