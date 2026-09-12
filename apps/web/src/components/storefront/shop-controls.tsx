'use client';

import { useState, Suspense } from 'react';
import type { Locale } from '@yaseen/shared';
import type { StorefrontProduct } from '@/types/api';
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
      {/* Stacks on mobile: the heading, the column toggle and the sort select
          cannot share one row at 375px — they overflowed the viewport by ~44px
          and pushed the whole page into a horizontal scroll. */}
      <div className="card mb-8 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-neutral-900">{title}</h1>
          <p className="mt-1 text-sm text-neutral-500">{resultsCount}</p>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end sm:gap-4">
          {/* The column toggle is desktop-only: a phone always shows the grid
              two-up, so the control changes nothing there and its width is
              what pushed the sort select onto a second line. */}
          <div className="hidden sm:block">
            <Suspense fallback={<div className="flex gap-1">
              <div className="w-2 h-2 rounded-full bg-neutral-200" />
              <div className="w-2 h-2 rounded-full bg-neutral-200" />
              <div className="w-2 h-2 rounded-full bg-neutral-200" />
            </div>}>
              <GridToggleWrapper value={gridCols} onChange={setGridCols} />
            </Suspense>
          </div>
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
