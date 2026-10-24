'use client';

import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { RecipeEditor } from '@/components/admin/bom/recipe-editor';

export default function NewRecipePage() {
  const searchParams = useSearchParams();
  const variantId = searchParams.get('variantId') ?? undefined;

  return (
    <>
      <PageHeader title="New recipe" description="Which raw materials this finished product is made from." />
      <RecipeEditor initialVariantId={variantId} />
    </>
  );
}
