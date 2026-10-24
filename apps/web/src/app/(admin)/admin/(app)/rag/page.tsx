'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { formatDateTime } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { downloadFile } from '@/lib/download-file';
import { visibleCorpora } from '@/lib/rag-corpus-access';
import { DataTable, type DataTableColumn, EmptyState, Loading, Pagination, PageHeader } from '@/components/ui';
import { Dropzone } from '@/components/ui/dropzone';
import { PDF_UPLOAD_RULES } from '@/lib/upload-rules';
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
  // H1 (security review) — only offer a corpus this session can actually
  // reach; the API is what enforces it either way.
  const visibleCorpusOptions = visibleCorpora(CORPUS_OPTIONS, can);
  const { toasts, add: addToast, remove: removeToast } = useToast();

  const [status, setStatus] = useState<RagStatus | null>(null);
  const [page, setPage] = useState<PaginatedResponse<DocumentSourceRow> | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [corpusFilter, setCorpusFilter] = useState<DocumentCorpus | ''>('');
  const [uploadCorpus, setUploadCorpus] = useState<DocumentCorpus>('KNOWLEDGE_BASE');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);

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

  async function download(row: DocumentSourceRow) {
    try {
      await downloadFile(`/admin/rag/sources/${row.id}/file`, row.originalName);
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not download this file', 'error');
    }
  }

  function triggerReplace(id: string) {
    setReplaceTargetId(id);
    replaceInputRef.current?.click();
  }

  // L20 (security review) — corrects a bad upload without deleting and
  // re-uploading; the replaced file re-queues for ingestion on its own.
  async function handleReplaceFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = ''; // lets choosing the same file again still fire onChange
    const id = replaceTargetId;
    setReplaceTargetId(null);
    if (!chosen || !id) return;

    setBusyId(id);
    try {
      const formData = new FormData();
      formData.append('file', chosen);
      await adminFetch(`/admin/rag/sources/${id}/file`, { method: 'POST', formData });
      addToast('File replaced — re-queued for ingestion', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not replace this file', 'error');
    } finally {
      setBusyId(null);
    }
  }

  if (!status || !page) return <Loading label="Loading the document corpus" />;

  const columns: DataTableColumn<DocumentSourceRow>[] = [
    { header: 'Document', cell: (row) => row.originalName },
    { header: 'Corpus', cell: (row) => CORPUS_LABEL[row.corpus], muted: true },
    {
      header: 'Status',
      // L15 (security review) — the failure reason is otherwise invisible
      // anywhere in this UI; a title attribute is the lightest possible
      // surface for something an operator only needs on demand.
      cell: (row) => (
        <span title={row.status === 'FAILED' && row.failureReason ? row.failureReason : undefined}>
          <StatusBadge status={row.status} />
        </span>
      ),
    },
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
          <button type="button" className="btn-text" disabled={busyId === row.id} onClick={() => void download(row)}>
            Download
          </button>
          <button type="button" className="btn-text" disabled={busyId === row.id} onClick={() => triggerReplace(row.id)}>
            Replace file
          </button>
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
              {visibleCorpusOptions.map((corpus) => (
                <option key={corpus} value={corpus}>
                  {CORPUS_LABEL[corpus]}
                </option>
              ))}
            </select>
          </label>
          {/* Choosing is not sending: the PDF goes with the Upload button beside it, together with the corpus, so there is no tray here. */}
          <Dropzone
            compact
            className="min-w-0 flex-1 basis-72"
            rules={PDF_UPLOAD_RULES}
            label="Drop a PDF here, click to choose, or paste"
            selected={file}
            onFiles={([chosen]) => setFile(chosen ?? null)}
          />
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
            {visibleCorpusOptions.map((corpus) => (
              <option key={corpus} value={corpus}>
                {CORPUS_LABEL[corpus]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <input ref={replaceInputRef} type="file" accept="application/pdf" className="hidden" onChange={(event) => void handleReplaceFileChange(event)} />

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
