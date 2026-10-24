import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public } from '../../../core/auth/decorators';
import { PromotionsService } from './promotions.service';
import { PreviewCheckoutDto } from './dto/preview-checkout.dto';

/**
 * Public checkout preview (WO-5.1's own reason for `evaluateDiscounts` being
 * pure and shared): the storefront shows the discounted price as the
 * customer types a promo code, using the SAME function OrdersService.place()
 * uses at the real checkout — never a second, hand-rolled preview
 * computation that could quietly disagree with what gets charged.
 */
@ApiTags('promotions')
@Controller('promotions')
@Public()
export class PromotionsPublicController {
  constructor(private readonly promotions: PromotionsService) {}

  @Post('preview')
  @ApiOperation({ summary: 'Preview what discounts/a promo code would do to this cart' })
  // A code-guessing brute force is the real risk here (WO-5.2's own note) —
  // stricter than the global default, generous enough for a customer typing
  // a code and correcting a typo.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async preview(@Body() dto: PreviewCheckoutDto, @CurrentUser('id') userId?: string) {
    if (dto.lines.length === 0) throw new BadRequestException('The cart is empty.');
    const evaluation = await this.promotions.evaluateForCheckout({
      lines: dto.lines.map((line) => ({
        id: line.id,
        productId: line.productId ?? null,
        categoryIds: line.categoryIds ?? [],
        unitPrice: line.unitPrice,
        quantity: line.quantity,
      })),
      shippingFee: dto.shippingFee ?? 0,
      userId: userId ?? null,
      promoCode: dto.promoCode,
    });
    return {
      linePerUnitDiscounts: evaluation.result.linePerUnitDiscounts,
      orderDiscount: evaluation.result.orderDiscount,
      shippingDiscount: evaluation.result.shippingDiscount,
      applied: evaluation.result.applied,
    };
  }
}
