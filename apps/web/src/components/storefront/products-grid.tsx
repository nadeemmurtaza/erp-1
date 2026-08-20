'use client';

import { useState } from 'react';
import type { Locale } from '@yaseen/shared';
import type { StorefrontProduct } from '@/lib/api-types';
import { ProductCard } from './product-card';
import { GridToggle } from './grid-toggle';
import { QuickViewModal } from './quick-view-modal';

interface ProductsGridProps {
  products: StorefrontProduct[];
  locale: Locale;
}

export function ProductsGrid({ products, locale }: ProductsGridProps) {
  const [gridCols, setGridCols] = useState<1 | 2 | 3>(3);
  const [quickViewProduct, setQuickViewProduct] = useState<StorefrontProduct | null>(null);

  const gridClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  }[gridCols];

  return (
    <>
      <div className="mb-6 flex items-center justify-end">
        <GridToggle value={gridCols} onChange={setGridCols} />
      </div>

      <div className={`grid gap-6 ${gridClass}`}>
        {products.map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            locale={locale}
            priority={index < gridCols}
            onQuickView={() => setQuickViewProduct(product)}
          />
        ))}
      </div>

      <QuickViewModal
        product={quickViewProduct}
        locale={locale}
        onClose={() => setQuickViewProduct(null)}
      />
    </>
  );
}
