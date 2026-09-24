'use client';

import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import { PageHeader } from '@/components/ui';
import { DiscountForm, EMPTY_DISCOUNT } from '@/components/admin/marketing/discount-form';

export default function NewDiscountPage() {
  const router = useRouter();

  return (
    <>
      <PageHeader title="New discount" description="Define the rule, then preview it against real orders before it goes live." />
      <DiscountForm
        initial={EMPTY_DISCOUNT}
        submitLabel="Create discount"
        onSubmit={async (payload) => {
          const created = await adminFetch<{ id: string }>('/admin/promotions/discounts', {
            method: 'POST',
            body: payload,
          });
          router.push(`/admin/marketing/discounts/${created.id}`);
        }}
      />
    </>
  );
}
