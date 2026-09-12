'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { trackEvent } from '@/lib/analytics-client';
import { STORAGE_KEYS } from '@/constants/storage';

const UTM_KEY = STORAGE_KEYS.analytics.utmSource;

/**
 * Fires one page_view per storefront route change. Mounted once in the
 * locale layout so every page under [locale] is covered without each page
 * remembering to call it. Renders nothing — this beacon has no visible UI.
 */
export function AnalyticsBeacon() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const utmSource = useRef<string | undefined>(undefined);

  useEffect(() => {
    // utm_source only means anything on the first page of a session — a
    // later internal link click carries no utm param and must not blank out
    // the campaign that actually brought the visitor in. Read it once and
    // cache the answer in sessionStorage for the rest of this tab's session.
    try {
      const stored = sessionStorage.getItem(UTM_KEY);
      if (stored !== null) {
        utmSource.current = stored || undefined;
      } else {
        const fromUrl = searchParams.get('utm_source') ?? '';
        sessionStorage.setItem(UTM_KEY, fromUrl);
        utmSource.current = fromUrl || undefined;
      }
    } catch {
      // Storage disabled — fall back to whatever this load's URL carries.
      utmSource.current = searchParams.get('utm_source') ?? undefined;
    }
    // Deliberately once per mount, not once per navigation — see comment
    // above. Runs before the page_view effect below on initial mount, since
    // effects fire in declaration order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    trackEvent('page_view', {
      path: pathname,
      referrer: document.referrer,
      utmSource: utmSource.current,
    });
  }, [pathname]);

  return null;
}
