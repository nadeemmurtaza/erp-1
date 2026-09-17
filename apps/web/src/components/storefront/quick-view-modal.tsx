'use client';

import type { Locale } from '@newax/shared';
import { Dialog } from '@/components/ui';
import type { StorefrontProduct } from '@/types/api';
import { Price } from './price';

interface QuickViewModalProps {
  product: StorefrontProduct | null;
  locale: Locale;
  onClose: () => void;
}

/**
 * Product preview from the shop grid, without leaving the listing.
 *
 * The chrome — backdrop, close button, Escape, focus trap, scroll lock — is
 * `Dialog`'s. This file used to own a hand-rolled version that had none of
 * those except the scroll lock: no Escape, no focus trap, no `role="dialog"`,
 * and a backdrop that only *looked* clickable.
 */
export function QuickViewModal({ product, locale, onClose }: QuickViewModalProps) {
  const image = product?.images.find((img) => img.isPrimary) ?? product?.images[0];

  return (
    <Dialog
      open={Boolean(product)}
      onClose={onClose}
      title={product?.name ?? 'Product'}
      className="max-w-2xl"
    >
      {product ? (
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="relative aspect-square overflow-hidden rounded-xl bg-neutral-50">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image.url}
                alt={image.alt ?? product.name}
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>

          <div className="flex flex-col gap-4">
            <p className="text-sm text-neutral-500">{product.description}</p>

            <Price
              amount={product.fromPrice}
              compareAt={product.compareAtPrice}
              locale={locale}
            />

            <div className="space-y-2">
              {!product.inStock ? (
                <p className="text-sm font-medium text-neutral-500">Out of stock</p>
              ) : null}
              {product.stitchingAvailable ? (
                <p className="text-sm font-medium text-neutral-700">
                  ✓ Can be stitched to your measurements
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 pt-2">
              <button type="button" className="btn-primary w-full">
                Quick Shop
              </button>
              <button type="button" className="btn-secondary w-full">
                Add to cart
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
