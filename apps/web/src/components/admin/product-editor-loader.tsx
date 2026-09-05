'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import type { AdminCategory, AdminProduct, GarmentType } from '@/types/api';
import { ProductForm } from './product-form';

/**
 * Loads the reference data the editor needs (categories, garment types) and,
 * when editing, the product itself — then hands them to the form.
 *
 * Kept separate from ProductForm so the form stays a pure controlled component
 * that is easy to reason about, and both the new and edit routes share this.
 */
export function ProductEditorLoader({ productId }: { productId?: string }) {
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);
  const [garmentTypes, setGarmentTypes] = useState<GarmentType[] | null>(null);
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      adminFetch<AdminCategory[]>('/admin/catalog/categories'),
      adminFetch<GarmentType[]>('/admin/measurements/garment-types'),
      productId
        ? adminFetch<AdminProduct>(`/admin/catalog/products/${productId}`)
        : Promise.resolve(null),
    ])
      .then(([loadedCategories, loadedGarments, loadedProduct]) => {
        if (cancelled) return;
        setCategories(loadedCategories);
        setGarmentTypes(loadedGarments);
        setProduct(loadedProduct);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load the editor');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (error) {
    return (
      <p role="alert" className="card p-4 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!categories || !garmentTypes || (productId && !product)) {
    return <p className="text-sm text-neutral-900/50">Loading…</p>;
  }

  return (
    <ProductForm
      product={product ?? undefined}
      categories={categories}
      garmentTypes={garmentTypes}
    />
  );
}
