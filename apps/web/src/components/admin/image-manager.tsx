'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { adminFetch } from '@/lib/admin-client';
import { uploadFile } from '@/lib/upload-client';
import { IMAGE_UPLOAD_RULES } from '@/lib/upload-rules';
import { Dropzone } from '@/components/ui/dropzone';
import { useUploads } from '@/components/admin/upload-provider';

interface ProductImageRow {
  id: string;
  url: string;
  /** Deprecated (WO-3.6) — kept only as a pre-migration fallback; `translations` is authoritative. */
  alt: string | null;
  translations?: Array<{ locale: string; alt: string }>;
  order: number;
  isPrimary: boolean;
}

function altFor(image: ProductImageRow, locale: string): string {
  return image.translations?.find((t) => t.locale === locale)?.alt ?? (locale === 'en' ? image.alt ?? '' : '');
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
 *
 * Photographs go up through the shell's upload tray (`useUploads`), not through
 * this component: each is its own lane with a percent, speed and Cancel, one
 * failing never stops the others, and the transfer carries on if the operator
 * moves to another page (UPL-5, UPL-6). They are sent one at a time for this
 * product (`serialKey`), because the API numbers a new image from the count it
 * read before it saved, and two sent together would both take the same place.
 */
export function ImageManager({
  productId,
  initialImages,
  onUploadState,
}: {
  productId: string;
  initialImages: ProductImageRow[];
  /**
   * Reports whether an upload is in flight or has failed, so the form around
   * this can refuse to save. Choosing a photo and saving a second later used
   * to leave the product stored without it.
   */
  onUploadState?: (state: { busy: boolean; failed: boolean }) => void;
}) {
  const [images, setImages] = useState<ProductImageRow[]>(
    [...initialImages].sort((a, b) => a.order - b.order),
  );
  const [error, setError] = useState<string | null>(null);
  const uploads = useUploads();
  // The tray lists every upload in the shell; the form around this only cares about the ones started here.
  const [started, setStarted] = useState<ReadonlySet<string>>(() => new Set());
  const lanes = uploads.items.filter((lane) => started.has(lane.id));
  const busy = lanes.some((lane) => lane.status === 'queued' || lane.status === 'uploading');
  // A lane that failed holds the save until it is retried or dismissed; a canceled one was the operator's own choice.
  const failed = error !== null || lanes.some((lane) => lane.status === 'failed' || lane.status === 'rejected');

  // Mirrored up to the form on every change, so "saving" and "still
  // uploading" can never be true at the same time.
  useEffect(() => {
    onUploadState?.({ busy, failed });
  }, [busy, failed, onUploadState]);

  function upload(files: File[]) {
    setError(null);
    const { ids } = uploads.enqueue(files, {
      rules: IMAGE_UPLOAD_RULES,
      // No alt text here — a filename ("IMG_2024_0193") is not a
      // description of the photo. Staff write the real one below,
      // per image, right after it lands in the grid.
      send: (file, context) =>
        uploadFile<ProductImageRow>({
          path: `/admin/catalog/products/${productId}/images`,
          file,
          serialKey: `product-images:${productId}`,
          ...context,
        }),
      onDone: (created) => setImages((current) => [...current, created]),
    });
    setStarted((current) => new Set([...current, ...ids]));
  }

  async function saveAlt(id: string, alt: string, locale: string) {
    const previous = images;
    setImages((current) =>
      current.map((image) =>
        image.id === id
          ? {
              ...image,
              translations: [
                ...(image.translations ?? []).filter((t) => t.locale !== locale),
                { locale, alt },
              ],
            }
          : image,
      ),
    );

    try {
      await adminFetch(`/admin/catalog/images/${id}`, { method: 'PATCH', body: { alt, locale } });
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
        <p role="alert" className="notice notice-error mb-3">
          {error}
        </p>
      ) : null}

      {images.length > 0 ? (
        <>
        <p className="mb-3 text-xs text-neutral-900/60">{ALT_TEXT_GUIDANCE}</p>
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
                  alt={altFor(image, 'en')}
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

              <div className="space-y-1 px-1.5 pb-1.5">
                <AltTextField
                  key={`${image.id}-en`}
                  value={altFor(image, 'en')}
                  placeholder={ALT_TEXT_PLACEHOLDER}
                  onSave={(alt) => void saveAlt(image.id, alt, 'en')}
                />
                <AltTextField
                  key={`${image.id}-ur`}
                  value={altFor(image, 'ur')}
                  placeholder="اردو متن (اختیاری)"
                  dir="rtl"
                  onSave={(alt) => void saveAlt(image.id, alt, 'ur')}
                />
              </div>
            </li>
          ))}
        </ul>
        </>
      ) : (
        <p className="mb-4 text-sm text-neutral-900/60">No photographs yet.</p>
      )}

      <Dropzone multiple rules={IMAGE_UPLOAD_RULES} label="Drop photographs here, click to choose, or paste" onFiles={upload} />
    </div>
  );
}

/**
 * Saves on blur, not on every keystroke — an admin field, not a live search.
 * Uncontrolled-ish: keeps its own draft so retyping doesn't fight a parent
 * re-render mid-edit, but resets if the image's saved value changes under it
 * (e.g. a rollback after a failed save elsewhere).
 */
function AltTextField({
  value,
  onSave,
  placeholder = ALT_TEXT_PLACEHOLDER,
  dir,
}: {
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  dir?: 'rtl';
}) {
  const [draft, setDraft] = useState(value);

  return (
    <input
      type="text"
      value={draft}
      placeholder={placeholder}
      dir={dir}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onSave(draft);
      }}
      className={cn(
        'w-full rounded border border-neutral-100 px-1.5 py-1 text-[11px] text-neutral-900 placeholder:text-neutral-900/60 focus:border-accent focus:outline-none',
        dir === 'rtl' && 'font-urdu',
      )}
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
  altUr: string;
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

  function addFiles(files: File[]) {
    if (files.length === 0) return;
    const added = files.map((file) => ({
      localId: newLocalId(),
      file,
      previewUrl: URL.createObjectURL(file),
      alt: '',
      altUr: '',
    }));
    onChange([...images, ...added]);
  }

  function removeAt(localId: string) {
    const target = images.find((image) => image.localId === localId);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onChange(images.filter((image) => image.localId !== localId));
  }

  function setAlt(localId: string, patch: Partial<Pick<StagedImage, 'alt' | 'altUr'>>) {
    onChange(images.map((image) => (image.localId === localId ? { ...image, ...patch } : image)));
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
          <p className="mb-3 text-xs text-neutral-900/60">{ALT_TEXT_GUIDANCE}</p>
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

                <div className="space-y-1 px-1.5 pb-1.5">
                  <input
                    type="text"
                    value={image.alt}
                    placeholder={ALT_TEXT_PLACEHOLDER}
                    onChange={(event) => setAlt(image.localId, { alt: event.target.value })}
                    className="w-full rounded border border-neutral-100 px-1.5 py-1 text-[11px] text-neutral-900 placeholder:text-neutral-900/60 focus:border-accent focus:outline-none"
                  />
                  <input
                    type="text"
                    value={image.altUr}
                    placeholder="اردو متن (اختیاری)"
                    dir="rtl"
                    onChange={(event) => setAlt(image.localId, { altUr: event.target.value })}
                    className="w-full rounded border border-neutral-100 px-1.5 py-1 text-[11px] text-neutral-900 font-urdu placeholder:text-neutral-900/60 focus:border-accent focus:outline-none"
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mb-4 text-sm text-neutral-900/60">No photographs yet.</p>
      )}

      <Dropzone
        multiple
        rules={IMAGE_UPLOAD_RULES}
        label="Drop photographs here, click to choose, or paste"
        hint="Uploaded when you create the product below — no separate trip needed."
        onFiles={addFiles}
      />
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

      const created = await adminFetch<{ id: string }>(`/admin/catalog/products/${productId}/images`, {
        method: 'POST',
        formData,
      });

      if (image.altUr.trim()) {
        await adminFetch(`/admin/catalog/images/${created.id}`, {
          method: 'PATCH',
          body: { alt: image.altUr.trim(), locale: 'ur' },
        });
      }

      uploaded += 1;
    } catch (cause) {
      firstError ??= cause instanceof Error ? cause.message : 'Upload failed';
    }
  }

  return { uploaded, failed: images.length - uploaded, firstError };
}
