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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-noir-900/40 backdrop-blur-sm animate-fadeIn">
      <div
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl animate-scaleIn max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="sf-icon-btn absolute end-4 top-4 z-10 h-10 w-10 shadow-md"
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
          <div className="relative aspect-square overflow-hidden rounded-xl bg-noir-50">
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
              <h2 className="text-2xl font-semibold text-noir-900">{product.name}</h2>
              <p className="mt-2 text-sm text-noir-500">{product.description}</p>
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
                <p className="text-sm font-medium text-noir-500">Out of stock</p>
              )}
              {product.stitchingAvailable && (
                <p className="text-sm font-medium text-noir-700">
                  ✓ Can be stitched to your measurements
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3 pt-4">
              <button className="w-full sf-btn-primary">Quick Shop</button>
              <button className="w-full sf-btn-secondary">Add to cart</button>
            </div>

            <button
              onClick={onClose}
              className="text-sm text-noir-500 hover:text-noir-900 transition-colors"
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
