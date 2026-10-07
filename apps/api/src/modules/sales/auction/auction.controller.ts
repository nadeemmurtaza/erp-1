import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../../core/auth/decorators';
import { AuctionService } from './auction.service';
import {
  AuctionListQueryDto,
  BidListQueryDto,
  CancelAuctionDto,
  CreateAuctionDto,
  CreateAuctionLotDto,
  UpdateAuctionDto,
  UpdateAuctionLotDto,
} from './dto/auction.dto';

/**
 * launchpad-apps/234-auction-app.md (WO-234.1). Drafting and editing sit
 * behind `auction.manage`; putting an auction on the calendar — and taking it
 * off again — is `auction.publish`, so the person who drafts a sale is not
 * automatically the one who commits the business to it. The lot's hidden
 * reserve is returned only to a holder of `auction.manage`; a read-only
 * holder never sees it. The bid ledger and its integrity check are read-only
 * and need only `auction.view`. The list and the page also open for a holder of
 * `auction.bidders.manage` (WO-234.5), so a person who only approves bidders can
 * reach them; that key shows no reserve either.
 */
@ApiTags('admin/auctions')
@Controller('admin/auctions')
export class AuctionController {
  constructor(private readonly auctions: AuctionService) {}

  @Get()
  @RequirePermission('auction.view', 'auction.manage', 'auction.bidders.manage')
  @ApiOperation({ summary: 'Auctions, newest first, optionally filtered by status' })
  list(@Query() query: AuctionListQueryDto) {
    return this.auctions.list(query);
  }

  @Get(':id')
  @RequirePermission('auction.view', 'auction.manage', 'auction.bidders.manage')
  @ApiOperation({ summary: 'One auction with its lots' })
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.auctions.get(id, user.permissions.includes('auction.manage'));
  }

  @Post()
  @RequirePermission('auction.manage')
  @ApiOperation({ summary: 'Draft an auction' })
  create(@Body() dto: CreateAuctionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.auctions.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('auction.manage')
  @ApiOperation({ summary: 'Edit a draft auction' })
  update(@Param('id') id: string, @Body() dto: UpdateAuctionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.auctions.update(id, dto, user.id);
  }

  @Post(':id/lots')
  @RequirePermission('auction.manage')
  @ApiOperation({ summary: 'Add a lot to a draft auction' })
  addLot(@Param('id') id: string, @Body() dto: CreateAuctionLotDto, @CurrentUser() user: AuthenticatedUser) {
    return this.auctions.addLot(id, dto, user.id);
  }

  @Patch(':id/lots/:lotId')
  @RequirePermission('auction.manage')
  @ApiOperation({ summary: 'Edit a lot on a draft auction' })
  updateLot(
    @Param('id') id: string,
    @Param('lotId') lotId: string,
    @Body() dto: UpdateAuctionLotDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.auctions.updateLot(id, lotId, dto, user.id);
  }

  @Post(':id/lots/:lotId/withdraw')
  @RequirePermission('auction.manage')
  @ApiOperation({ summary: 'Withdraw a lot from a draft auction — kept on record, never deleted' })
  withdrawLot(@Param('id') id: string, @Param('lotId') lotId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.auctions.withdrawLot(id, lotId, user.id);
  }

  @Get(':id/lots/:lotId/bids')
  @RequirePermission('auction.view', 'auction.manage')
  @ApiOperation({ summary: 'A lot’s accepted bids, newest first, bidders by alias only' })
  listBids(@Param('id') id: string, @Param('lotId') lotId: string, @Query() query: BidListQueryDto) {
    return this.auctions.listBids(id, lotId, query);
  }

  @Get(':id/lots/:lotId/bids/verify')
  @RequirePermission('auction.view', 'auction.manage')
  @ApiOperation({ summary: 'Re-walk a lot’s bid chain and say whether anything was inserted, edited or removed' })
  verifyBids(@Param('id') id: string, @Param('lotId') lotId: string) {
    return this.auctions.verifyBids(id, lotId);
  }

  @Post(':id/schedule')
  @RequirePermission('auction.publish')
  @ApiOperation({ summary: 'Schedule a draft auction to open at its start time' })
  schedule(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.auctions.schedule(id, user.id);
  }

  @Post(':id/unschedule')
  @RequirePermission('auction.publish')
  @ApiOperation({ summary: 'Return a scheduled auction to draft, before it opens' })
  unschedule(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.auctions.unschedule(id, user.id);
  }

  @Post(':id/cancel')
  @RequirePermission('auction.manage')
  @ApiOperation({ summary: 'Cancel a draft or scheduled auction, with a reason' })
  cancel(@Param('id') id: string, @Body() dto: CancelAuctionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.auctions.cancel(id, dto.reason, user.id);
  }
}
