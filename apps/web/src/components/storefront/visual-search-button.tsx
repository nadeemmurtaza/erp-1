'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { ApiError, request } from '@/lib/api-client';

interface VisualSearchHit {
  slug: string;
}
interface VisualSearchResult {
  data: VisualSearchHit[];
}

/**
 * WO-9.5 (09-ai-layer.md) — "Visual search via image embedding: upload a
 * photo, find the nearest products." Uploads directly to /search/by-image
 * (describeImage -> embed -> nearest ProductTranslation.embedding, all
 * server-side) and hands the matched slugs to /shop, which already knows how
 * to render a product grid — no separate results UI to build or maintain.
 */
export function VisualSearchButton() {
  const t = useTranslations('shop');
  const locale = useLocale();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await request<VisualSearchResult>('/search/by-image', {
        method: 'POST',
        formData: form,
        query: { locale },
      });

      const slugs = result.data.map((hit) => hit.slug);
      router.push(`/shop?visualSlugs=${encodeURIComponent(slugs.join(','))}`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('visualSearchError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={t('visualSearch')}
        title={t('visualSearch')}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-neutral-500 transition-colors duration-normal hover:bg-neutral-50 hover:text-neutral-900 disabled:opacity-50"
      >
        {busy ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8a2 2 0 0 1 2-2h1.2a1 1 0 0 0 .83-.45l.94-1.41A1 1 0 0 1 9.8 3.6h4.4a1 1 0 0 1 .83.45l.94 1.41a1 1 0 0 0 .83.45H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" />
            <circle cx="12" cy="13" r="3.2" />
          </svg>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void handleFile(file);
        }}
      />
      {error ? (
        <p role="alert" className="absolute end-0 top-full z-dropdown mt-1 w-56 rounded-md bg-red-50 p-2 text-xs text-red-700 shadow-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
