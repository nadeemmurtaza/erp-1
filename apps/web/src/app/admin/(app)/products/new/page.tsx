'use client';

import Link from 'next/link';
import { ProductEditorLoader } from '@/components/admin/product-editor-loader';

export default function NewProductPage() {
  return (
    <>
      <nav className="mb-4 text-sm text-ink/60">
        <Link href="/admin/products" className="hover:text-brand-700">
          Products &amp; services
        </Link>
        <span className="mx-2">/</span>
        <span>New</span>
      </nav>

      <h1 className="mb-6 text-xl font-semibold text-ink">Add a product or service</h1>
      <ProductEditorLoader />
    </>
  );
}
