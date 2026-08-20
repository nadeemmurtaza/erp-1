'use client';

import { useEffect } from 'react';
import type { StorefrontProduct } from '@/lib/api-types';
import { Price } from './price';
import type { Locale } from '@yaseen/shared';

interface QuickViewModalProps {
  product: StorefrontProduct | null;
  locale: Locale;
  onClose: () => void;
}

export function QuickViewModal({ product, locale, onClose }: QuickViewModalProps) {
  useEffect(() => {
    if (product) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [product]);

  if (!product) return null;

  const image = product.images.find((img) => img.isPrimary) ?? product.images[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-fadeIn">
      <div
        className="relative w-full max-w-2xl bg-white rounded-lg shadow-xl animate-scaleIn max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 end-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md hover:bg-sand-50 transition-colors"
          aria-label="Close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>

        <div className="grid gap-6 p-6 sm:grid-cols-2">
          {/* Image */}
          <div className="relative aspect-square overflow-hidden rounded-lg bg-sand-100">
            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image.url}
                alt={image.alt ?? product.name}
                className="h-full w-full object-cover"
              />
            )}
          </div>

          {/* Details */}
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-ink">{product.name}</h2>
              <p className="mt-2 text-sm text-ink/60">{product.description}</p>
            </div>

            <div>
              <Price
                amount={product.fromPrice}
                compareAt={product.compareAtPrice}
                locale={locale}
              />
            </div>

            <div className="space-y-2">
              {!product.inStock && (
                <p className="text-sm font-medium text-ink/60">Out of stock</p>
              )}
              {product.stitchingAvailable && (
                <p className="text-sm font-medium text-brand-700">
                  ✓ Can be stitched to your measurements
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-4">
              <button className="flex-1 btn-primary">Add to cart</button>
              <button className="btn border border-brand-600 text-brand-700 hover:bg-brand-50">
                ♡
              </button>
            </div>

            <button
              onClick={onClose}
              className="text-sm text-ink/60 hover:text-ink transition-colors"
            >
              View full details →
            </button>
          </div>
        </div>
      </div>

      {/* Backdrop close */}
      <div
        className="fixed inset-0 -z-10"
        onClick={onClose}
        aria-hidden="true"
      />
    </div>
  );
}
