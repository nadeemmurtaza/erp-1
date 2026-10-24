'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatDate } from '@newax/shared';
import { customerFetch, getCustomerToken } from '@/lib/customer-client';
import { request } from '@/lib/api-client';
import { Section, Disclosure } from '@/components/ui';

interface ReviewView {
  id: string;
  userId: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  orderItemId: string | null;
  helpfulCount: number;
  staffReply: string | null;
  createdAt: string;
}

/** WO-9.9 (09-ai-layer.md) — "'Most customers say it runs small' above the review list." */
interface ReviewSummaryView {
  summaryText: string;
  summaryTextUr: string | null;
}

/** WO-7.5 — reviews and Q&A, on the product's own page. */
export function ProductReviews({ productId }: { productId: string }) {
  const t = useTranslations('product.reviews');
  const locale = useLocale();
  const [reviews, setReviews] = useState<ReviewView[]>([]);
  const [summary, setSummary] = useState<ReviewSummaryView | null>(null);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const signedIn = typeof window !== 'undefined' && Boolean(getCustomerToken());

  useEffect(() => {
    request<{ data: ReviewView[] }>(`/products/${productId}/reviews`, { query: { page: 1, pageSize: 20 } })
      .then((res) => setReviews(res.data))
      .catch(() => setReviews([]));
  }, [productId]);

  useEffect(() => {
    request<ReviewSummaryView | null>(`/products/${productId}/reviews/summary`)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [productId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      await customerFetch('/reviews', { method: 'POST', body: { productId, rating, title: title || undefined, body: body || undefined } });
      setMessage({ tone: 'success', text: t('submitted') });
      setTitle('');
      setBody('');
    } catch (cause) {
      setMessage({ tone: 'error', text: cause instanceof Error ? cause.message : t('failed') });
    } finally {
      setSubmitting(false);
    }
  }

  async function markHelpful(id: string) {
    try {
      await request(`/reviews/${id}/helpful`, { method: 'POST' });
      setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, helpfulCount: r.helpfulCount + 1 } : r)));
    } catch {
      // Best-effort — a failed helpful-vote isn't worth surfacing an error for.
    }
  }

  return (
    <Section title={t('title')} className="mt-6 border-t border-neutral-100 pt-6">
      {summary ? (
        <p className="mb-4 text-sm font-medium text-neutral-900">
          {locale === 'ur' ? (summary.summaryTextUr ?? summary.summaryText) : summary.summaryText}
        </p>
      ) : null}

      {reviews.length === 0 ? (
        <p className="text-sm text-neutral-500">{t('empty')}</p>
      ) : (
        <ul className="space-y-4">
          {reviews.map((review) => (
            <li key={review.id} className="border-b border-neutral-100 pb-4 text-sm last:border-0">
              <div className="flex items-center gap-2">
                <span>{'★'.repeat(review.rating)}</span>
                {review.orderItemId ? <span className="pill">{t('verifiedPurchase')}</span> : null}
                <span className="text-xs text-neutral-500">{formatDate(review.createdAt)}</span>
              </div>
              {review.title ? <p className="mt-1 font-medium">{review.title}</p> : null}
              {review.body ? <p className="mt-1 text-neutral-600">{review.body}</p> : null}
              {review.staffReply ? <p className="mt-2 bg-neutral-50 p-2 text-xs text-neutral-600">{review.staffReply}</p> : null}
              <button type="button" onClick={() => markHelpful(review.id)} className="btn-text mt-1 text-xs">
                {t('helpful')} ({review.helpfulCount})
              </button>
            </li>
          ))}
        </ul>
      )}

      {signedIn ? (
        <Disclosure label={t('writeReview')} className="mt-4">
          <form onSubmit={submit} className="max-w-md space-y-3">
            <div>
              <label className="field-label" htmlFor="reviewRating">
                {t('rating')}
              </label>
              <select
                id="reviewRating"
                className="field-input"
                value={rating}
                onChange={(event) => setRating(Number(event.target.value))}
              >
                {[5, 4, 3, 2, 1].map((value) => (
                  <option key={value} value={value}>
                    {'★'.repeat(value)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="reviewTitle">
                {t('reviewTitle')}
              </label>
              <input id="reviewTitle" className="field-input" value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="reviewBody">
                {t('reviewBody')}
              </label>
              <textarea id="reviewBody" className="field-input" rows={3} value={body} onChange={(event) => setBody(event.target.value)} />
            </div>
            {message ? (
              <p className={message.tone === 'error' ? 'notice notice-error' : 'notice notice-success'}>{message.text}</p>
            ) : null}
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? t('submitting') : t('submit')}
            </button>
          </form>
        </Disclosure>
      ) : (
        <p className="mt-4 text-sm text-neutral-500">{t('signInToReview')}</p>
      )}
    </Section>
  );
}
