import type { Bidder, Prisma } from '../../../core/prisma/client';
import { bidderAlias } from './bidding';
import type { BidderStatus } from './bidder-trust';

/** Serialises the creation of bidders within one auction, so aliases stay "Bidder 1, 2, 3…" with no gap or repeat. */
export const BIDDER_LOCK_NAMESPACE = 8_241_172;

/**
 * Gives a person their place in an auction: "Bidder N", N one more than the
 * auction's bidders so far, taken under a lock so two people joining at once
 * never share one. The one place a `Bidder` is created, used both by a person
 * who joins and by the first bid under an `OPEN` auction, so the alias rule and
 * the race on `(auctionId, userId)` are handled once. `created` is false when
 * the person was already there (a second tab, a retry), so a caller records a
 * join once.
 */
export async function provisionBidder(
  tx: Prisma.TransactionClient,
  auctionId: string,
  userId: string,
  status: BidderStatus,
): Promise<{ bidder: Bidder; created: boolean }> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BIDDER_LOCK_NAMESPACE}::int, hashtext(${auctionId}))`;
  const existing = await tx.bidder.findUnique({ where: { auctionId_userId: { auctionId, userId } } });
  if (existing) return { bidder: existing, created: false };
  const ordinal = (await tx.bidder.count({ where: { auctionId } })) + 1;
  const bidder = await tx.bidder.create({ data: { auctionId, userId, alias: bidderAlias(ordinal), status } });
  return { bidder, created: true };
}
