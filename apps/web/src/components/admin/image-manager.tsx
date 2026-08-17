'use client';

import Image from 'next/image';
import { useState } from 'react';
import clsx from 'clsx';
import { adminFetch } from '@/lib/admin-client';

interface ProductImageRow {
  id: string;
  url: string;
  alt: string | null;
  order: number;
  isPrimary: boolean;
}

/**
 * Upload, reorder and delete product photographs.
 *
 * Reordering is by move-left/move-right rather than drag-and-drop: it works on
 * a phone and with a keyboard, which drag-and-drop does not, and shop staff
 * photograph and upload from a phone.
 */
export function ImageManager({
  productId,
  initialImages,
}: {
  productId: string;
  initialImages: ProductImageRow[];
}) {
  const [images, setImages] = useState<ProductImageRow[]>(
    [...initialImages].sort((a, b) => a.order - b.order),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('alt', file.name.replace(/\.[^.]+$/, ''));

        const created = await adminFetch<ProductImageRow>(
          `/admin/catalog/products/${productId}/images`,
          { method: 'POST', formData },
        );
        setImages((current) => [...current, created]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function persistOrder(next: ProductImageRow[]) {
    const previous = images;
    // Optimistic: the grid reorders immediately and rolls back if the save fails.
    setImages(next.map((image, index) => ({ ...image, order: index, isPrimary: index === 0 })));

    try {
      await adminFetch(`/admin/catalog/products/${productId}/images/order`, {
        method: 'PATCH',
        body: { imageIds: next.map((image) => image.id) },
      });
    } catch (cause) {
      setImages(previous);
      setError(cause instanceof Error ? cause.message : 'Could not save the new order');
    }
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;

    const next = [...images];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    void persistOrder(next);
  }

  async function remove(id: string) {
    const previous = images;
    setImages((current) => current.filter((image) => image.id !== id));

    try {
      await adminFetch(`/admin/catalog/images/${id}`, { method: 'DELETE' });
    } catch (cause) {
      setImages(previous);
      setError(cause instanceof Error ? cause.message : 'Could not delete the image');
    }
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {images.length > 0 ? (
        <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {images.map((image, index) => (
            <li
              key={image.id}
              className={clsx(
                'overflow-hidden rounded-md border',
                index === 0 ? 'border-brand-500' : 'border-sand-200',
              )}
            >
              <div className="relative aspect-[3/4] bg-sand-100">
                <Image
                  src={image.url}
                  alt={image.alt ?? ''}
                  fill
                  sizes="150px"
                  className="object-cover"
                />
                {index === 0 ? (
                  <span className="absolute start-1 top-1 rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    Thumbnail
                  </span>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-1 px-1.5 py-1">
                <div className="flex gap-0.5">
                  <IconButton label="Move earlier" onClick={() => move(index, -1)} disabled={index === 0}>
                    ←
                  </IconButton>
                  <IconButton
                    label="Move later"
                    onClick={() => move(index, 1)}
                    disabled={index === images.length - 1}
                  >
                    →
                  </IconButton>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(image.id)}
                  className="rounded px-1.5 py-0.5 text-xs text-red-700 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-ink/50">No photographs yet.</p>
      )}

      <label className="btn-secondary cursor-pointer">
        {busy ? 'Uploading…' : 'Upload images'}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          disabled={busy}
          onChange={(event) => {
            void upload(event.target.files);
            event.target.value = '';
          }}
          className="sr-only"
        />
      </label>
      <p className="mt-2 text-xs text-ink/40">JPEG, PNG, WebP or AVIF, up to 8MB each.</p>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded px-1.5 py-0.5 text-xs text-ink/60 hover:bg-sand-100 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
