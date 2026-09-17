'use client';

import { useState } from 'react';
import type { Locale } from '@newax/shared';
import type { StorefrontProduct } from '@/types/api';
import { ProductCard } from './product-card';
import { QuickViewModal } from './quick-view-modal';
import { AnimatedSection } from './animated-section';

interface ProductsGridProps {
  products: StorefrontProduct[];
  locale: Locale;
  gridCols: 1 | 2 | 3;
  onGridColsChange: (cols: 1 | 2 | 3) => void;
}

/*
 * `gridCols` is a density preference, not a literal column count — each
 * option is its own responsive cascade so the grid stays genuinely
 * per-breakpoint instead of a single fixed number reflowing. Option 3 (the
 * shop page's default) is the reference layout itself: 2 columns on mobile,
 * 3 from tablet (md:), 4 from desktop (lg:). Options 1 and 2 are deliberately
 * sparser at every tier so picking a lower density is visibly different from
 * the default rather than just matching what the current breakpoint already
 * shows on its own — e.g. the old "3" topped out at a flat 3 columns on
 * desktop, indistinguishable from the tablet tier once the default itself
 * grew a dedicated tablet step.
 */
const GRID_CLASSES: Record<1 | 2 | 3, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
};

// Widest column count each density actually reaches, for above-the-fold
// image priority — distinct from the option number itself now that option 3
// can render 4 real columns on desktop.
const MAX_VISIBLE_COLS: Record<1 | 2 | 3, number> = {
  1: 1,
  2: 2,
  3: 4,
};

export function ProductsGrid({ products, locale, gridCols, onGridColsChange: _onGridColsChange }: ProductsGridProps) {
  const [quickViewProduct, setQuickViewProduct] = useState<StorefrontProduct | null>(null);

  return (
    <>
      <div className={`grid gap-3 sm:gap-4 lg:gap-6 ${GRID_CLASSES[gridCols]}`}>
        {products.map((product, index) => (
          <AnimatedSection key={product.id} direction="up" delay={index * 0.05}>
            <ProductCard
              product={product}
              locale={locale}
              priority={index < MAX_VISIBLE_COLS[gridCols]}
              onQuickView={() => setQuickViewProduct(product)}
            />
          </AnimatedSection>
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
