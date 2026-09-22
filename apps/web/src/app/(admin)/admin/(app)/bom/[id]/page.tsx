'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { adminFetch, getStoredUser } from '@/lib/admin-client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/utils/cn';
import { PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { RecipeEditor } from '@/components/admin/bom/recipe-editor';
import { CostBreakdown } from '@/components/admin/bom/cost-breakdown';

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
  const canManage = getStoredUser()?.permissions.includes('bom.manage') ?? false;
  const canViewCost = getStoredUser()?.permissions.includes('inventory.view_cost') ?? false;

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
    if (!confirm('Archive this recipe?')) return;
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
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
          {toasts.map((t) => (
            <button
              key={t.id}
              className={cn(
                'w-full cursor-pointer rounded-md border p-4 text-start text-sm shadow-md',
                t.type === 'error'
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-green-200 bg-green-50 text-green-800',
              )}
              type="button"
              onClick={() => removeToast(t.id)}
              aria-label={`Dismiss: ${t.message}`}
            >
              {t.message}
            </button>
          ))}
        </div>
      )}

      <PageHeader
        title={recipe.sku}
        description={`Version ${recipe.version}`}
        context={
          <Link href="/admin/bom" className="hover:text-neutral-900">
            ← Recipes
          </Link>
        }
        action={
          canManage ? (
            <div className="flex items-center gap-3">
              <StatusBadge status={recipe.status} />
              {recipe.status !== 'ACTIVE' ? (
                <button type="button" onClick={() => void activate()} disabled={statusChanging} className="btn-secondary">
                  Activate
                </button>
              ) : null}
              {recipe.status !== 'ARCHIVED' ? (
                <button type="button" onClick={() => void archive()} disabled={statusChanging} className="btn-ghost text-red-700">
                  Archive
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
    </>
  );
}
