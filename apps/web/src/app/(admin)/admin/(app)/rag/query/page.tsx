'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { DataTable, type DataTableColumn, EmptyState, PageHeader } from '@/components/ui';
import { ToastStack } from '@/components/admin/toast-stack';
import { useToast } from '@/hooks/use-toast';
import { useAdminSession } from '@/components/admin/session';
import type { DocumentCorpus, RagAnswer, RagQueryHit, RagStatus } from '@/types/api';

const CORPUS_LABEL: Record<DocumentCorpus, string> = {
  EMPLOYEE_DOCUMENTS: 'Employee documents',
  SUPPLIER_CATALOG: 'Supplier catalog',
  BUSINESS_DOCUMENTS: 'Business documents',
  KNOWLEDGE_BASE: 'Knowledge base',
};
const CORPUS_OPTIONS = Object.keys(CORPUS_LABEL) as DocumentCorpus[];

/**
 * WO-35.4/35.5's own "dry run before live" tool (the doc's own words): run a
 * query against a corpus and see the retrieved chunks with no generation
 * step, before trusting an answer built on top of them — then, when ready,
 * generate one and see exactly which chunks and pages it cites. Two actions
 * on one object (a query and what it finds), not two jobs — Law 5 stays
 * satisfied because "generate an answer" only ever runs after "see what
 * retrieval finds," never as its own separate destination.
 */
export default function RagQueryConsolePage() {
  const { can } = useAdminSession();
  const canManageCorpus = can('rag.ingest.manage');
  const { toasts, add: addToast, remove: removeToast } = useToast();

  const [status, setStatus] = useState<RagStatus | null>(null);
  const [corpus, setCorpus] = useState<DocumentCorpus>('KNOWLEDGE_BASE');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<RagQueryHit[] | null>(null);
  const [answer, setAnswer] = useState<RagAnswer | null>(null);
  const [searching, setSearching] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    adminFetch<RagStatus>('/admin/rag/status')
      .then(setStatus)
      .catch((cause) => addToast(cause instanceof Error ? cause.message : 'Could not load RAG status', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setAnswer(null);
    try {
      const result = await adminFetch<RagQueryHit[]>('/admin/rag/query', { method: 'POST', body: { query, corpus } });
      setHits(result);
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Retrieval is not available right now', 'error');
    } finally {
      setSearching(false);
    }
  }

  async function ask() {
    if (!query.trim()) return;
    setAsking(true);
    try {
      const result = await adminFetch<RagAnswer | null>('/admin/rag/ask', { method: 'POST', body: { query, corpus } });
      setAnswer(result);
      if (!result) addToast('Nothing in this corpus matched closely enough to answer from.', 'info');
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Generation is not available right now', 'error');
    } finally {
      setAsking(false);
    }
  }

  const columns: DataTableColumn<RagQueryHit>[] = [
    { header: 'Pages', cell: (hit) => `${hit.pageFrom}–${hit.pageTo}`, muted: true },
    { header: 'Chunk', cell: (hit) => <span className="line-clamp-3 max-w-xl text-sm">{hit.text}</span> },
    { header: 'Score', cell: (hit) => hit.score.toFixed(3), align: 'end', numeric: true },
  ];

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      <PageHeader
        title="Query console"
        description="Retrieval only, unless you also ask for an answer — the tool for tuning a corpus before trusting it."
        context={
          canManageCorpus ? (
            <Link href="/admin/rag" className="hover:underline">
              &larr; Document corpus
            </Link>
          ) : undefined
        }
      />

      {status && !status.retrievalAvailable ? (
        <EmptyState
          title="Retrieval is not available"
          description="No AI provider is configured — set AI_PROVIDERS to run a query."
        />
      ) : (
        <>
          <form onSubmit={search} className="card my-6 flex flex-wrap items-end gap-3 p-4">
            <label className="field-label">
              Corpus
              <select className="field-input" value={corpus} onChange={(event) => setCorpus(event.target.value as DocumentCorpus)}>
                {CORPUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {CORPUS_LABEL[option]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label min-w-[20rem] flex-1">
              Question
              <input
                className="field-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="What does our return policy say about damaged goods?"
              />
            </label>
            <button type="submit" className="btn-secondary" disabled={!query.trim() || searching}>
              {searching ? 'Searching…' : 'Search chunks'}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!query.trim() || asking || !(status?.generationAvailable ?? true)}
              onClick={() => void ask()}
            >
              {asking ? 'Generating…' : 'Generate an answer'}
            </button>
          </form>

          {answer ? (
            <section className="card mb-6 p-4">
              <h2 className="text-sm font-semibold text-neutral-900">Generated answer</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-900/90">{answer.text}</p>
              <dl className="mt-4 space-y-1 border-t border-neutral-100 pt-3 text-xs text-neutral-900/60">
                {answer.citations.map((citation, index) => (
                  <div key={`${citation.sourceId}-${index}`}>
                    [{index + 1}] {citation.originalName}, p.{citation.pageFrom}–{citation.pageTo}
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {hits === null ? null : hits.length === 0 ? (
            <EmptyState title="No matching chunks" description="Nothing in this corpus is close enough to this question." />
          ) : (
            <DataTable rows={hits} rowKey={(hit) => hit.id} columns={columns} />
          )}
        </>
      )}
    </>
  );
}
