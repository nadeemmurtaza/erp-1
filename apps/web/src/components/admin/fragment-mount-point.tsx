'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { Loading } from '@/components/ui';
import type { FragmentToken, MicroFrontendFragment } from '@/types/api';

/**
 * architecture-patterns/143-micro-frontend-architecture.md (WO-143.4) — the
 * actual mount mechanism for a registered fragment: doc 113's own iframe +
 * short-lived embed-token pattern, reused unchanged rather than the literal
 * `next.config.js` module-federation build the doc sketches (see
 * DECISIONS.md ADR-049 for why: `@module-federation/nextjs-mf` does not
 * support this repository's own Next.js 15). Drop this on any admin screen
 * that names itself as a mount point; it renders nothing when no fragment
 * is registered there — no empty card, no broken page.
 */
export function FragmentMountPoint({ mountPoint }: { mountPoint: string }) {
  const [fragments, setFragments] = useState<MicroFrontendFragment[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch<MicroFrontendFragment[]>('/admin/fragments/for-mount-point', { query: { mountPoint } })
      .then((result) => {
        if (!cancelled) setFragments(result);
      })
      .catch(() => {
        if (!cancelled) setFragments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mountPoint]);

  if (!fragments || fragments.length === 0) return null;

  return (
    <>
      {fragments.map((fragment) => (
        <FragmentFrame key={fragment.id} fragment={fragment} mountPoint={mountPoint} />
      ))}
    </>
  );
}

function FragmentFrame({ fragment, mountPoint }: { fragment: MicroFrontendFragment; mountPoint: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function fetchToken() {
      try {
        const { token, expiresAt } = await adminFetch<FragmentToken>(`/admin/fragments/${fragment.key}/token`, {
          method: 'POST',
          query: { mountPoint },
        });
        if (cancelled) return;
        const separator = fragment.remoteUrl.includes('?') ? '&' : '?';
        setSrc(`${fragment.remoteUrl}${separator}embed_token=${encodeURIComponent(token)}`);
        setError(null);

        const msUntilExpiry = new Date(expiresAt).getTime() - Date.now();
        timer = setTimeout(() => void fetchToken(), Math.max(msUntilExpiry - 30_000, 10_000));
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : `Unable to load ${fragment.label}`);
      }
    }

    void fetchToken();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fragment.key, fragment.remoteUrl, fragment.label, mountPoint]);

  if (error) {
    return (
      <p role="alert" className="notice notice-error">
        Unable to load {fragment.label}. {error}
      </p>
    );
  }

  if (!src) return <Loading label={`Loading ${fragment.label}`} />;

  return (
    <iframe
      src={src}
      title={fragment.label}
      className="h-[600px] w-full rounded-md border border-neutral-100"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
    />
  );
}
