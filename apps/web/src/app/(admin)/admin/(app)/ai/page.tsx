'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatMoney, toMajor, toMinor } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { DataTable, type DataTableColumn, Loading, MetricStrip, PageHeader } from '@/components/ui';
import { ToastStack } from '@/components/admin/toast-stack';
import { useToast } from '@/hooks/use-toast';
import { useAdminSession } from '@/components/admin/session';
import type { AiStatus, AiSuggestion } from '@/types/api';

const KIND_LABEL: Record<AiSuggestion['kind'], string> = {
  ALT_TEXT: 'Alt text',
  META_TITLE: 'Meta title',
  META_DESCRIPTION: 'Meta description',
  DESCRIPTION: 'Description',
  CARE_INSTRUCTIONS: 'Care instructions',
};

/**
 * WO-9.1's review queue plus the AI foundation's own status and budget
 * (09-ai-layer.md). Every row here is a PENDING ProductAiSuggestion — nothing
 * an AI provider drafts reaches a product on its own; a person approves or
 * rejects it here first. "Configure providers" is deliberately not a toggle
 * on this screen: AI_PROVIDERS is an env allowlist, the same House-Rule-8
 * idiom as PAYMENT_PROVIDERS, so this page only ever shows which are on.
 */
export default function AiAdminPage() {
  const { can } = useAdminSession();
  const canManage = can('ai.manage');
  const { toasts, add: addToast, remove: removeToast } = useToast();

  const [status, setStatus] = useState<AiStatus | null>(null);
  const [queue, setQueue] = useState<AiSuggestion[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [budgetInput, setBudgetInput] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextStatus, nextQueue] = await Promise.all([
        adminFetch<AiStatus>('/admin/settings/ai'),
        adminFetch<AiSuggestion[]>('/admin/catalog/ai-suggestions'),
      ]);
      setStatus(nextStatus);
      setBudgetInput(nextStatus.monthlyBudgetPaisa === null ? '' : String(toMajor(nextStatus.monthlyBudgetPaisa)));
      setRateInput(String(nextStatus.usdToPkrRate));
      setQueue(nextQueue);
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not load the AI screen', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveBudget(event: React.FormEvent) {
    event.preventDefault();
    setSavingBudget(true);
    try {
      const next = await adminFetch<AiStatus>('/admin/settings/ai', {
        method: 'PUT',
        body: {
          monthlyBudgetPaisa: budgetInput.trim() === '' ? null : toMinor(Number(budgetInput)),
          usdToPkrRate: Number(rateInput),
        },
      });
      setStatus(next);
      addToast('Budget saved', 'success');
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not save the budget', 'error');
    } finally {
      setSavingBudget(false);
    }
  }

  async function generateBulk() {
    setGenerating(true);
    try {
      const result = await adminFetch<{ productsProcessed: number; suggestionsCreated: number }>(
        '/admin/catalog/ai-suggestions/generate-bulk',
        { method: 'POST' },
      );
      addToast(
        result.suggestionsCreated > 0
          ? `Drafted ${result.suggestionsCreated} suggestion(s) across ${result.productsProcessed} product(s).`
          : 'Nothing new to draft — the SEO health backlog already has a pending draft for every gap AI can help with.',
        'success',
      );
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not generate drafts', 'error');
    } finally {
      setGenerating(false);
    }
  }

  function dropFromQueue(id: string) {
    setQueue((prev) => prev?.filter((row) => row.id !== id) ?? null);
    setSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function approve(id: string) {
    try {
      await adminFetch(`/admin/catalog/ai-suggestions/${id}/approve`, { method: 'POST' });
      dropFromQueue(id);
      addToast('Applied to the product', 'success');
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not approve this draft', 'error');
    }
  }

  async function reject(id: string) {
    try {
      await adminFetch(`/admin/catalog/ai-suggestions/${id}/reject`, { method: 'POST' });
      dropFromQueue(id);
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not reject this draft', 'error');
    }
  }

  async function approveSelected() {
    if (selected.size === 0) return;
    if (!window.confirm(`Approve ${selected.size} draft(s)? Each is applied to its product immediately.`)) return;

    try {
      const result = await adminFetch<{ approved: number; errors: Array<{ id: string; message: string }> }>(
        '/admin/catalog/ai-suggestions/approve-bulk',
        { method: 'POST', body: { ids: Array.from(selected) } },
      );
      addToast(
        result.errors.length > 0
          ? `Approved ${result.approved}, ${result.errors.length} could not be applied.`
          : `Approved ${result.approved} draft(s).`,
        result.errors.length > 0 ? 'error' : 'success',
      );
      setSelected(new Set());
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not approve the selected drafts', 'error');
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!status || !queue) return <Loading label="Loading the AI screen" />;

  const anyProvider = status.providers.anthropic || status.providers.openai;

  const columns: DataTableColumn<AiSuggestion>[] = [];
  if (canManage) {
    columns.push({
      header: '',
      cell: (row) => (
        <input
          type="checkbox"
          className="field-check"
          checked={selected.has(row.id)}
          onChange={() => toggleSelected(row.id)}
          aria-label={`Select the ${KIND_LABEL[row.kind]} draft for ${row.productName}`}
        />
      ),
    });
  }
  columns.push(
    {
      header: 'Product',
      cell: (row) => (
        <Link href={`/admin/products/${row.productId}`} className="font-medium text-accent-hover hover:underline">
          {row.productName}
        </Link>
      ),
    },
    {
      header: 'Draft',
      cell: (row) => `${KIND_LABEL[row.kind]} (${row.locale.toUpperCase()})`,
      muted: true,
    },
    {
      header: 'Suggested text',
      cell: (row) => (
        <div className="flex items-center gap-2">
          {row.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a small thumbnail from an already-uploaded product image, not an optimizable page asset
            <img src={row.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
          ) : null}
          <span className="line-clamp-2 max-w-md text-sm text-neutral-900/80">{row.suggestedText}</span>
        </div>
      ),
    },
  );
  if (canManage) {
    columns.push({
      header: '',
      align: 'end',
      cell: (row) => (
        <div className="flex justify-end gap-3">
          <button type="button" className="btn-text" onClick={() => void approve(row.id)}>
            Approve
          </button>
          <button type="button" className="btn-text text-feedback-negative" onClick={() => void reject(row.id)}>
            Reject
          </button>
        </div>
      ),
    });
  }

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      <PageHeader
        title="AI"
        description="What's on, what it costs this month, and every AI-drafted change waiting for a person to confirm it."
      />

      <MetricStrip
        label="AI status"
        items={[
          { key: 'queue', label: 'Pending drafts', value: queue.length },
          {
            key: 'providers',
            label: 'Providers on',
            value: anyProvider
              ? [status.providers.anthropic ? 'Anthropic' : null, status.providers.openai ? 'OpenAI' : null]
                  .filter(Boolean)
                  .join(', ')
              : 'None',
          },
          { key: 'spend', label: 'Spent this month', value: formatMoney(status.monthToDateSpendPaisa) },
          {
            key: 'budget',
            label: 'Monthly cap',
            value: status.monthlyBudgetPaisa === null ? 'Uncapped' : formatMoney(status.monthlyBudgetPaisa),
          },
        ]}
      />

      {!anyProvider ? (
        <p className="notice notice-info my-4">
          No AI provider is configured — every AI-assisted screen in the product runs its non-AI fallback until
          AI_PROVIDERS names one.
        </p>
      ) : null}

      {canManage ? (
        <form onSubmit={saveBudget} className="card my-6 flex flex-wrap items-end gap-3 p-4">
          <label className="field-label">
            Monthly budget, PKR (blank = uncapped)
            <input
              className="field-input w-40"
              inputMode="decimal"
              value={budgetInput}
              onChange={(event) => setBudgetInput(event.target.value)}
              placeholder="Uncapped"
            />
          </label>
          <label className="field-label">
            USD &rarr; PKR rate
            <input
              className="field-input w-28"
              inputMode="decimal"
              value={rateInput}
              onChange={(event) => setRateInput(event.target.value)}
            />
          </label>
          <button type="submit" className="btn-secondary" disabled={savingBudget}>
            {savingBudget ? 'Saving…' : 'Save'}
          </button>
        </form>
      ) : null}

      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-900">Review queue</h2>
        {canManage ? (
          <div className="flex gap-2">
            {selected.size > 0 ? (
              <button type="button" className="btn-secondary" onClick={() => void approveSelected()}>
                Approve {selected.size} selected
              </button>
            ) : null}
            <button type="button" className="btn-primary" disabled={generating} onClick={() => void generateBulk()}>
              {generating ? 'Generating…' : 'Generate for SEO health backlog'}
            </button>
          </div>
        ) : null}
      </div>

      <DataTable
        rows={queue}
        rowKey={(row) => row.id}
        emptyLabel="No AI drafts waiting for review."
        columns={columns}
      />
    </>
  );
}
