import { Body, Controller, Param, Patch, Post, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../core/auth/decorators';
import { PaginationQueryDto } from '../../../core/common/dto/pagination.dto';
import { LoyaltyService } from './loyalty.service';
import { AdjustLoyaltyPointsDto, UpsertLoyaltyTierDto } from './dto/loyalty.dto';

@ApiTags('loyalty')
@Controller('admin/loyalty')
export class LoyaltyAdminController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('customers/:userId')
  @RequirePermission('loyalty.view')
  @ApiOperation({ summary: "A customer's own loyalty balance and ledger" })
  async customerBalance(@Param('userId') userId: string, @Query() query: PaginationQueryDto) {
    const [balance, ledger] = await Promise.all([
      this.loyalty.balance(userId),
      this.loyalty.ledger(userId, { skip: query.skip, take: query.take, order: query.order }),
    ]);
    return { ...balance, ledger };
  }

  @Post('customers/:userId/adjust')
  @RequirePermission('loyalty.manage')
  @ApiOperation({ summary: "Manually adjust a customer's points" })
  async adjust(@Param('userId') userId: string, @Body() dto: AdjustLoyaltyPointsDto) {
    await this.loyalty.adjust(userId, dto);
    return this.loyalty.balance(userId);
  }

  @Post('tiers')
  @RequirePermission('loyalty.manage')
  @ApiOperation({ summary: 'Create a loyalty tier' })
  async createTier(@Body() dto: UpsertLoyaltyTierDto) {
    return this.loyalty.upsertTier(null, dto);
  }

  @Patch('tiers/:id')
  @RequirePermission('loyalty.manage')
  @ApiOperation({ summary: 'Edit a loyalty tier' })
  async updateTier(@Param('id') id: string, @Body() dto: UpsertLoyaltyTierDto) {
    return this.loyalty.upsertTier(id, dto);
  }
}
