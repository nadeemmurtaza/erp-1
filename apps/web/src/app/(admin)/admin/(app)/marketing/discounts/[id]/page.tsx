'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { PageHeader, Loading } from '@/components/ui';
import { DiscountForm, type DiscountFormValues } from '@/components/admin/marketing/discount-form';

export default function EditDiscountPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [values, setValues] = useState<DiscountFormValues | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void adminFetch<DiscountFormValues>(`/admin/promotions/discounts/${params.id}`)
      .then(setValues)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load this discount'));
  }, [params.id]);

  if (error) {
    return <p role="alert" className="notice notice-error">{error}</p>;
  }
  if (!values) {
    return <Loading />;
  }

  return (
    <>
      <PageHeader title={values.name} description="Editing this rule takes effect immediately for new orders." />
      <DiscountForm
        initial={values}
        submitLabel="Save changes"
        onSubmit={async (payload) => {
          await adminFetch(`/admin/promotions/discounts/${params.id}`, { method: 'PATCH', body: payload });
          router.push('/admin/marketing/discounts');
        }}
      />
    </>
  );
}
