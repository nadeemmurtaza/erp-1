'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus } from 'lucide-react';
import { MAX_LOT_PHOTOS } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { uploadFile } from '@/lib/upload-client';
import { IMAGE_UPLOAD_RULES } from '@/lib/upload-rules';
import { moveFocusTarget, movePhoto, photoLimitReason, renumber, roomForPhotos, type LotPhoto } from '@/lib/auction-lot-photos';
import { Badge, Dialog, Dropzone, HoldToConfirm } from '@/components/ui';
import { useUploads } from '@/components/admin/upload-provider';
import { cn } from '@/utils/cn';

export interface PhotoLot {
  id: string;
  lotNo: number;
  title: string;
  images: LotPhoto[];
}

/**
 * The lot's picture in its table row, and the way into its photos. While the
 * auction is a draft it is the button that opens the sheet: the cover with the
 * number of photos on it, or a dashed slot with a plus when there are none, so
 * the row gains no column and no second button. Once it is on the calendar it is
 * the cover alone, and a lot with no photograph shows nothing at all.
 */
export function LotPhotoSlot({ lotNo, images, onOpen }: { lotNo: number; images: readonly LotPhoto[]; onOpen?: () => void }) {
  const cover = [...images].sort((a, b) => a.order - b.order)[0];
  const picture = cover ? <Image src={cover.url} alt="" fill sizes="56px" className="object-cover" /> : null;
  if (!onOpen) {
    return cover ? <span className="media-concentric relative block h-11 w-14 shrink-0 overflow-hidden bg-neutral-50">{picture}</span> : null;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Photos (${images.length}) for lot ${lotNo}`}
      title={images.length > 0 ? `${images.length} of ${MAX_LOT_PHOTOS} photos. Open to change them.` : 'Add photos'}
      className={cn(
        'focus-frame relative flex h-11 w-14 shrink-0 items-center justify-center overflow-hidden',
        cover ? 'media-concentric bg-neutral-50' : 'rounded border border-dashed border-neutral-200 text-neutral-900/60',
      )}
    >
      {picture ?? <ImagePlus aria-hidden="true" className="h-icon-md w-icon-md" />}
      {images.length > 0 ? <span className="absolute bottom-0 end-0 bg-accent px-1 text-xs text-white">{images.length}</span> : null}
    </button>
  );
}

/**
 * launchpad-apps/234-auction-app.md (WO-234.12) — the photographs of one lot, in
 * a side sheet opened from the lot's row. Its one job is the lot's set: add,
 * put in order (the first is the cover), remove. It is only offered while the
 * auction is a draft, because what bidders are told about a lot does not change
 * once it is on the calendar; the API refuses a change after that as well.
 *
 * Photographs go up through the shell's upload tray (`useUploads`), one at a
 * time for this lot so they land in the order they were chosen; the sheet may be
 * closed while they travel. Reordering is by up and down buttons, not dragging,
 * because staff photograph and upload from a phone and a keyboard cannot drag.
 * Removing holds to confirm: the file is deleted with the row.
 */
export function AuctionLotPhotos({
  auctionId,
  lot,
  onClose,
  onImages,
}: {
  auctionId: string;
  /** The lot whose photographs are open, read live from the page so the sheet and the row behind it always agree; null while closed. */
  lot: PhotoLot | null;
  onClose: () => void;
  /** Replaces a lot's photographs on the page: given what it has now, returns what it should have. */
  onImages: (lotId: string, update: (current: LotPhoto[]) => LotPhoto[]) => void;
}) {
  const uploads = useUploads();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [started, setStarted] = useState<ReadonlySet<string>>(() => new Set());
  // The last lot shown, so the sheet can leave with its content instead of emptying first.
  const lastLot = useRef<PhotoLot | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const count = useRef<HTMLParagraphElement>(null);
  if (lot) lastLot.current = lot;
  const shown = lot ?? lastLot.current;

  const images = shown ? [...shown.images].sort((a, b) => a.order - b.order) : [];
  const lanes = uploads.items.filter((lane) => started.has(lane.id));
  const uploading = lanes.filter((lane) => lane.status === 'queued' || lane.status === 'uploading').length;
  // Photos already sent count against the limit, and so do the ones on their way.
  const limitReason = photoLimitReason(images.length + uploading);

  if (!shown) return null;

  const upload = (files: File[]) => {
    setError(null);
    // A drop of more than fits is cut at the limit here, with a word about it; the server enforces it too.
    const room = roomForPhotos(images.length + uploading);
    const accepted = files.slice(0, room);
    if (accepted.length < files.length) {
      setError(`Only ${accepted.length} of ${files.length} photos were added: a lot can have ${MAX_LOT_PHOTOS}.`);
    }
    if (accepted.length === 0) return;
    const { ids } = uploads.enqueue(accepted, {
      rules: IMAGE_UPLOAD_RULES,
      send: (file, context) =>
        uploadFile<LotPhoto>({
          path: `/admin/auctions/${auctionId}/lots/${shown.id}/images`,
          file,
          serialKey: `auction-lot-photos:${shown.id}`,
          ...context,
        }),
      onDone: (created) => onImages(shown.id, (current) => [...current.filter((image) => image.id !== created.id), created]),
    });
    setStarted((current) => new Set([...current, ...ids]));
  };

  // A control that is disabled loses focus, and with it Escape (which lives on the panel). So the
  // move buttons are never disabled for being busy: a second act is ignored while one is saving, and
  // focus is handed back afterwards to the button the person is most likely to press next.
  const focusLater = (find: () => HTMLElement | null | undefined) => window.requestAnimationFrame(() => find()?.focus());

  const reorder = async (index: number, direction: -1 | 1) => {
    if (busyId !== null) return;
    const next = renumber(movePhoto(images, index, direction));
    const previous = images;
    const movedId = images[index]!.id;
    setBusyId(movedId);
    setError(null);
    onImages(shown.id, () => next);
    try {
      const saved = await adminFetch<LotPhoto[]>(`/admin/auctions/${auctionId}/lots/${shown.id}/images/order`, {
        method: 'PATCH',
        body: { imageIds: next.map((image) => image.id) },
      });
      onImages(shown.id, () => saved);
      const toward = moveFocusTarget(index + direction, images.length, direction);
      focusLater(() => panel.current?.querySelector<HTMLElement>(`[data-photo-move="${movedId}:${toward}"]`));
    } catch (cause) {
      onImages(shown.id, () => previous);
      setError(cause instanceof Error ? cause.message : 'The new order was not saved. The photos are back as they were.');
      focusLater(() => panel.current?.querySelector<HTMLElement>(`[data-photo-move="${movedId}:${direction}"]`));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (image: LotPhoto) => {
    setBusyId(image.id);
    setError(null);
    try {
      const left = await adminFetch<LotPhoto[]>(`/admin/auctions/${auctionId}/lots/${shown.id}/images/${image.id}`, { method: 'DELETE' });
      onImages(shown.id, () => left);
      // The button that was held is gone with its row; the count is what changed, so focus goes there.
      focusLater(() => count.current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The photo was not removed.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={lot !== null} onClose={onClose} title={`Photos for lot ${shown.lotNo}`} align="end">
      <div ref={panel} className="grid gap-5">
        <p className="text-sm text-neutral-900/70">
          {shown.title}. The first photo is the cover on the auction list. Bidders see them in this order.
        </p>

        {error ? (
          <p role="alert" className="notice notice-error">
            {error}
          </p>
        ) : null}

        <p ref={count} tabIndex={-1} className="text-sm font-medium text-neutral-900 outline-none" aria-live="polite">
          {images.length} of {MAX_LOT_PHOTOS} photos
          {uploading > 0 ? ` · ${uploading} on the way` : ''}
        </p>

        {images.length > 0 ? (
          <ol className="grid gap-3" aria-busy={busyId !== null}>
            {images.map((image, index) => (
              <li key={image.id} className="flex flex-wrap items-center gap-3">
                <div className="media-concentric relative h-[4.5rem] w-24 shrink-0 overflow-hidden bg-neutral-50">
                  <Image src={image.url} alt={`Photo ${index + 1} of lot ${shown.lotNo}`} fill sizes="96px" className="object-cover" />
                </div>
                <div className="grid min-w-0 flex-1 gap-2">
                  <p className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                    Photo {index + 1}
                    {index === 0 ? <Badge tone="info">Cover</Badge> : null}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="icon-btn h-touch w-touch fold:h-9 fold:w-9 rounded"
                      aria-label={`Move photo ${index + 1} up`}
                      data-photo-move={`${image.id}:-1`}
                      disabled={index === 0}
                      onClick={() => void reorder(index, -1)}
                    >
                      <ArrowUp aria-hidden="true" className="h-icon-md w-icon-md" />
                    </button>
                    <button
                      type="button"
                      className="icon-btn h-touch w-touch fold:h-9 fold:w-9 rounded"
                      aria-label={`Move photo ${index + 1} down`}
                      data-photo-move={`${image.id}:1`}
                      disabled={index === images.length - 1}
                      onClick={() => void reorder(index, 1)}
                    >
                      <ArrowDown aria-hidden="true" className="h-icon-md w-icon-md" />
                    </button>
                    <HoldToConfirm onConfirm={() => remove(image)} loading={busyId === image.id} disabled={busyId !== null && busyId !== image.id}>
                      {`Remove photo ${index + 1}`}
                    </HoldToConfirm>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-neutral-900/70">No photos yet. Without one, the lot page shows only its description.</p>
        )}

        <Dropzone
          multiple
          rules={IMAGE_UPLOAD_RULES}
          label="Drop photos here, click to choose, or paste"
          hint={`Up to ${MAX_LOT_PHOTOS} photos a lot.`}
          disabled={limitReason ?? undefined}
          queued={uploading}
          onFiles={upload}
        />
      </div>
    </Dialog>
  );
}
