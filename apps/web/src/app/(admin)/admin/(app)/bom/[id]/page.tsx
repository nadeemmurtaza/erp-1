'use client';

import { use, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { useToast } from '@/hooks/use-toast';
import { ToastStack } from '@/components/admin/toast-stack';
import { cn } from '@/utils/cn';
import { DangerZone, HoldToConfirm, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { RecipeEditor } from '@/components/admin/bom/recipe-editor';
import { CostBreakdown } from '@/components/admin/bom/cost-breakdown';
import { useAdminSession } from '@/components/admin/session';

interface RecipeSummary {
  id: string;
  sku: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  version: number;
}

interface Availability {
  canProduce: boolean;
  maxRuns: number;
  shortages: Array<{ name: string; sku: string; neededBase: number; availableBase: number; shortfallBase: number }>;
}

export default function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const { can } = useAdminSession();
  const canManage = can('bom.manage');
  const canViewCost = can('inventory.view_cost');

  const [recipe, setRecipe] = useState<RecipeSummary | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusChanging, setStatusChanging] = useState(false);

  function load() {
    Promise.all([
      adminFetch<RecipeSummary>(`/admin/bom/recipes/${id}`),
      adminFetch<Availability>(`/admin/bom/recipes/${id}/availability`),
    ])
      .then(([recipeRes, availabilityRes]) => {
        setRecipe(recipeRes);
        setAvailability(availabilityRes);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load the recipe'))
      .finally(() => setBusy(false));
  }

  useEffect(load, [id]);

  async function activate() {
    setStatusChanging(true);
    try {
      await adminFetch(`/admin/bom/recipes/${id}/activate`, { method: 'POST' });
      addToast('Recipe activated.', 'success');
      load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not activate the recipe', 'error');
    } finally {
      setStatusChanging(false);
    }
  }

  async function archive() {
    setStatusChanging(true);
    try {
      await adminFetch(`/admin/bom/recipes/${id}/archive`, { method: 'POST' });
      addToast('Recipe archived.', 'success');
      load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not archive the recipe', 'error');
    } finally {
      setStatusChanging(false);
    }
  }

  if (busy) {
    return <p className="p-4 text-sm text-neutral-900/60">Loading recipe…</p>;
  }

  if (error && !recipe) {
    return (
      <p role="alert" className="card p-4 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!recipe) return null;

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      <PageHeader
        title={recipe.sku}
        description={`Version ${recipe.version}`}
        action={
          canManage ? (
            <div className="flex items-center gap-3">
              <StatusBadge status={recipe.status} />
              {recipe.status !== 'ACTIVE' ? (
                <button type="button" onClick={() => void activate()} disabled={statusChanging} className="btn-secondary">
                  Activate
                </button>
              ) : null}
            </div>
          ) : (
            <StatusBadge status={recipe.status} />
          )
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {availability ? (
        <div className="mb-6">
          <p className={cn('notice', availability.canProduce ? 'notice-success' : 'notice-info')}>
            {availability.canProduce
              ? `Can be produced now — current stock supports ${availability.maxRuns} run(s).`
              : `Cannot be fully produced right now — ${availability.shortages.length} raw material(s) short.`}
          </p>
          {availability.shortages.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm text-neutral-900/70">
              {availability.shortages.map((shortage) => (
                <li key={shortage.sku}>
                  {shortage.name} ({shortage.sku}): short by {shortage.shortfallBase}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {canViewCost ? (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-medium text-neutral-900">Cost breakdown</h2>
          <CostBreakdown recipeId={id} />
        </div>
      ) : null}

      <h2 className="mb-3 text-lg font-medium text-neutral-900">Edit recipe</h2>
      <RecipeEditor recipeId={id} />

      {/* Archiving lives at the foot of the page, closed, and is confirmed by a hold (DNG-1, DNG-3, DNG-5). */}
      {canManage && recipe.status !== 'ARCHIVED' ? (
        <DangerZone
          className="mt-8"
          actions={[
            {
              id: 'archive',
              title: 'Archive this recipe',
              description: 'It stops appearing as an option for new production runs. Past runs are unaffected.',
              control: (
                <HoldToConfirm onConfirm={archive} loading={statusChanging} loadingLabel="Archiving…">
                  Archive recipe
                </HoldToConfirm>
              ),
            },
          ]}
        />
      ) : null}
    </>
  );
}
