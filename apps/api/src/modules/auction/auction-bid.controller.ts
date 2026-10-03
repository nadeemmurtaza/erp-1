import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { AuthenticatedOnly, CurrentUser } from '../../core/auth/decorators';
import { AuctionPublicService } from './auction-public.service';
import { AuctionService } from './auction.service';
import { PlaceBidDto, SetProxyBidDto } from './dto/auction.dto';

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
  constructor(
    private readonly auctions: AuctionService,
    private readonly publicLots: AuctionPublicService,
  ) {}

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

  /**
   * 30 a minute per client address: setting a maximum is a decision, not a
   * race, so it needs half the allowance of a bid, and a script probing for
   * another bidder's maximum by setting proxies is slowed to one every two
   * seconds on top of the per-lot lock. Over the limit is a 429.
   */
  @Put('lots/:lotId/proxy')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Set or raise your own maximum on a lot; the system bids for you up to it. It can never be lowered' })
  setProxy(@Param('lotId') lotId: string, @Body() dto: SetProxyBidDto, @CurrentUser() user: AuthenticatedUser) {
    return this.auctions.setProxyBid({
      lotId,
      maxMinor: dto.maxMinor,
      user: { id: user.id, permissions: user.permissions },
    });
  }

  @Get('lots/:lotId/proxy')
  @ApiOperation({ summary: 'Your own maximum on a lot. Nobody else’s is readable through any route' })
  getProxy(@Param('lotId') lotId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.auctions.getProxyBid(lotId, user.id);
  }

  /** Whether the caller leads this lot and may bid on it, for the page to say "you are winning" and to explain a refusal before the bid. */
  @Get('lots/:lotId/me')
  @ApiOperation({ summary: 'Whether you lead this lot and may bid on it' })
  me(@Param('lotId') lotId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.publicLots.viewerState(lotId, { id: user.id, permissions: user.permissions });
  }
}
