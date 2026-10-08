import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../../core/auth/decorators';
import { AuctionSettlementService } from './auction-settlement.service';
import { CancelSettlementDto, SettlementListQueryDto } from './dto/auction.dto';

/**
 * What an auction's winners owe, and what staff may do about it (doc 234 §9,
 * WO-234.6). Every route needs `auction.settle`, separate from `auction.manage`:
 * cancelling a win releases a buyer from a debt and offering a lot on moves it
 * to someone else, so the person who can draft a sale does not get it by that.
 * The service refuses a staff member acting on a win that is their own.
 */
@ApiTags('admin/auctions')
@Controller('admin/auctions/:id/settlements')
@RequirePermission('auction.settle')
export class AuctionSettlementController {
  constructor(private readonly settlement: AuctionSettlementService) {}

  @Get('summary')
  @ApiOperation({ summary: 'How many wins are awaiting payment, need attention, are paid, or have ended' })
  summary(@Param('id') id: string) {
    return this.settlement.summary(id);
  }

  @Get()
  @ApiOperation({ summary: 'The auction’s wins with what each owes, its order and its deadline, newest first' })
  list(@Param('id') id: string, @Query() query: SettlementListQueryDto) {
    return this.settlement.list(id, query);
  }

  @Post(':settlementId/replay')
  @ApiOperation({ summary: 'Try the invoice again for a win whose invoice failed or stalled' })
  replay(@Param('id') id: string, @Param('settlementId') settlementId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.settlement.replay(id, settlementId, { id: user.id, permissions: user.permissions });
  }

  @Post(':settlementId/cancel')
  @ApiOperation({ summary: 'End an unpaid win with no strike, for a reason staff write down; its order is cancelled' })
  cancel(
    @Param('id') id: string,
    @Param('settlementId') settlementId: string,
    @Body() dto: CancelSettlementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.settlement.cancel(id, settlementId, { id: user.id, permissions: user.permissions }, dto);
  }

  @Post(':settlementId/offer-next')
  @ApiOperation({ summary: 'Offer the lot to the next highest bidder at their own highest bid, with a new order and window' })
  offerNext(@Param('id') id: string, @Param('settlementId') settlementId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.settlement.offerNext(id, settlementId, { id: user.id, permissions: user.permissions });
  }
}
