'use client';

import Link from 'next/link';
import { use } from 'react';
import { ProductEditorLoader } from '@/components/admin/product-editor-loader';
import { ROUTES } from '@/constants/routes';

export default function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <>
      <nav className="mb-4 text-sm text-neutral-900/60">
        <Link href={ROUTES.admin.products} className="hover:text-accent-hover">
          Products &amp; services
        </Link>
        <span className="mx-2">/</span>
        <span>Edit</span>
      </nav>

      <h1 className="mb-6 text-xl font-semibold text-neutral-900">Edit product</h1>
      <ProductEditorLoader productId={id} />
    </>
  );
}
