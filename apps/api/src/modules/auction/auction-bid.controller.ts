import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { AuthenticatedOnly, CurrentUser } from '../../core/auth/decorators';
import { AuctionService } from './auction.service';
import { PlaceBidDto } from './dto/auction.dto';

/**
 * Where a bidder places a bid (launchpad-apps/234-auction-app.md, WO-234.2).
 * Any signed-in customer account may call it — a bidder holds no staff
 * permission (doc 234 §13) — and the service decides eligibility from data,
 * so the route says `AuthenticatedOnly` on purpose. No `CustomerScope`: a
 * storefront API key is not a person and cannot bid.
 *
 * 60 bids a minute per client address, enforced by the shared Redis-backed
 * throttler. A person raising in a final-minute war manages one bid every few
 * seconds, and a shared office address of ten bidders still fits at six each;
 * a script hammering at fifty a second is stopped long before it fills the
 * lot's queue. Over the limit is a 429, never a silently dropped bid.
 */
@ApiTags('auctions')
@Controller('auctions')
@AuthenticatedOnly()
export class AuctionBidController {
  constructor(private readonly auctions: AuctionService) {}

  @Post('lots/:lotId/bids')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Place a bid on an open lot; a retry with the same idempotency key returns the accepted bid' })
  placeBid(@Param('lotId') lotId: string, @Body() dto: PlaceBidDto, @CurrentUser() user: AuthenticatedUser) {
    return this.auctions.placeBid({
      lotId,
      amountMinor: dto.amountMinor,
      idempotencyKey: dto.idempotencyKey,
      user: { id: user.id, permissions: user.permissions },
    });
  }
}
