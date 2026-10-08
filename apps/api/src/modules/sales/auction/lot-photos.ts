import { MAX_LOT_PHOTOS } from '@newax/shared';

/**
 * The rules for a lot's photographs (launchpad-apps/234-auction-app.md,
 * WO-234.12), kept pure so the service that writes them and the admin sheet
 * that disables "Add" read the same answer: no `prisma.`, no `publish(`.
 */

export { MAX_LOT_PHOTOS };

/** The folder photographs are stored under, apart from product photographs. */
export const LOT_PHOTO_FOLDER = 'auction-lots';

/** Where the next photograph goes, or why it cannot. Positions are contiguous from 0, so the next is the count. */
export function nextPhotoPosition(count: number): { ok: true; order: number } | { ok: false; code: 'LOT_PHOTOS_FULL' } {
  return count >= MAX_LOT_PHOTOS ? { ok: false, code: 'LOT_PHOTOS_FULL' } : { ok: true, order: count };
}

export type PhotoOrderProblem = 'DUPLICATE' | 'UNKNOWN' | 'MISSING';

/**
 * Whether `requested` is a reordering of exactly the photographs the lot has:
 * the same ids, each once. Anything else is refused whole, so a stale screen can
 * never drop a photograph by leaving it out of a list.
 */
export function checkPhotoOrder(current: readonly string[], requested: readonly string[]): { ok: true } | { ok: false; problem: PhotoOrderProblem } {
  if (new Set(requested).size !== requested.length) return { ok: false, problem: 'DUPLICATE' };
  const known = new Set(current);
  if (requested.some((id) => !known.has(id))) return { ok: false, problem: 'UNKNOWN' };
  if (requested.length !== current.length) return { ok: false, problem: 'MISSING' };
  return { ok: true };
}

/** The positions to write after a photograph is removed: the rest, in their order, from 0. */
export function closeGap(remainingIdsInOrder: readonly string[]): Array<{ id: string; order: number }> {
  return remainingIdsInOrder.map((id, order) => ({ id, order }));
}
