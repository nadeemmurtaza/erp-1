'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { adminFetch } from '@/lib/admin-client';

interface ProductImageRow {
  id: string;
  url: string;
  alt: string | null;
  order: number;
  isPrimary: boolean;
}

/** What makes alt text worth writing, shown once above the grid rather than repeated per image. */
const ALT_TEXT_GUIDANCE =
  "Say what's in the photo, plainly: the garment, its colour, and the view — " +
  '"Maroon chiffon 3-piece suit, front view" or "Unstitched lawn fabric, close-up of print" ' +
  "rather than a filename. This is what a screen reader reads aloud and what search engines " +
  'index, so skip the brand name and words like "image of" or "photo of" — they add nothing a ' +
  'blind shopper or a search result needs.';

const ALT_TEXT_PLACEHOLDER = 'e.g. "Maroon chiffon 3-piece suit, front view"';

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
        // No alt text here — a filename ("IMG_2024_0193") is not a
        // description of the photo. Staff write the real one below,
        // per image, right after it lands in the grid.

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

  async function saveAlt(id: string, alt: string) {
    const previous = images;
    setImages((current) => current.map((image) => (image.id === id ? { ...image, alt } : image)));

    try {
      await adminFetch(`/admin/catalog/images/${id}`, { method: 'PATCH', body: { alt } });
    } catch (cause) {
      setImages(previous);
      setError(cause instanceof Error ? cause.message : 'Could not save the alt text');
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
        <>
        <p className="mb-3 text-xs text-neutral-900/50">{ALT_TEXT_GUIDANCE}</p>
        <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {images.map((image, index) => (
            <li
              key={image.id}
              className={cn(
                'overflow-hidden rounded-md border',
                index === 0 ? 'border-accent' : 'border-neutral-100',
              )}
            >
              <div className="relative aspect-[3/4] bg-white">
                <Image
                  src={image.url}
                  alt={image.alt ?? ''}
                  fill
                  sizes="150px"
                  className="object-cover"
                />
                {index === 0 ? (
                  <span className="absolute start-1 top-1 rounded bg-accent-hover px-1.5 py-0.5 text-[10px] font-medium text-white">
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

              <div className="px-1.5 pb-1.5">
                <AltTextField
                  key={image.id}
                  value={image.alt ?? ''}
                  onSave={(alt) => void saveAlt(image.id, alt)}
                />
              </div>
            </li>
          ))}
        </ul>
        </>
      ) : (
        <p className="mb-4 text-sm text-neutral-900/50">No photographs yet.</p>
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
      <p className="mt-2 text-xs text-neutral-900/40">JPEG, PNG, WebP or AVIF, up to 8MB each.</p>
    </div>
  );
}

/**
 * Saves on blur, not on every keystroke — an admin field, not a live search.
 * Uncontrolled-ish: keeps its own draft so retyping doesn't fight a parent
 * re-render mid-edit, but resets if the image's saved value changes under it
 * (e.g. a rollback after a failed save elsewhere).
 */
function AltTextField({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);

  return (
    <input
      type="text"
      value={draft}
      placeholder={ALT_TEXT_PLACEHOLDER}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onSave(draft);
      }}
      className="w-full rounded border border-neutral-100 px-1.5 py-1 text-[11px] text-neutral-900 placeholder:text-neutral-900/30 focus:border-accent focus:outline-none"
    />
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
      className="rounded px-1.5 py-0.5 text-xs text-neutral-900/60 hover:bg-white disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/**
 * A photo picked before the product exists to attach it to.
 *
 * `previewUrl` is a local `URL.createObjectURL(file)` blob — nothing has been
 * uploaded yet. The file and its alt text travel with the wizard's other
 * draft state and only reach the server in `uploadStagedImages`, once the
 * product itself has been created and there is an id to attach them to.
 */
export interface StagedImage {
  localId: string;
  file: File;
  previewUrl: string;
  alt: string;
}

function newLocalId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Math.random());
}

/**
 * Photo picker for a product that does not have an id yet — new-product
 * creation, where `ImageManager` above cannot be used because it uploads to
 * `/products/:id/images` immediately on selection.
 *
 * Picking a file here only reads it into memory and shows a preview; nothing
 * is sent to the server. The wizard calls `uploadStagedImages` after the
 * product is created, in the same submit that creates it, so staff photograph
 * and caption everything in one pass instead of saving the product, leaving
 * to find the photos, and coming back to a second "Images" screen.
 */
export function ImageStager({
  images,
  onChange,
}: {
  images: StagedImage[];
  onChange: (images: StagedImage[]) => void;
}) {
  // Revoke every blob URL on unmount (wizard step change keeps this mounted
  // via React state living in the parent, but a hard navigation away — e.g.
  // "Cancel" — would otherwise leak them for the rest of the page's life).
  useEffect(() => {
    return () => {
      for (const image of images) URL.revokeObjectURL(image.previewUrl);
    };
    // Only ever run on unmount: revoking on every `images` change would
    // invalidate previews that are still on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const added = Array.from(files).map((file) => ({
      localId: newLocalId(),
      file,
      previewUrl: URL.createObjectURL(file),
      alt: '',
    }));
    onChange([...images, ...added]);
  }

  function removeAt(localId: string) {
    const target = images.find((image) => image.localId === localId);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onChange(images.filter((image) => image.localId !== localId));
  }

  function setAlt(localId: string, alt: string) {
    onChange(images.map((image) => (image.localId === localId ? { ...image, alt } : image)));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    onChange(next);
  }

  return (
    <div>
      {images.length > 0 ? (
        <>
          <p className="mb-3 text-xs text-neutral-900/50">{ALT_TEXT_GUIDANCE}</p>
          <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {images.map((image, index) => (
              <li
                key={image.localId}
                className={cn(
                  'overflow-hidden rounded-md border',
                  index === 0 ? 'border-accent' : 'border-neutral-100',
                )}
              >
                <div className="relative aspect-[3/4] bg-white">
                  {/* A blob: URL, not a remote one — next/image can't optimise
                      it, so a plain <img> here rather than fighting the loader. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.previewUrl}
                    alt={image.alt}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  {index === 0 ? (
                    <span className="absolute start-1 top-1 rounded bg-accent-hover px-1.5 py-0.5 text-[10px] font-medium text-white">
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
                    onClick={() => removeAt(image.localId)}
                    className="rounded px-1.5 py-0.5 text-xs text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>

                <div className="px-1.5 pb-1.5">
                  <input
                    type="text"
                    value={image.alt}
                    placeholder={ALT_TEXT_PLACEHOLDER}
                    onChange={(event) => setAlt(image.localId, event.target.value)}
                    className="w-full rounded border border-neutral-100 px-1.5 py-1 text-[11px] text-neutral-900 placeholder:text-neutral-900/30 focus:border-accent focus:outline-none"
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mb-4 text-sm text-neutral-900/50">No photographs yet.</p>
      )}

      <label className="btn-secondary cursor-pointer">
        Choose images
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = '';
          }}
          className="sr-only"
        />
      </label>
      <p className="mt-2 text-xs text-neutral-900/40">
        JPEG, PNG, WebP or AVIF, up to 8MB each. Uploaded when you create the product below — no
        separate trip needed.
      </p>
    </div>
  );
}

export interface StagedImageUploadResult {
  uploaded: number;
  failed: number;
  /** The first failure's message, for a one-line error banner. */
  firstError?: string;
}

/**
 * Uploads every staged image to a now-existing product, in order (the first
 * upload becomes the thumbnail, same as `ImageManager`'s manual reordering) —
 * called once, right after the create request that produced `productId`.
 *
 * Deliberately does not throw: the product already exists by the time this
 * runs, so a photo failing to upload is not a reason to strand the user on
 * the form or make them re-enter everything. Failures are counted and
 * reported so they can go add the photo from the product's edit page — the
 * same `ImageManager` this function's sibling component stands in for.
 */
export async function uploadStagedImages(
  productId: string,
  images: StagedImage[],
): Promise<StagedImageUploadResult> {
  let uploaded = 0;
  let firstError: string | undefined;

  for (const image of images) {
    try {
      const formData = new FormData();
      formData.append('file', image.file);
      if (image.alt.trim()) formData.append('alt', image.alt.trim());

      await adminFetch(`/admin/catalog/products/${productId}/images`, {
        method: 'POST',
        formData,
      });
      uploaded += 1;
    } catch (cause) {
      firstError ??= cause instanceof Error ? cause.message : 'Upload failed';
    }
  }

  return { uploaded, failed: images.length - uploaded, firstError };
}
