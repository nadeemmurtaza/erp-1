'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { DataTable, Dialog, Loading, PageHeader } from '@/components/ui';
import { ToastStack } from '@/components/admin/toast-stack';
import { useToast } from '@/hooks/use-toast';
import { Link } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';

interface Collection {
  id: string;
  slug: string;
  sortStrategy: string;
  isActive: boolean;
  rule: unknown;
  translations: { locale: string; name: string }[];
  _count: { products: number };
}

const SORT_STRATEGIES = ['MANUAL', 'BEST_SELLING', 'NEWEST', 'PRICE_ASC', 'PRICE_DESC', 'MARGIN'];

function nameOf(c: Collection): string {
  return c.translations.find((t) => t.locale === 'en')?.name ?? c.translations[0]?.name ?? c.slug;
}

function EditDialog({
  open,
  onClose,
  collection,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  collection: Collection | null;
  onSaved: () => Promise<void>;
}) {
  const { add: addToast } = useToast();
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [sortStrategy, setSortStrategy] = useState('MANUAL');
  const [ruleText, setRuleText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (collection) {
      setSlug(collection.slug);
      setName(nameOf(collection));
      setSortStrategy(collection.sortStrategy);
      setRuleText(collection.rule ? JSON.stringify(collection.rule, null, 2) : '');
    } else {
      setSlug('');
      setName('');
      setSortStrategy('MANUAL');
      setRuleText('');
    }
  }, [collection, open]);

  async function save() {
    let rule: unknown;
    if (ruleText.trim()) {
      try {
        rule = JSON.parse(ruleText);
      } catch {
        addToast('Rule is not valid JSON', 'error');
        return;
      }
    }

    setSaving(true);
    try {
      if (collection) {
        await adminFetch(`/admin/collections/${collection.id}`, {
          method: 'PATCH',
          body: { sortStrategy, rule: rule ?? null, translations: [{ locale: 'en', name }] },
        });
      } else {
        await adminFetch('/admin/collections', {
          method: 'POST',
          body: { slug, sortStrategy, rule, translations: [{ locale: 'en', name }] },
        });
      }
      addToast('Collection saved', 'success');
      await onSaved();
      onClose();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not save the collection', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={collection ? `Edit ${collection.slug}` : 'New collection'}>
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="field-label">
            Slug
            <input className="field-input" value={slug} disabled={Boolean(collection)} onChange={(e) => setSlug(e.target.value)} />
          </label>
          <label className="field-label">
            Name (English)
            <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>

        <label className="field-label">
          Sort strategy
          <select className="field-input" value={sortStrategy} onChange={(e) => setSortStrategy(e.target.value)}>
            {SORT_STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>

        <label className="field-label">
          Rule (advanced — leave blank for a manually curated collection)
          <textarea
            className="field-input min-h-[140px] w-full font-mono text-xs"
            placeholder={'{\n  "all": [\n    { "field": "kind", "operator": "eq", "value": "UNSTITCHED" },\n    { "field": "price", "operator": "lt", "value": 500000 }\n  ]\n}'}
            value={ruleText}
            onChange={(e) => setRuleText(e.target.value)}
          />
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={saving || !name || (!collection && !slug)} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export default function CollectionsAdminPage() {
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [editing, setEditing] = useState<Collection | null | 'new'>(null);

  const load = useCallback(async () => {
    try {
      setCollections(await adminFetch<Collection[]>('/admin/collections'));
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not load collections', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!collections) return <Loading label="Loading collections" />;

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      <PageHeader
        title="Collections"
        description="Curated and rule-based merchandising, separate from the category tree — WO-8.2."
        action={
          <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
            New collection
          </button>
        }
      />

      <DataTable
        rows={collections}
        rowKey={(c) => c.id}
        emptyLabel="No collections yet"
        onRowClick={(c) => setEditing(c)}
        columns={[
          { header: 'Name', cell: (c) => nameOf(c) },
          { header: 'Slug', cell: (c) => c.slug, muted: true },
          { header: 'Type', cell: (c) => (c.rule ? 'Rule-based' : 'Manual'), muted: true },
          { header: 'Sort', cell: (c) => c.sortStrategy.replace('_', ' '), muted: true },
          { header: 'Products', cell: (c) => c._count.products, align: 'end', numeric: true },
          {
            header: '',
            cell: (c) => (
              <Link href={ROUTES.storefront.collection(c.slug)} target="_blank" className="btn-text" onClick={(e) => e.stopPropagation()}>
                View
              </Link>
            ),
          },
        ]}
      />

      <EditDialog open={editing !== null} onClose={() => setEditing(null)} collection={editing === 'new' ? null : editing} onSaved={load} />
    </>
  );
}
