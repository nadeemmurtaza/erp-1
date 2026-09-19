'use client';

import Link from 'next/link';
import { ProductEditorLoader } from '@/components/admin/product-editor-loader';
import { ROUTES } from '@/constants/routes';

export default function NewProductPage() {
  return (
    <>
      <nav className="mb-4 text-sm text-neutral-900/60">
        <Link href={ROUTES.admin.products} className="hover:text-accent-hover">
          Products &amp; services
        </Link>
        <span className="mx-2">/</span>
        <span>New</span>
      </nav>

      <h1 className="mb-6 text-xl font-semibold text-neutral-900">Add a product or service</h1>
      <ProductEditorLoader />
    </>
  );
}
