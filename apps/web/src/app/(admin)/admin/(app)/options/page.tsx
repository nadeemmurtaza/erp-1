'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { DataTable, ConfirmDialog } from '@/components/ui';
import type { AdminOptionTemplate } from '@/types/api';
import { Select } from '@/components/ui/select';

interface Draft {
  key: string;
  display: 'BUTTON' | 'DROPDOWN' | 'SWATCH' | 'TEXT';
  labelEn: string;
  labelUr: string;
  values: string;
}

const BLANK: Draft = { key: '', display: 'BUTTON', labelEn: '', labelUr: '', values: '' };

/**
 * Catalogue -> Options & attributes (WO-3.1, 03-variants-sku-seo.md).
 *
 * The store-level option library: "Size: XS/S/M/L/XL/XXL" typed once here
 * rather than on every product. A product's own editor instantiates from
 * one of these; editing the template afterwards never silently changes a
 * live product, since instantiating copies the values rather than linking
 * to them.
 */
export default function OptionTemplatesPage() {
  const [templates, setTemplates] = useState<AdminOptionTemplate[] | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<AdminOptionTemplate | null>(null);

  const load = useCallback(async () => {
    try {
      setTemplates(await adminFetch<AdminOptionTemplate[]>('/admin/catalog/option-templates'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load option templates');
      setTemplates([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const values = draft.values
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    try {
      await adminFetch('/admin/catalog/option-templates', {
        method: 'POST',
        body: {
          key: draft.key.trim().toLowerCase().replace(/\s+/g, '_'),
          display: draft.display,
          translations: [
            { locale: 'en', label: draft.labelEn.trim() },
            ...(draft.labelUr.trim() ? [{ locale: 'ur', label: draft.labelUr.trim() }] : []),
          ],
          values: values.map((value) => ({
            key: value.toLowerCase().replace(/\s+/g, '_'),
            translations: [
              { locale: 'en', label: value },
              ...(draft.labelUr.trim() ? [{ locale: 'ur', label: value }] : []),
            ],
          })),
        },
      });
      setDraft(BLANK);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the option template');
    } finally {
      setBusy(false);
    }
  }

  async function remove(template: AdminOptionTemplate) {
    setError(null);
    try {
      await adminFetch(`/admin/catalog/option-templates/${template.id}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete this template');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Options & attributes</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        Reusable option axes — Size, Colour, or anything a product varies by. A product&apos;s
        own editor copies values from here; editing a template afterwards never changes a
        product that already instantiated it.
      </p>

      {error ? (
        <p role="alert" className="notice notice-error mb-4 whitespace-pre-line">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="overflow-hidden">
          <DataTable
            rows={templates}
            loading={templates === null}
            rowKey={(template) => template.id}
            emptyLabel="No option templates yet. Add the first one on the right."
            columns={[
              {
                header: 'Option',
                cell: (template) => (
                  <>
                    <span className="font-medium text-neutral-900">
                      {template.translations.find((t) => t.locale === 'en')?.label ?? template.key}
                    </span>
                    <p className="text-xs text-neutral-900/60">{template.key}</p>
                  </>
                ),
              },
              { header: 'Display', muted: true, cell: (template) => template.display },
              {
                header: 'Values',
                muted: true,
                cell: (template) =>
                  template.values.map((value) => value.translations.find((t) => t.locale === 'en')?.label ?? value.key).join(', ') ||
                  '—',
              },
              {
                header: '',
                align: 'end',
                cell: (template) => (
                  <button
                    type="button"
                    onClick={() => setDeleting(template)}
                    className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                ),
              },
            ]}
          />
        </div>

        <form onSubmit={save} className="card h-fit space-y-4 p-4">
          <h2 className="text-sm font-semibold text-neutral-900">New option template</h2>

          <label className="block">
            <span className="field-label">
              Name<span className="text-red-600"> *</span>
            </span>
            <input
              value={draft.labelEn}
              onChange={(event) => setDraft({ ...draft, labelEn: event.target.value })}
              required
              placeholder="Sleeve length"
              className="field-input"
            />
          </label>

          <label className="block">
            <span className="field-label">نام (Urdu, optional)</span>
            <input
              value={draft.labelUr}
              onChange={(event) => setDraft({ ...draft, labelUr: event.target.value })}
              dir="rtl"
              className="field-input font-urdu"
            />
          </label>

          <div>
            <span className="field-label">Display</span>
            <Select
              label="Display"
              value={draft.display}
              onChange={(next) => setDraft({ ...draft, display: next as Draft['display'] })}
              options={[
                { value: 'BUTTON', label: 'Buttons' },
                { value: 'DROPDOWN', label: 'Dropdown' },
                { value: 'SWATCH', label: 'Swatch' },
                { value: 'TEXT', label: 'Free text' },
              ]}
            />
            <p className="mt-1 text-sm text-neutral-900/70">
              {
                {
                  BUTTON: 'One button per value, like S M L XL.',
                  DROPDOWN: 'A dropdown, for long lists.',
                  SWATCH: 'A swatch per value, for colour or fabric.',
                  TEXT: 'The customer types it, for example a monogram.',
                }[draft.display]
              }
            </p>
          </div>

          <label className="block">
            <span className="field-label">Values</span>
            <input
              value={draft.values}
              onChange={(event) => setDraft({ ...draft, values: event.target.value })}
              placeholder="Short, Long, 3/4"
              className="field-input"
            />
            <span className="mt-1 block text-xs text-neutral-900/60">Comma separated.</span>
          </label>

          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Saving…' : 'Add template'}
          </button>
        </form>
      </div>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) return remove(deleting);
        }}
        title="Delete this option template?"
        description="Products that already instantiated it keep their own copy — this only removes the reusable template."
        confirmLabel="Delete option template"
      />
    </>
  );
}
