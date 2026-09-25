'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { DataTable, Loading, PageHeader, Tabs } from '@/components/ui';
import { ToastStack } from '@/components/admin/toast-stack';
import { useToast } from '@/hooks/use-toast';

interface Synonym {
  id: string;
  locale: string;
  term: string;
  synonym: string;
}

interface ZeroResult {
  term: string;
  locale: string;
  count: number;
}

/** WO-8.3 — synonym editing and the zero-result report ("the single most useful merchandising report there is"). */
export default function SearchAdminPage() {
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const [synonyms, setSynonyms] = useState<Synonym[] | null>(null);
  const [zeroResults, setZeroResults] = useState<ZeroResult[] | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, z] = await Promise.all([
        adminFetch<Synonym[]>('/admin/search/synonyms'),
        adminFetch<ZeroResult[]>('/admin/search/zero-results?days=30'),
      ]);
      setSynonyms(s);
      setZeroResults(z);
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not load search settings', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addSynonym() {
    const term = window.prompt('The term a customer types (e.g. "shirt")');
    if (!term) return;
    const synonym = window.prompt('What it should also match (e.g. "kameez")');
    if (!synonym) return;
    const locale = window.prompt('Locale (en or ur)', 'en') ?? 'en';
    try {
      await adminFetch('/admin/search/synonyms', { method: 'POST', body: { locale, term, synonym } });
      addToast('Synonym added', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not add the synonym', 'error');
    }
  }

  async function removeSynonym(id: string) {
    try {
      await adminFetch(`/admin/search/synonyms/${id}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not remove the synonym', 'error');
    }
  }

  if (!synonyms) return <Loading label="Loading search settings" />;

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      <PageHeader title="Search" description="Synonyms and the zero-result report — WO-8.3." />

      <Tabs
        label="Search sections"
        items={[
          {
            key: 'synonyms',
            label: 'Synonyms',
            content: (
              <div>
                <div className="mb-3 flex justify-end">
                  <button type="button" className="btn-secondary" onClick={() => void addSynonym()}>
                    Add synonym
                  </button>
                </div>
                <DataTable
                  rows={synonyms}
                  rowKey={(s) => s.id}
                  emptyLabel="No synonyms yet"
                  columns={[
                    { header: 'Locale', cell: (s) => s.locale, muted: true },
                    { header: 'Term', cell: (s) => s.term },
                    { header: 'Also matches', cell: (s) => s.synonym },
                    {
                      header: '',
                      cell: (s) => (
                        <button type="button" className="btn-text text-red-600" onClick={() => void removeSynonym(s.id)}>
                          Remove
                        </button>
                      ),
                    },
                  ]}
                />
              </div>
            ),
          },
          {
            key: 'zero-results',
            label: 'Zero-result queries',
            content: (
              <DataTable
                rows={zeroResults}
                rowKey={(r, i) => `${r.term}-${r.locale}-${i}`}
                emptyLabel="No zero-result queries in the last 30 days"
                columns={[
                  { header: 'Term', cell: (r) => r.term },
                  { header: 'Locale', cell: (r) => r.locale, muted: true },
                  { header: 'Times searched', cell: (r) => r.count, align: 'end', numeric: true },
                ]}
              />
            ),
          },
        ]}
      />
    </>
  );
}
