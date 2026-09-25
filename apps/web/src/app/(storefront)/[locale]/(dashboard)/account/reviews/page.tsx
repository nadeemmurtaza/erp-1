'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatDate } from '@newax/shared';
import { PageHeader, Loading, EmptyState } from '@/components/ui';
import { customerFetch } from '@/lib/customer-client';

interface MyReview {
  id: string;
  productId: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: 'PENDING' | 'PUBLISHED' | 'REJECTED';
  staffReply: string | null;
  createdAt: string;
}

const STATUS_KEY = { PENDING: 'statusPending', PUBLISHED: 'statusPublished', REJECTED: 'statusRejected' } as const;

/** WO-7.5 — what a customer has said about what they bought. */
export default function MyReviewsPage() {
  const t = useTranslations('account.reviews');
  const [reviews, setReviews] = useState<MyReview[] | null>(null);

  useEffect(() => {
    customerFetch<MyReview[]>('/reviews/mine').then(setReviews).catch(() => setReviews([]));
  }, []);

  if (reviews === null) {
    return (
      <>
        <PageHeader title={t('title')} description={t('body')} />
        <Loading />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t('title')} description={t('body')} />
      {reviews.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
          {reviews.map((review) => (
            <li key={review.id} className="space-y-1 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{'★'.repeat(review.rating)}</span>
                <span className="pill">{t(STATUS_KEY[review.status])}</span>
              </div>
              {review.title ? <p className="font-medium">{review.title}</p> : null}
              {review.body ? <p className="text-neutral-900/70">{review.body}</p> : null}
              {review.staffReply ? (
                <p className="bg-neutral-50 p-2 text-xs text-neutral-900/70">{review.staffReply}</p>
              ) : null}
              <p className="text-xs text-neutral-900/60">{formatDate(review.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
