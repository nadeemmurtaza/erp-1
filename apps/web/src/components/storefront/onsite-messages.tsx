'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ActiveOnsiteMessage } from '@newax/shared';
import { Dialog } from '@/components/ui';
import { STORAGE_KEYS } from '@/constants/storage';
import { usePathname } from '@/i18n/navigation';
import { fetchActiveOnsiteMessages, subscribeToNewsletter } from '@/lib/onsite-messages-client';

function readDismissed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.onsiteMessagesDismissed);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function persistDismissed(ids: Set<string>): void {
  try {
    window.localStorage.setItem(STORAGE_KEYS.onsiteMessagesDismissed, JSON.stringify([...ids]));
  } catch {
    // Private-window or storage-blocked — the message simply reappears next visit.
  }
}

/**
 * WO-8.6 — the storefront half of on-site messaging. `/admin/onsite-messages`
 * configures what to show and to whom; this renders whatever the public
 * `/onsite-messages/active` endpoint currently returns for this page and
 * visitor. Deliberately restrained (the doc's own words: "three popups on
 * one page loses more revenue than any of them earns") — at most one
 * announcement bar, one cookie-consent banner and one modal (popup or
 * newsletter capture) show at a time, however many messages are configured.
 */
export function OnsiteMessages({ locale }: { locale: string }) {
  const t = useTranslations('onsiteMessages');
  const pathname = usePathname();

  const [candidates, setCandidates] = useState<ActiveOnsiteMessage[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchActiveOnsiteMessages(pathname, locale)
      .then((result) => {
        if (!cancelled) setCandidates(result);
      })
      .catch(() => {
        // Best-effort — a broken marketing widget must never block the page.
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, locale]);

  function dismiss(id: string): void {
    setDismissed((prev) => {
      const next = new Set(prev).add(id);
      persistDismissed(next);
      return next;
    });
    setModalOpen(false);
  }

  const announcement = candidates.find((m) => m.kind === 'ANNOUNCEMENT_BAR' && !dismissed.has(m.id));
  const cookieConsent = candidates.find((m) => m.kind === 'COOKIE_CONSENT' && !dismissed.has(m.id));
  const modal = useMemo(
    () => candidates.find((m) => (m.kind === 'POPUP' || m.kind === 'NEWSLETTER_CAPTURE') && !dismissed.has(m.id)),
    [candidates, dismissed],
  );

  useEffect(() => {
    if (!modal) return;

    if (modal.trigger === 'IMMEDIATE') {
      setModalOpen(true);
      return;
    }

    if (modal.trigger === 'TIMED') {
      const timer = window.setTimeout(() => setModalOpen(true), (modal.delaySeconds ?? 5) * 1000);
      return () => window.clearTimeout(timer);
    }

    // EXIT_INTENT — the cursor leaves through the top of the viewport, the
    // one direction a real "about to close the tab" move actually produces.
    function onMouseLeave(event: MouseEvent): void {
      if (event.clientY <= 0) setModalOpen(true);
    }
    document.addEventListener('mouseleave', onMouseLeave);
    return () => document.removeEventListener('mouseleave', onMouseLeave);
  }, [modal]);

  return (
    <>
      {announcement && (
        <div className="flex items-center justify-center gap-3 bg-neutral-900 px-4 py-2 text-center text-sm text-white">
          <span>
            {announcement.headline}
            {announcement.body ? <span className="ms-2 text-white/80">{announcement.body}</span> : null}
          </span>
          {announcement.linkUrl && announcement.ctaLabel ? (
            <a href={announcement.linkUrl} className="font-semibold underline underline-offset-2">
              {announcement.ctaLabel}
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => dismiss(announcement.id)}
            aria-label={t('close')}
            className="ms-2 shrink-0 text-white/70 hover:text-white"
          >
            ×
          </button>
        </div>
      )}

      {modal && (
        <Dialog open={modalOpen} onClose={() => dismiss(modal.id)} title={modal.headline || t('defaultTitle')}>
          {modal.kind === 'NEWSLETTER_CAPTURE' ? (
            <NewsletterCaptureBody message={modal} locale={locale} />
          ) : (
            <div className="space-y-4">
              {modal.body ? <p className="text-sm text-neutral-700">{modal.body}</p> : null}
              {modal.linkUrl && modal.ctaLabel ? (
                <a href={modal.linkUrl} className="btn-primary inline-flex">
                  {modal.ctaLabel}
                </a>
              ) : null}
            </div>
          )}
        </Dialog>
      )}

      {cookieConsent && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-white p-4 shadow-md">
          <div className="container-page flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-neutral-700">
              {cookieConsent.headline}
              {cookieConsent.body ? <span className="ms-1">{cookieConsent.body}</span> : null}
            </p>
            <button type="button" className="btn-primary shrink-0" onClick={() => dismiss(cookieConsent.id)}>
              {cookieConsent.ctaLabel || t('accept')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function NewsletterCaptureBody({ message, locale }: { message: ActiveOnsiteMessage; locale: string }) {
  const t = useTranslations('onsiteMessages');
  const tCommon = useTranslations('common');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await subscribeToNewsletter(email, locale);
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tCommon('error'));
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return <p className="text-sm font-medium text-neutral-900">{t('subscribed')}</p>;
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void submit(e)}>
      {message.body ? <p className="text-sm text-neutral-700">{message.body}</p> : null}
      {error ? (
        <p role="alert" className="notice notice-error">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('emailPlaceholder')}
          className="field-input flex-1"
        />
        <button type="submit" className="btn-primary shrink-0" disabled={submitting}>
          {submitting ? t('subscribing') : message.ctaLabel || t('subscribe')}
        </button>
      </div>
    </form>
  );
}
