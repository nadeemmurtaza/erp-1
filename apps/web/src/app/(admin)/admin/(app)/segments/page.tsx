'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { DataTable, Dialog, Loading, PageHeader } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';

interface Segment {
  id: string;
  name: string;
  description: string | null;
  filter: unknown;
}

function EditDialog({
  open,
  onClose,
  segment,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  segment: Segment | null;
  onSaved: () => Promise<void>;
}) {
  const { add: addToast } = useToast();
  const [name, setName] = useState('');
  const [filterText, setFilterText] = useState('');
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (segment) {
      setName(segment.name);
      setFilterText(JSON.stringify(segment.filter, null, 2));
    } else {
      setName('');
      setFilterText('{\n  "all": [\n    { "field": "orderCount", "operator": "gte", "value": 2 },\n    { "field": "city", "operator": "eq", "value": "Lahore" }\n  ]\n}');
    }
    setPreviewCount(null);
  }, [segment, open]);

  async function preview() {
    try {
      const filter = JSON.parse(filterText);
      const result = await adminFetch<{ count: number }>('/admin/crm/segments/preview', { method: 'POST', body: { filter } });
      setPreviewCount(result.count);
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Invalid filter JSON', 'error');
    }
  }

  async function save() {
    let filter: unknown;
    try {
      filter = JSON.parse(filterText);
    } catch {
      addToast('Filter is not valid JSON', 'error');
      return;
    }

    setSaving(true);
    try {
      if (segment) {
        await adminFetch(`/admin/crm/segments/${segment.id}`, { method: 'PATCH', body: { name, filter } });
      } else {
        await adminFetch('/admin/crm/segments', { method: 'POST', body: { name, filter } });
      }
      addToast('Segment saved', 'success');
      await onSaved();
      onClose();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not save the segment', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={segment ? `Edit ${segment.name}` : 'New segment'}>
      <div className="space-y-4">
        <label className="field-label">
          Name
          <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="field-label">
          Filter — every condition must hold (AND)
          <textarea
            className="field-input min-h-[160px] w-full font-mono text-xs"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
        </label>

        <div className="flex items-center gap-3">
          <button type="button" className="btn-secondary" onClick={() => void preview()}>
            Preview count
          </button>
          {previewCount !== null ? (
            <span className="text-sm text-neutral-500">{previewCount} contact(s) match</span>
          ) : null}
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={saving || !name} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/** WO-8.4 — Segment shipped in the CRM schema with no evaluator, service or UI until now. */
export default function SegmentsAdminPage() {
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [editing, setEditing] = useState<Segment | null | 'new'>(null);

  const load = useCallback(async () => {
    try {
      setSegments(await adminFetch<Segment[]>('/admin/crm/segments'));
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not load segments', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!segments) return <Loading label="Loading segments" />;

  return (
    <>
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
          {toasts.map((t) => (
            <button key={t.id} type="button" className="w-full cursor-pointer rounded-md border border-neutral-200 bg-white p-4 text-start text-sm shadow-md" onClick={() => removeToast(t.id)}>
              {t.message}
            </button>
          ))}
        </div>
      )}

      <PageHeader
        title="Segments"
        description="Saved contact filters — audiences for campaigns and reporting."
        action={
          <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
            New segment
          </button>
        }
      />

      <DataTable
        rows={segments}
        rowKey={(s) => s.id}
        emptyLabel="No segments yet"
        onRowClick={(s) => setEditing(s)}
        columns={[
          { header: 'Name', cell: (s) => s.name },
          { header: 'Description', cell: (s) => s.description ?? '—', muted: true },
        ]}
      />

      <EditDialog open={editing !== null} onClose={() => setEditing(null)} segment={editing === 'new' ? null : editing} onSaved={load} />
    </>
  );
}
