import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../core/auth/decorators';
import { PromotionsService } from './promotions.service';
import { CreateDiscountDto, DiscountQueryDto, PreviewDiscountDto, UpdateDiscountDto } from './dto/discount.dto';
import { BulkGeneratePromoCodesDto, CreatePromoCodeDto, PromoCodeQueryDto, UpdatePromoCodeDto } from './dto/promo-code.dto';

@ApiTags('Promotions Admin')
@Controller('admin/promotions')
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get('discounts')
  @RequirePermission('promotions.view')
  @ApiOperation({ summary: 'List discounts, paginated' })
  async listDiscounts(@Query() query: DiscountQueryDto) {
    return this.promotions.listDiscounts(query);
  }

  @Get('discounts/:id')
  @RequirePermission('promotions.view')
  @ApiOperation({ summary: 'One discount' })
  async getDiscount(@Param('id') id: string) {
    return this.promotions.getDiscount(id);
  }

  @Post('discounts')
  @RequirePermission('promotions.manage')
  @ApiOperation({ summary: 'Create a discount' })
  async createDiscount(@Body() dto: CreateDiscountDto) {
    return this.promotions.createDiscount(dto);
  }

  @Post('discounts/preview')
  @RequirePermission('promotions.manage')
  @ApiOperation({ summary: 'What this draft discount would have done to the last 30 days of real orders' })
  async previewDiscount(@Body() dto: PreviewDiscountDto) {
    return this.promotions.previewDiscount(dto);
  }

  @Patch('discounts/:id')
  @RequirePermission('promotions.manage')
  @ApiOperation({ summary: 'Edit a discount' })
  async updateDiscount(@Param('id') id: string, @Body() dto: UpdateDiscountDto) {
    return this.promotions.updateDiscount(id, dto);
  }

  @Delete('discounts/:id')
  @RequirePermission('promotions.manage')
  @ApiOperation({ summary: 'Delete a discount' })
  async deleteDiscount(@Param('id') id: string) {
    await this.promotions.deleteDiscount(id);
    return { success: true };
  }

  @Get('promo-codes')
  @RequirePermission('promotions.view')
  @ApiOperation({ summary: 'List promo codes, paginated' })
  async listPromoCodes(@Query() query: PromoCodeQueryDto) {
    return this.promotions.listPromoCodes(query);
  }

  @Post('promo-codes')
  @RequirePermission('promotions.manage')
  @ApiOperation({ summary: 'Create one promo code' })
  async createPromoCode(@Body() dto: CreatePromoCodeDto) {
    return this.promotions.createPromoCode(dto);
  }

  @Post('promo-codes/bulk-generate')
  @RequirePermission('promotions.manage')
  @ApiOperation({ summary: 'Generate N codes with a shared prefix for a campaign' })
  async bulkGeneratePromoCodes(@Body() dto: BulkGeneratePromoCodesDto) {
    return this.promotions.bulkGeneratePromoCodes(dto);
  }

  @Patch('promo-codes/:id')
  @RequirePermission('promotions.manage')
  @ApiOperation({ summary: 'Edit, activate or deactivate a promo code' })
  async updatePromoCode(@Param('id') id: string, @Body() dto: UpdatePromoCodeDto) {
    return this.promotions.updatePromoCode(id, dto);
  }

  @Delete('promo-codes/:id')
  @RequirePermission('promotions.manage')
  @ApiOperation({ summary: 'Delete a promo code' })
  async deletePromoCode(@Param('id') id: string) {
    await this.promotions.deletePromoCode(id);
    return { success: true };
  }
}
