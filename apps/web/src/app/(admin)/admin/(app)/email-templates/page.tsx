'use client';

import { useEffect, useMemo, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import type { EmailTemplateCatalogEntry, RenderedEmailPreview } from '@/types/api';

const CATEGORIES: EmailTemplateCatalogEntry['category'][] = [
  'Orders',
  'Payments',
  'Account',
  'Marketing',
  'Stitching',
];

/**
 * Every email template registered in EMAIL_TEMPLATES, with what actually
 * sends each one — and a live preview rendered from the API against sample
 * data, so this stays true to what would go out for real rather than a
 * mockup that quietly drifts from templates.ts.
 *
 * Read-only: there is no database-backed template here to edit, so there is
 * no "save" button. A template is TypeScript source; changing one is a code
 * change, same as it has always been.
 */
export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplateCatalogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [locale, setLocale] = useState<'en' | 'ur'>('en');
  const [preview, setPreview] = useState<RenderedEmailPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    adminFetch<EmailTemplateCatalogEntry[]>('/admin/email-templates')
      .then((list) => {
        setTemplates(list);
        setSelectedKey((current) => current ?? list[0]?.key ?? null);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load templates'));
  }, []);

  useEffect(() => {
    if (!selectedKey) return;
    setPreviewLoading(true);
    setPreviewError(null);

    adminFetch<RenderedEmailPreview>(`/admin/email-templates/${selectedKey}/preview`, {
      query: { locale },
    })
      .then(setPreview)
      .catch((cause) =>
        setPreviewError(cause instanceof Error ? cause.message : 'Could not render this template'),
      )
      .finally(() => setPreviewLoading(false));
  }, [selectedKey, locale]);

  const byCategory = useMemo(() => {
    const groups = new Map<string, EmailTemplateCatalogEntry[]>();
    for (const template of templates ?? []) {
      const list = groups.get(template.category) ?? [];
      list.push(template);
      groups.set(template.category, list);
    }
    return groups;
  }, [templates]);

  const selected = templates?.find((template) => template.key === selectedKey) ?? null;

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Email Templates</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        Every email the store can send, what triggers it, and what it actually looks like.
      </p>

      {error ? (
        <p role="alert" className="card mb-4 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <div className="card max-h-[calc(100vh-14rem)] overflow-y-auto p-2">
          {!templates ? (
            <p className="p-3 text-sm text-neutral-900/50">Loading…</p>
          ) : (
            CATEGORIES.map((category) => {
              const items = byCategory.get(category);
              if (!items?.length) return null;
              return (
                <div key={category} className="mb-2">
                  <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-900/50">
                    {category}
                  </p>
                  {items.map((template) => (
                    <button
                      key={template.key}
                      type="button"
                      onClick={() => setSelectedKey(template.key)}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-start text-sm ${
                        template.key === selectedKey
                          ? 'bg-neutral-50 text-accent-hover'
                          : 'text-neutral-900 hover:bg-neutral-50'
                      }`}
                    >
                      <span>{template.label}</span>
                      <TriggerBadge trigger={template.trigger} />
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>

        <div className="min-w-0">
          {selected ? (
            <>
              <div className="card mb-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-neutral-900">{selected.label}</h2>
                    <p className="mt-1 font-mono text-xs text-neutral-900/40">{selected.key}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <TriggerBadge trigger={selected.trigger} />
                    <div className="flex overflow-hidden rounded-md border border-neutral-100">
                      <button
                        type="button"
                        onClick={() => setLocale('en')}
                        className={`px-3 py-1.5 text-xs font-medium ${
                          locale === 'en' ? 'bg-accent-hover text-white' : 'bg-white text-neutral-900/70'
                        }`}
                      >
                        EN
                      </button>
                      <button
                        type="button"
                        onClick={() => setLocale('ur')}
                        className={`px-3 py-1.5 text-xs font-medium ${
                          locale === 'ur' ? 'bg-accent-hover text-white' : 'bg-white text-neutral-900/70'
                        }`}
                      >
                        UR
                      </button>
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-sm text-neutral-900/70">{selected.triggerDescription}</p>
              </div>

              <div className="card overflow-hidden">
                {previewLoading ? (
                  <p className="p-8 text-center text-sm text-neutral-900/50">Rendering…</p>
                ) : previewError ? (
                  <p role="alert" className="p-8 text-center text-sm text-red-700">
                    {previewError}
                  </p>
                ) : preview ? (
                  <>
                    <div className="border-b border-neutral-100 bg-neutral-50 px-4 py-2 text-sm text-neutral-900/70">
                      <span className="font-semibold text-neutral-900">Subject: </span>
                      {preview.subject}
                    </div>
                    <iframe
                      title={`${selected.label} preview`}
                      srcDoc={preview.html}
                      sandbox=""
                      className="h-[70vh] w-full bg-white"
                    />
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <p className="p-8 text-center text-sm text-neutral-900/50">Select a template to preview it.</p>
          )}
        </div>
      </div>
    </>
  );
}

function TriggerBadge({ trigger }: { trigger: EmailTemplateCatalogEntry['trigger'] }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        trigger === 'automatic' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
      }`}
    >
      {trigger === 'automatic' ? 'Automatic' : 'Manual'}
    </span>
  );
}
