'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { DataTable, PageHeader } from '@/components/ui';

interface WishlistedProduct {
  productId: string;
  name: string;
  wishlistCount: number;
}

/** WO-7.6's staff value: what customers want and can't have — feeds Phase 1's reorder suggestions. */
export default function WishlistedOutOfStockPage() {
  const [rows, setRows] = useState<WishlistedProduct[] | null>(null);

  useEffect(() => {
    adminFetch<WishlistedProduct[]>('/admin/wishlist/out-of-stock-report')
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  return (
    <>
      <PageHeader
        title="Wishlisted & Out of Stock"
        description="Products customers have saved that currently have zero stock across every variant, most-wanted first."
      />
      <DataTable<WishlistedProduct>
        rows={rows}
        loading={rows === null}
        rowKey={(row) => row.productId}
        emptyLabel="Nothing wishlisted is currently out of stock."
        columns={[
          { header: 'Product', cell: (row) => row.name },
          { header: 'Times wishlisted', cell: (row) => row.wishlistCount, numeric: true },
        ]}
      />
    </>
  );
}
