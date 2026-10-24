import { NotFoundException } from '@nestjs/common';
import type { AuctionStatus } from '../../../core/prisma/client';
import type { Prisma } from '../../../core/prisma/client';

/**
 * Takes the auction's row lock and returns the status read under it. Every
 * mutation of an auction or of what bidders are told about its lots starts
 * here, so two of them can never both act on the status they read before the
 * other committed (doc 234 §6). A missing auction is a 404.
 */
export async function lockAuctionStatus(tx: Prisma.TransactionClient, id: string): Promise<AuctionStatus> {
  const rows = await tx.$queryRaw<Array<{ status: AuctionStatus }>>`
    SELECT "status" FROM "Auction" WHERE "id" = ${id} FOR UPDATE
  `;
  if (rows.length === 0) throw new NotFoundException('Auction not found.');
  return rows[0].status;
}
