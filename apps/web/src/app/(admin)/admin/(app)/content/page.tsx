'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { CONTENT_BLOCK_TYPES, type ContentBlockType } from '@newax/shared';
import { DataTable, Dialog, Loading, PageHeader, Tabs } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';

interface Translation {
  locale: 'en' | 'ur';
  title: string;
  body: unknown[];
  metaTitle?: string | null;
  metaDescription?: string | null;
}

interface Page {
  id: string;
  slug: string;
  template: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  translations: Translation[];
}

interface BlogPost extends Page {
  category: string | null;
  tags: string[];
}

interface Banner {
  id: string;
  placementKey: string;
  imageUrl: string;
  linkUrl: string | null;
  isActive: boolean;
  order: number;
  translations: { locale: string; headline: string | null; altText: string | null }[];
}

interface MenuItem {
  id: string;
  menuKey: string;
  url: string;
  order: number;
  isActive: boolean;
  translations: { locale: string; label: string }[];
}

function labelOf(translations: { locale: string; label?: string; headline?: string | null }[]): string {
  const en = translations.find((t) => t.locale === 'en');
  return en?.label ?? en?.headline ?? translations[0]?.label ?? translations[0]?.headline ?? '—';
}

/** A block editor pragmatic enough to ship: type-specific plain fields, not a WYSIWYG. */
function BlockEditor({ blocks, onChange }: { blocks: unknown[]; onChange: (blocks: unknown[]) => void }) {
  function update(index: number, patch: Record<string, unknown>) {
    const next = blocks.slice();
    next[index] = { ...(next[index] as Record<string, unknown>), ...patch };
    onChange(next);
  }
  function remove(index: number) {
    onChange(blocks.filter((_, i) => i !== index));
  }
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    const next = blocks.slice();
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  }
  function add(type: ContentBlockType) {
    const defaults: Record<ContentBlockType, unknown> = {
      richtext: { type: 'richtext', html: '' },
      image: { type: 'image', url: '', alt: '' },
      product_grid: { type: 'product_grid', title: '', productSlugs: [] },
      banner: { type: 'banner', bannerId: '' },
      faq: { type: 'faq', items: [] },
      video: { type: 'video', url: '' },
    };
    onChange([...blocks, defaults[type]]);
  }

  return (
    <div className="space-y-3">
      {blocks.map((raw, index) => {
        const block = raw as Record<string, unknown>;
        return (
          <div key={index} className="rounded-md border border-neutral-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-900/60">
                {String(block.type)}
              </span>
              <div className="flex gap-1">
                <button type="button" className="btn-text" onClick={() => move(index, -1)}>↑</button>
                <button type="button" className="btn-text" onClick={() => move(index, 1)}>↓</button>
                <button type="button" className="btn-text text-red-600" onClick={() => remove(index)}>Remove</button>
              </div>
            </div>

            {block.type === 'richtext' && (
              <textarea
                className="field-input min-h-[100px] w-full"
                placeholder="HTML — sanitised on save"
                value={String(block.html ?? '')}
                onChange={(e) => update(index, { html: e.target.value })}
              />
            )}
            {block.type === 'image' && (
              <div className="grid gap-2 sm:grid-cols-2">
                <input className="field-input" placeholder="Image URL" value={String(block.url ?? '')} onChange={(e) => update(index, { url: e.target.value })} />
                <input className="field-input" placeholder="Alt text" value={String(block.alt ?? '')} onChange={(e) => update(index, { alt: e.target.value })} />
                <input className="field-input sm:col-span-2" placeholder="Caption (optional)" value={String(block.caption ?? '')} onChange={(e) => update(index, { caption: e.target.value })} />
              </div>
            )}
            {block.type === 'product_grid' && (
              <div className="grid gap-2">
                <input className="field-input" placeholder="Section title (optional)" value={String(block.title ?? '')} onChange={(e) => update(index, { title: e.target.value })} />
                <input
                  className="field-input"
                  placeholder="Product slugs, comma-separated"
                  value={(block.productSlugs as string[] | undefined)?.join(',') ?? ''}
                  onChange={(e) => update(index, { productSlugs: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                />
              </div>
            )}
            {block.type === 'banner' && (
              <input className="field-input" placeholder="Banner ID" value={String(block.bannerId ?? '')} onChange={(e) => update(index, { bannerId: e.target.value })} />
            )}
            {block.type === 'video' && (
              <div className="grid gap-2">
                <input className="field-input" placeholder="Video URL" value={String(block.url ?? '')} onChange={(e) => update(index, { url: e.target.value })} />
                <input className="field-input" placeholder="Caption (optional, shown below the video)" value={String(block.caption ?? '')} onChange={(e) => update(index, { caption: e.target.value })} />
                <input
                  className="field-input"
                  placeholder="Captions (WebVTT) URL — required for accessibility"
                  value={String(block.captionsUrl ?? '')}
                  onChange={(e) => update(index, { captionsUrl: e.target.value })}
                />
              </div>
            )}
            {block.type === 'faq' && (
              <textarea
                className="field-input min-h-[80px] w-full"
                placeholder={'One per line: Question | Answer'}
                value={((block.items as { question: string; answer: string }[] | undefined) ?? [])
                  .map((i) => `${i.question} | ${i.answer}`)
                  .join('\n')}
                onChange={(e) =>
                  update(index, {
                    items: e.target.value
                      .split('\n')
                      .map((line) => line.split('|').map((s) => s.trim()))
                      .filter(([q]) => q)
                      .map(([question, answer]) => ({ question, answer: answer ?? '' })),
                  })
                }
              />
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2">
        {CONTENT_BLOCK_TYPES.map((type) => (
          <button key={type} type="button" className="btn-secondary" onClick={() => add(type)}>
            + {type.replace('_', ' ')}
          </button>
        ))}
      </div>
    </div>
  );
}

function DocumentEditor<T extends Page>({
  open,
  onClose,
  document,
  onSave,
  extraFields,
}: {
  open: boolean;
  onClose: () => void;
  document: T | null;
  onSave: (slug: string, status: T['status'], translations: Translation[]) => Promise<void>;
  extraFields?: React.ReactNode;
}) {
  const [slug, setSlug] = useState('');
  const [status, setStatus] = useState<T['status']>('DRAFT' as T['status']);
  const [translations, setTranslations] = useState<Translation[]>([
    { locale: 'en', title: '', body: [] },
    { locale: 'ur', title: '', body: [] },
  ]);
  const [locale, setLocale] = useState<'en' | 'ur'>('en');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (document) {
      setSlug(document.slug);
      setStatus(document.status);
      const en = document.translations.find((t) => t.locale === 'en');
      const ur = document.translations.find((t) => t.locale === 'ur');
      setTranslations([en ?? { locale: 'en', title: '', body: [] }, ur ?? { locale: 'ur', title: '', body: [] }]);
    } else {
      setSlug('');
      setStatus('DRAFT' as T['status']);
      setTranslations([{ locale: 'en', title: '', body: [] }, { locale: 'ur', title: '', body: [] }]);
    }
  }, [document, open]);

  const active = translations.find((t) => t.locale === locale)!;
  function updateActive(patch: Partial<Translation>) {
    setTranslations(translations.map((t) => (t.locale === locale ? { ...t, ...patch } : t)));
  }

  return (
    <Dialog open={open} onClose={onClose} title={document ? `Edit ${document.slug}` : 'New'}>
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="field-label">
            Slug
            <input className="field-input" value={slug} disabled={Boolean(document)} onChange={(e) => setSlug(e.target.value)} />
          </label>
          <label className="field-label">
            Status
            <select className="field-input" value={status} onChange={(e) => setStatus(e.target.value as T['status'])}>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </label>
        </div>

        {extraFields}

        <div className="flex gap-2 border-b border-neutral-100">
          {(['en', 'ur'] as const).map((l) => (
            <button
              key={l}
              type="button"
              className={locale === l ? 'nav-tab nav-tab-active' : 'nav-tab'}
              onClick={() => setLocale(l)}
            >
              {l === 'en' ? 'English' : 'Urdu'}
            </button>
          ))}
        </div>

        <label className="field-label">
          Title ({locale})
          <input className="field-input" value={active.title} onChange={(e) => updateActive({ title: e.target.value })} />
        </label>

        <div className="field-label">
          Body ({locale})
          <BlockEditor blocks={active.body} onChange={(body) => updateActive({ body })} />
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={saving || !slug}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(slug, status, translations);
                onClose();
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export default function ContentAdminPage() {
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const [pages, setPages] = useState<Page[] | null>(null);
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [banners, setBanners] = useState<Banner[] | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[] | null>(null);
  const [editingPage, setEditingPage] = useState<Page | null | 'new'>(null);
  const [editingPost, setEditingPost] = useState<BlogPost | null | 'new'>(null);

  const load = useCallback(async () => {
    try {
      const [p, bp, b, m] = await Promise.all([
        adminFetch<Page[]>('/admin/content/pages'),
        adminFetch<BlogPost[]>('/admin/content/posts'),
        adminFetch<Banner[]>('/admin/content/banners'),
        adminFetch<MenuItem[]>('/admin/content/menu-items'),
      ]);
      setPages(p);
      setPosts(bp);
      setBanners(b);
      setMenuItems(m);
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not load content', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addBanner() {
    const placementKey = window.prompt('Placement (homepage_hero, homepage_secondary, category_top)', 'homepage_hero');
    if (!placementKey) return;
    const imageUrl = window.prompt('Image URL');
    if (!imageUrl) return;
    const linkUrl = window.prompt('Link URL (optional)') || undefined;
    const altText = window.prompt('Alt text', placementKey) ?? placementKey;
    try {
      await adminFetch('/admin/content/banners', {
        method: 'POST',
        body: { placementKey, imageUrl, linkUrl, translations: [{ locale: 'en', altText }] },
      });
      addToast('Banner created', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not create the banner', 'error');
    }
  }

  async function toggleBanner(banner: Banner) {
    try {
      await adminFetch(`/admin/content/banners/${banner.id}`, { method: 'PATCH', body: { isActive: !banner.isActive } });
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not update the banner', 'error');
    }
  }

  async function addMenuItem() {
    const menuKey = window.prompt('Menu (footer_help, footer_about)', 'footer_help');
    if (!menuKey) return;
    const url = window.prompt('URL (e.g. /pages/about-us or https://…)');
    if (!url) return;
    const label = window.prompt('Label', url) ?? url;
    try {
      await adminFetch('/admin/content/menu-items', {
        method: 'POST',
        body: { menuKey, url, translations: [{ locale: 'en', label }] },
      });
      addToast('Menu item created', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not create the menu item', 'error');
    }
  }

  async function savePage(slug: string, status: Page['status'], translations: Translation[]) {
    try {
      if (editingPage && editingPage !== 'new') {
        await adminFetch(`/admin/content/pages/${editingPage.id}`, { method: 'PATCH', body: { status, translations } });
      } else {
        await adminFetch('/admin/content/pages', { method: 'POST', body: { slug, status, translations } });
      }
      addToast('Page saved', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not save the page', 'error');
      throw cause;
    }
  }

  async function savePost(slug: string, status: BlogPost['status'], translations: Translation[]) {
    try {
      if (editingPost && editingPost !== 'new') {
        await adminFetch(`/admin/content/posts/${editingPost.id}`, { method: 'PATCH', body: { status, translations } });
      } else {
        await adminFetch('/admin/content/posts', { method: 'POST', body: { slug, status, translations } });
      }
      addToast('Post saved', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not save the post', 'error');
      throw cause;
    }
  }

  if (!pages) return <Loading label="Loading content" />;

  return (
    <>
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
          {toasts.map((t) => (
            <button
              key={t.id}
              type="button"
              className="w-full cursor-pointer rounded-md border border-neutral-200 bg-white p-4 text-start text-sm shadow-md"
              onClick={() => removeToast(t.id)}
            >
              {t.message}
            </button>
          ))}
        </div>
      )}

      <PageHeader title="Content" description="Pages, blog posts, banners and menus — WO-8.1." />

      <Tabs
        label="Content sections"
        items={[
          {
            key: 'pages',
            label: 'Pages',
            content: (
              <div>
                <div className="mb-3 flex justify-end">
                  <button type="button" className="btn-primary" onClick={() => setEditingPage('new')}>
                    New page
                  </button>
                </div>
                <DataTable
                  rows={pages}
                  rowKey={(p) => p.id}
                  emptyLabel="No pages yet"
                  onRowClick={(p) => setEditingPage(p)}
                  columns={[
                    { header: 'Slug', cell: (p) => p.slug },
                    { header: 'Title', cell: (p) => labelOf(p.translations) },
                    { header: 'Status', cell: (p) => p.status, muted: true },
                  ]}
                />
              </div>
            ),
          },
          {
            key: 'posts',
            label: 'Blog',
            content: (
              <div>
                <div className="mb-3 flex justify-end">
                  <button type="button" className="btn-primary" onClick={() => setEditingPost('new')}>
                    New post
                  </button>
                </div>
                <DataTable
                  rows={posts}
                  rowKey={(p) => p.id}
                  emptyLabel="No posts yet"
                  onRowClick={(p) => setEditingPost(p)}
                  columns={[
                    { header: 'Slug', cell: (p) => p.slug },
                    { header: 'Title', cell: (p) => labelOf(p.translations) },
                    { header: 'Category', cell: (p) => p.category ?? '—', muted: true },
                    { header: 'Status', cell: (p) => p.status, muted: true },
                  ]}
                />
              </div>
            ),
          },
          {
            key: 'banners',
            label: 'Banners',
            content: (
              <div>
                <div className="mb-3 flex justify-end">
                  <button type="button" className="btn-secondary" onClick={() => void addBanner()}>
                    Add banner
                  </button>
                </div>
                <DataTable
                  rows={banners}
                  rowKey={(b) => b.id}
                  emptyLabel="No banners yet"
                  columns={[
                    { header: 'Placement', cell: (b) => b.placementKey },
                    { header: 'Alt text', cell: (b) => labelOf(b.translations) },
                    {
                      header: 'Active',
                      cell: (b) => (
                        <button type="button" className="btn-text" onClick={() => void toggleBanner(b)}>
                          {b.isActive ? 'Yes — turn off' : 'No — turn on'}
                        </button>
                      ),
                    },
                  ]}
                />
              </div>
            ),
          },
          {
            key: 'menus',
            label: 'Menus',
            content: (
              <div>
                <div className="mb-3 flex justify-end">
                  <button type="button" className="btn-secondary" onClick={() => void addMenuItem()}>
                    Add menu item
                  </button>
                </div>
                <DataTable
                  rows={menuItems}
                  rowKey={(m) => m.id}
                  emptyLabel="No menu items yet"
                  columns={[
                    { header: 'Menu', cell: (m) => m.menuKey },
                    { header: 'Label', cell: (m) => labelOf(m.translations) },
                    { header: 'URL', cell: (m) => m.url, muted: true },
                  ]}
                />
              </div>
            ),
          },
        ]}
      />

      <DocumentEditor
        open={editingPage !== null}
        onClose={() => setEditingPage(null)}
        document={editingPage === 'new' ? null : editingPage}
        onSave={savePage}
      />
      <DocumentEditor
        open={editingPost !== null}
        onClose={() => setEditingPost(null)}
        document={editingPost === 'new' ? null : editingPost}
        onSave={savePost}
      />
    </>
  );
}
