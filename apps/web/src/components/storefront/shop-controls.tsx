'use client';

import { useState, Suspense } from 'react';
import type { Locale } from '@yaseen/shared';
import type { StorefrontProduct } from '@/lib/api-types';
import { ProductsGrid } from './products-grid';
import { GridToggleWrapper } from './grid-toggle-wrapper';
import { SortSelect } from './sort-select';

interface ShopControlsProps {
  products: StorefrontProduct[];
  locale: Locale;
  resultsCount: string;
  title: string;
}

export function ShopControls({ products, locale, resultsCount, title }: ShopControlsProps) {
  const [gridCols, setGridCols] = useState<1 | 2 | 3>(3);

  return (
    <>
      <div className="sf-card mb-8 flex items-center justify-between gap-4 p-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-noir-900">{title}</h1>
          <p className="mt-1 text-sm text-noir-500">{resultsCount}</p>
        </div>
        <div className="flex items-center gap-4">
          <Suspense fallback={<div className="flex gap-1">
            <div className="w-2 h-2 rounded-full bg-noir-200" />
            <div className="w-2 h-2 rounded-full bg-noir-200" />
            <div className="w-2 h-2 rounded-full bg-noir-200" />
          </div>}>
            <GridToggleWrapper value={gridCols} onChange={setGridCols} />
          </Suspense>
          <SortSelect />
        </div>
      </div>

      <ProductsGrid
        products={products}
        locale={locale}
        gridCols={gridCols}
        onGridColsChange={setGridCols}
      />
    </>
  );
}
