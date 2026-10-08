import { MAX_LOT_PHOTOS } from '@newax/shared';

/**
 * A lot's photographs as the admin sheet and the storefront gallery handle them
 * (launchpad-apps/234-auction-app.md, WO-234.12). Pure, so the arithmetic is
 * tested without a render. The limit is the API's own, read from `@newax/shared`.
 */

export interface LotPhoto {
  id: string;
  url: string;
  /** 0 is the cover. */
  order: number;
}

export { MAX_LOT_PHOTOS };

/** Why one more photo cannot be added, in words for staff, or null when it can. */
export function photoLimitReason(count: number): string | null {
  return count >= MAX_LOT_PHOTOS
    ? `This lot has ${count} photos, the most it can have. Remove one to add another.`
    : null;
}

/** How many more photos fit, never below 0. A drop of more than this is cut at the limit by the sheet, not by the server alone. */
export function roomForPhotos(count: number): number {
  return Math.max(0, MAX_LOT_PHOTOS - count);
}

/** The list with the photo at `index` moved one place up (-1) or down (+1); the same list when it is already at that end. */
export function movePhoto<T>(photos: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= photos.length || target < 0 || target >= photos.length) return [...photos];
  const next = [...photos];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);
  return next;
}

/**
 * Which move button keeps keyboard focus once a photo has moved to `index` of `total`: the one just
 * used when it can be used again, else its opposite (a photo that reached an end can only go back).
 */
export function moveFocusTarget(index: number, total: number, direction: -1 | 1): -1 | 1 {
  const again = index + direction;
  return again >= 0 && again < total ? direction : direction === 1 ? -1 : 1;
}

/** Positions rewritten to match the list order, so the cover is always the first. */
export function renumber(photos: readonly LotPhoto[]): LotPhoto[] {
  return photos.map((photo, order) => ({ ...photo, order }));
}

/** "Photo 2 of 5": what a screen reader says about one picture of a set. */
export function photoPosition(index: number, total: number): { n: number; total: number } {
  return { n: index + 1, total };
}

/** The photo to show after a step on the thumbnails: the same one when the index is outside the set. */
export function clampPhotoIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.max(index, 0), total - 1);
}
