/**
 * 32-lots-batch-expiry-fefo.md §2. First-Expired-First-Out allocation — pure,
 * over already-loaded rows, so a caller can preview it ("which lots would
 * this sale draw from") before committing anything, the same "dry run
 * before live" discipline this repo's other policy-as-data mechanisms
 * already follow. The one writer (LotsService) calls this; nothing else
 * ever reimplements FEFO ordering.
 */

export interface LotAllocationCandidate {
  id: string;
  quantity: number;
  expiresOn: Date | null;
}

export interface LotAllocationResult {
  lotId: string;
  quantity: number;
}

export class InsufficientLotStockError extends Error {
  constructor(
    public readonly requested: number,
    public readonly available: number,
  ) {
    super(`Insufficient lot stock: need ${requested}, only ${available} available across lots.`);
    this.name = 'InsufficientLotStockError';
  }
}

/**
 * `preferredLotId` is the named manual override (§2): the real exception
 * (a specific lot pulled for a recall test, a client contract requiring
 * FIFO) draws from that lot first, up to its own available quantity, then
 * falls back to ordinary FEFO for any remainder — never a second allocation
 * mode, just a different starting point over the same eligible set.
 */
export function allocateFefo(
  lots: LotAllocationCandidate[],
  quantity: number,
  preferredLotId?: string,
): LotAllocationResult[] {
  if (quantity <= 0) {
    throw new Error('Quantity to allocate must be positive.');
  }

  const eligible = lots.filter((lot) => lot.quantity > 0);
  const totalAvailable = eligible.reduce((sum, lot) => sum + lot.quantity, 0);
  if (totalAvailable < quantity) {
    throw new InsufficientLotStockError(quantity, totalAvailable);
  }

  const ordered = [...eligible].sort((a, b) => {
    if (a.id === preferredLotId) return -1;
    if (b.id === preferredLotId) return 1;
    // Earliest-expiring first; a lot with no expiry sorts last — it never
    // expires, so it is the least urgent one to draw down.
    const aTime = a.expiresOn ? a.expiresOn.getTime() : Infinity;
    const bTime = b.expiresOn ? b.expiresOn.getTime() : Infinity;
    return aTime - bTime;
  });

  const allocations: LotAllocationResult[] = [];
  let remaining = quantity;
  for (const lot of ordered) {
    if (remaining <= 0) break;
    const take = Math.min(lot.quantity, remaining);
    if (take > 0) {
      allocations.push({ lotId: lot.id, quantity: take });
      remaining -= take;
    }
  }

  return allocations;
}
