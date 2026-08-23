'use client';

import { useState } from 'react';
import type { Locale } from '@yaseen/shared';
import type { StorefrontProduct } from '@/lib/api-types';
import { ProductCard } from './product-card';
import { QuickViewModal } from './quick-view-modal';

interface ProductsGridProps {
  products: StorefrontProduct[];
  locale: Locale;
  gridCols: 1 | 2 | 3;
  onGridColsChange: (cols: 1 | 2 | 3) => void;
}

export function ProductsGrid({ products, locale, gridCols, onGridColsChange: _onGridColsChange }: ProductsGridProps) {
  const [quickViewProduct, setQuickViewProduct] = useState<StorefrontProduct | null>(null);

  const gridClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  }[gridCols];

  return (
    <>
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
