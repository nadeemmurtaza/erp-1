import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../../core/auth/decorators';
import { AuctionBidderService } from './auction-bidder.service';
import { BidderDecisionDto, BidderListQueryDto, RecordStrikeDto, VoidStrikeDto } from './dto/auction.dto';

/**
 * Staff decide who may bid in an auction, hold bidders to account with
 * strikes, and answer their appeals (launchpad-apps/234-auction-app.md §8,
 * WO-234.5). Every route needs `auction.bidders.manage`: it is the one key that
 * shows a bidder's name, email and phone, so it is separate from `auction.view`
 * and `auction.manage`, and a person who can draft or schedule a sale does not
 * get it by that. The service refuses a staff member deciding on their own
 * registration.
 */
@ApiTags('admin/auctions')
@Controller('admin/auctions/:id/bidders')
@RequirePermission('auction.bidders.manage')
export class AuctionBidderController {
  constructor(private readonly bidders: AuctionBidderService) {}

  @Get('summary')
  @ApiOperation({ summary: 'How many bidders are waiting, approved, stopped, or waiting on an appeal' })
  summary(@Param('id') id: string) {
    return this.bidders.summary(id);
  }

  @Get()
  @ApiOperation({ summary: 'The auction’s bidders, oldest first, with who they are and their strikes' })
  list(@Param('id') id: string, @Query() query: BidderListQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.bidders.list(id, query, { id: user.id, permissions: user.permissions });
  }

  @Get(':bidderId')
  @ApiOperation({ summary: 'One bidder: who they are, whether their identity is verified, their strikes and any appeal' })
  detail(@Param('id') id: string, @Param('bidderId') bidderId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bidders.detail(id, bidderId, { id: user.id, permissions: user.permissions });
  }

  @Post(':bidderId/decision')
  @ApiOperation({ summary: 'Approve, decline or suspend a bidder, or keep a decision they appealed. A refusal carries a reason the bidder reads' })
  decide(
    @Param('id') id: string,
    @Param('bidderId') bidderId: string,
    @Body() dto: BidderDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bidders.decide(id, bidderId, { id: user.id, permissions: user.permissions }, dto);
  }

  @Post(':bidderId/strikes')
  @ApiOperation({ summary: 'Record a strike against the person behind a bidder. It flags at the threshold and never suspends' })
  recordStrike(
    @Param('id') id: string,
    @Param('bidderId') bidderId: string,
    @Body() dto: RecordStrikeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bidders.recordStrike(id, bidderId, { id: user.id, permissions: user.permissions }, dto);
  }

  @Post(':bidderId/strikes/:strikeId/void')
  @ApiOperation({ summary: 'Void a strike with a reason; it stays on record and stops counting' })
  voidStrike(
    @Param('id') id: string,
    @Param('bidderId') bidderId: string,
    @Param('strikeId') strikeId: string,
    @Body() dto: VoidStrikeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bidders.voidStrike(id, bidderId, strikeId, { id: user.id, permissions: user.permissions }, dto.reason);
  }
}
