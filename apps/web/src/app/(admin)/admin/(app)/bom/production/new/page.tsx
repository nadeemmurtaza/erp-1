'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import { useToast } from '@/hooks/use-toast';
import { ToastStack } from '@/components/admin/toast-stack';
import { cn } from '@/utils/cn';
import { PageHeader } from '@/components/ui';
import { Select } from '@/components/ui/select';

interface RecipeOption {
  id: string;
  sku: string;
  outputQuantity: number;
}

interface Availability {
  canProduce: boolean;
  maxRuns: number;
  shortages: Array<{ name: string; sku: string; neededBase: number; availableBase: number; shortfallBase: number }>;
}

/**
 * Recording a run consumes real raw stock and credits real finished stock —
 * repeatable, but not undoable from here (a correction is a reversing
 * inventory adjustment). The confirm step exists because of that, not as
 * decoration.
 */
export default function NewProductionRunPage() {
  const router = useRouter();
  const { toasts, add: addToast, remove: removeToast } = useToast();

  const [recipes, setRecipes] = useState<RecipeOption[]>([]);
  const [recipeId, setRecipeId] = useState('');
  const [runs, setRuns] = useState('1');
  const [notes, setNotes] = useState('');
  const [outputLotCode, setOutputLotCode] = useState('');
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<{ data: RecipeOption[] }>('/admin/bom/recipes', { query: { filter: 'active', pageSize: 200 } })
      .then((result) => setRecipes(result.data))
      .catch(() => addToast('Could not load recipes.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setAvailability(null);
    setConfirming(false);
    if (!recipeId) return;
    const recipe = recipes.find((r) => r.id === recipeId);
    const quantity = (Number(runs) || 1) * (recipe?.outputQuantity ?? 1);
    adminFetch<Availability>(`/admin/bom/recipes/${recipeId}/availability`, { query: { quantity } })
      .then(setAvailability)
      .catch(() => setAvailability(null));
  }, [recipeId, runs, recipes]);

  async function record() {
    setSubmitting(true);
    setError(null);
    try {
      const created = await adminFetch<{ id: string }>('/admin/bom/production-runs', {
        method: 'POST',
        body: {
          recipeId,
          runs: Math.max(1, Math.round(Number(runs) || 1)),
          notes: notes.trim() || undefined,
          outputLotCode: outputLotCode.trim() || undefined,
        },
      });
      addToast('Production run recorded.', 'success');
      router.push(`/admin/bom/production/${created.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record the production run');
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!recipeId) {
      addToast('Choose a recipe first.', 'error');
      return;
    }
    setConfirming(true);
  }

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      <PageHeader title="Record a production run" description="Consumes raw stock and credits finished stock." />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <form onSubmit={submit} className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label htmlFor="production-recipe" className="field-label">
            Recipe
          </label>
          <Select
            id="production-recipe"
            label="Recipe"
            required
            placeholder="Choose…"
            value={recipeId}
            onChange={setRecipeId}
            options={recipes.map((recipe) => ({ value: recipe.id, label: recipe.sku }))}
          />
        </div>
        <label className="block">
          <span className="field-label">Runs</span>
          <input
            type="number"
            min="1"
            step="1"
            value={runs}
            onChange={(event) => setRuns(event.target.value)}
            className="field-input"
          />
        </label>
        <label className="block lg:col-span-2">
          <span className="field-label">Output batch/lot code (optional)</span>
          <input
            value={outputLotCode}
            onChange={(event) => setOutputLotCode(event.target.value)}
            className="field-input"
            placeholder="Defaults to this run's own number"
          />
        </label>
        <label className="block lg:col-span-4">
          <span className="field-label">Notes</span>
          <input value={notes} onChange={(event) => setNotes(event.target.value)} className="field-input" />
        </label>

        {availability ? (
          <div className="lg:col-span-4">
            <p className={cn('notice', availability.canProduce ? 'notice-success' : 'notice-info')}>
              {availability.canProduce
                ? `Stock covers this run — up to ${availability.maxRuns} run(s) available.`
                : `Not enough raw stock for this run — ${availability.shortages.length} material(s) short.`}
            </p>
            {availability.shortages.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm text-neutral-900/70">
                {availability.shortages.map((shortage) => (
                  <li key={shortage.sku}>
                    {shortage.name} ({shortage.sku}): needs {shortage.neededBase}, has {shortage.availableBase}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-end lg:col-span-4">
          <button type="submit" disabled={submitting} className="btn-primary">
            Continue
          </button>
        </div>
      </form>

      {confirming ? (
        <div className="card mt-6 p-4">
          <p className="mb-3 text-sm text-neutral-900">
            Record {runs} run(s) of this recipe? This consumes raw stock and credits finished stock now — it cannot
            be undone from here, only corrected with a reversing inventory adjustment.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void record()} disabled={submitting} className="btn-primary">
              {submitting ? 'Recording…' : 'Confirm and record'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={submitting} className="btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
