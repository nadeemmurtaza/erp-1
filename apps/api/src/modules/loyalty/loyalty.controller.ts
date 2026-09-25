import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedOnly, CurrentUser, Public } from '../../core/auth/decorators';
import { PaginationQueryDto } from '../../core/common/dto/pagination.dto';
import { LoyaltyService } from './loyalty.service';
import { ApplyReferralCodeDto, RedeemPointsDto } from './dto/loyalty.dto';

/** WO-7.7 — the customer's own points, tiers and referrals. */
@ApiTags('loyalty')
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('tiers')
  @Public()
  @ApiOperation({ summary: 'Loyalty tiers and their benefits' })
  async tiers() {
    return this.loyalty.listTiers();
  }

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'My points balance, tier and trailing 12-month spend' })
  async balance(@CurrentUser('id') userId: string) {
    return this.loyalty.balance(userId);
  }

  @Get('ledger')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'My points history' })
  async ledger(@CurrentUser('id') userId: string, @Query() query: PaginationQueryDto) {
    return this.loyalty.ledger(userId, { skip: query.skip, take: query.take, order: query.order });
  }

  @Post('redeem')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Convert points to store credit' })
  async redeem(@CurrentUser('id') userId: string, @Body() dto: RedeemPointsDto) {
    return this.loyalty.redeem(userId, dto.points);
  }

  @Get('referral-code')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'My own referral code (generated on first request)' })
  async myReferralCode(@CurrentUser('id') userId: string) {
    return { code: await this.loyalty.myReferralCode(userId) };
  }

  @Get('referrals')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Customers I have referred' })
  async myReferrals(@CurrentUser('id') userId: string) {
    return this.loyalty.myReferrals(userId);
  }

  @Post('referral/apply')
  @AuthenticatedOnly()
  @ApiOperation({ summary: "Apply a friend's referral code to my account" })
  async applyReferralCode(@CurrentUser('id') userId: string, @Body() dto: ApplyReferralCodeDto) {
    return this.loyalty.applyReferralCode(userId, dto.code);
  }
}
