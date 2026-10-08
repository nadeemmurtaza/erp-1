import 'reflect-metadata';
import { PERMISSIONS_KEY } from '../../../core/auth/auth.constants';
import { AuctionSettlementController } from './auction-settlement.controller';
import { AuctionController } from './auction.controller';

/**
 * Who may reach what (doc 234 §13, WO-234.6). `scripts/check-route-permissions.mjs`
 * proves every route names a permission; this proves it names the right one:
 * every settlement route needs `auction.settle` and nothing weaker, and a person
 * who holds only that key can open the auction list and page (read-only) to reach
 * the panel, but cannot draft, edit or schedule anything.
 */
describe('auction settlement permissions', () => {
  const needed = (target: object, method?: string): string[] =>
    (Reflect.getMetadata(PERMISSIONS_KEY, method ? (target as Record<string, object>)[method] : target) as string[] | undefined) ?? [];

  it('guards the whole settlement controller with auction.settle, and no route widens it', () => {
    expect(needed(AuctionSettlementController)).toEqual(['auction.settle']);
    for (const method of ['summary', 'list', 'replay', 'cancel', 'offerNext']) {
      expect(needed(AuctionSettlementController.prototype, method)).toEqual([]);
    }
  });

  it('opens the auction list and page to a settle-only holder, and nothing that changes an auction', () => {
    expect(needed(AuctionController.prototype, 'list')).toContain('auction.settle');
    expect(needed(AuctionController.prototype, 'get')).toContain('auction.settle');
    for (const method of ['create', 'update', 'addLot', 'schedule', 'cancel']) {
      const keys = needed(AuctionController.prototype, method);
      if (keys.length > 0) expect(keys).not.toContain('auction.settle');
    }
  });
});
