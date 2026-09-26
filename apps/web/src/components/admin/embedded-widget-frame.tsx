'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { Loading } from '@/components/ui';
import type { EmbedToken, EmbeddedWidget } from '@/types/api';

/**
 * architecture-patterns/113-micro-frontend-embedding.md (WO-113.2) — a
 * narrow, reusable iframe container, not a micro-frontend runtime. Reusable
 * across any admin screen that wants to host one; today that screen is
 * `/admin/embeds`. Re-issues its own token shortly before the previous one
 * expires, so a long-open tab does not silently stop working.
 */
export function EmbeddedWidgetFrame({ widget }: { widget: EmbeddedWidget }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function fetchToken() {
      try {
        const { token, expiresAt } = await adminFetch<EmbedToken>(`/admin/embeds/${widget.key}/token`, { method: 'POST' });
        if (cancelled) return;
        const separator = widget.targetUrl.includes('?') ? '&' : '?';
        setSrc(`${widget.targetUrl}${separator}embed_token=${encodeURIComponent(token)}`);
        setError(null);

        const msUntilExpiry = new Date(expiresAt).getTime() - Date.now();
        timer = setTimeout(() => void fetchToken(), Math.max(msUntilExpiry - 30_000, 10_000));
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : `Unable to load ${widget.label}`);
      }
    }

    void fetchToken();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [widget.key, widget.targetUrl, widget.label]);

  if (error) {
    return (
      <p role="alert" className="notice notice-error">
        Unable to load {widget.label}. {error}
      </p>
    );
  }

  if (!src) return <Loading label={`Loading ${widget.label}`} />;

  return (
    <iframe
      src={src}
      title={widget.label}
      className="h-[600px] w-full rounded-md border border-neutral-100"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
    />
  );
}
