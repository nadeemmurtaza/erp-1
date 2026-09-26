'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDateTime } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { DataTable, type DataTableColumn, EmptyState, Loading, Pagination, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { ToastStack } from '@/components/admin/toast-stack';
import { useToast } from '@/hooks/use-toast';
import { useAdminSession } from '@/components/admin/session';
import type { DocumentCorpus, DocumentSourceRow, PaginatedResponse, RagStatus } from '@/types/api';

const CORPUS_LABEL: Record<DocumentCorpus, string> = {
  EMPLOYEE_DOCUMENTS: 'Employee documents',
  SUPPLIER_CATALOG: 'Supplier catalog',
  BUSINESS_DOCUMENTS: 'Business documents',
  KNOWLEDGE_BASE: 'Knowledge base',
};
const CORPUS_OPTIONS = Object.keys(CORPUS_LABEL) as DocumentCorpus[];

/**
 * WO-35.1/35.2/35.6 — corpus/source administration: upload a document into a
 * corpus, watch it move through the ingestion queue, retry a FAILED one.
 * Query-testing (WO-35.4/35.5) is its own page (`/admin/rag/query`) — a
 * different job (Law 5).
 */
export default function RagSourcesPage() {
  const { can } = useAdminSession();
  const canManage = can('rag.ingest.manage');
  const canQuery = can('rag.query');
  const { toasts, add: addToast, remove: removeToast } = useToast();

  const [status, setStatus] = useState<RagStatus | null>(null);
  const [page, setPage] = useState<PaginatedResponse<DocumentSourceRow> | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [corpusFilter, setCorpusFilter] = useState<DocumentCorpus | ''>('');
  const [uploadCorpus, setUploadCorpus] = useState<DocumentCorpus>('KNOWLEDGE_BASE');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextStatus, nextPage] = await Promise.all([
        adminFetch<RagStatus>('/admin/rag/status'),
        adminFetch<PaginatedResponse<DocumentSourceRow>>('/admin/rag/sources', {
          query: { page: pageNumber, pageSize: 20, corpus: corpusFilter || undefined },
        }),
      ]);
      setStatus(nextStatus);
      setPage(nextPage);
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not load the ingestion queue', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber, corpusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('corpus', uploadCorpus);
      await adminFetch('/admin/rag/sources', { method: 'POST', formData });
      addToast('Queued for ingestion', 'success');
      setFile(null);
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not upload the document', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function retry(id: string) {
    setBusyId(id);
    try {
      await adminFetch(`/admin/rag/sources/${id}/retry`, { method: 'POST' });
      addToast('Re-queued', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not retry this source', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Remove "${name}"? Its chunks are removed too, and it stops answering any query.`)) return;
    setBusyId(id);
    try {
      await adminFetch(`/admin/rag/sources/${id}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not remove this source', 'error');
    } finally {
      setBusyId(null);
    }
  }

  if (!status || !page) return <Loading label="Loading the document corpus" />;

  const columns: DataTableColumn<DocumentSourceRow>[] = [
    { header: 'Document', cell: (row) => row.originalName },
    { header: 'Corpus', cell: (row) => CORPUS_LABEL[row.corpus], muted: true },
    { header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    { header: 'Chunks', cell: (row) => row.chunkCount, align: 'end', numeric: true },
    {
      header: 'Uploaded',
      cell: (row) => formatDateTime(row.createdAt),
      muted: true,
    },
  ];
  if (canManage) {
    columns.push({
      header: '',
      align: 'end',
      cell: (row) => (
        <div className="flex justify-end gap-3">
          {row.status === 'FAILED' ? (
            <button type="button" className="btn-text" disabled={busyId === row.id} onClick={() => void retry(row.id)}>
              Retry
            </button>
          ) : null}
          <button type="button" className="btn-text text-feedback-negative" disabled={busyId === row.id} onClick={() => void remove(row.id, row.originalName)}>
            Remove
          </button>
        </div>
      ),
    });
  }

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      <PageHeader
        title="Document corpus"
        description="Upload PDFs into a corpus for retrieval-augmented answers. A corpus scopes what a query may ever see — an HR assistant never reaches a supplier contract."
      />

      {!status.retrievalAvailable ? (
        <p className="notice notice-info my-4">
          No AI provider is configured — ingestion never runs and the query console has nothing to show until
          AI_PROVIDERS names one.
        </p>
      ) : canQuery ? (
        <p className="my-4 text-sm text-neutral-900/60">
          Want to test what a query finds?{' '}
          <Link href="/admin/rag/query" className="text-accent-hover hover:underline">
            Open the query console
          </Link>
          .
        </p>
      ) : null}

      {canManage ? (
        <form onSubmit={upload} className="card my-6 flex flex-wrap items-end gap-3 p-4">
          <label className="field-label">
            Corpus
            <select className="field-input" value={uploadCorpus} onChange={(event) => setUploadCorpus(event.target.value as DocumentCorpus)}>
              {CORPUS_OPTIONS.map((corpus) => (
                <option key={corpus} value={corpus}>
                  {CORPUS_LABEL[corpus]}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            PDF file
            <input
              type="file"
              accept="application/pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="mt-1 block text-sm file:me-3 file:rounded-md file:border-0 file:bg-accent-hover file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
            />
          </label>
          <button type="submit" className="btn-primary" disabled={!file || uploading}>
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </form>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <label className="field-label">
          Corpus
          <select
            className="field-input"
            value={corpusFilter}
            onChange={(event) => {
              setCorpusFilter(event.target.value as DocumentCorpus | '');
              setPageNumber(1);
            }}
          >
            <option value="">Every corpus</option>
            {CORPUS_OPTIONS.map((corpus) => (
              <option key={corpus} value={corpus}>
                {CORPUS_LABEL[corpus]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {page.data.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="Upload a PDF above to start building this corpus."
        />
      ) : (
        <>
          <DataTable rows={page.data} rowKey={(row) => row.id} columns={columns} />
          <Pagination meta={page.meta} onChange={setPageNumber} itemLabel="documents" />
        </>
      )}
    </>
  );
}
