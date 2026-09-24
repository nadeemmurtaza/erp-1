import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedOnly } from '../../core/auth/decorators';
import { GiftCardsService } from './giftcards.service';

/**
 * WO-5.4's own security note: "The lookup endpoint is rate-limited and
 * authenticated. An open check-balance endpoint is a gift-card enumeration
 * attack." Any signed-in account may look up a code they hold — this never
 * scopes to "their own" gift card, since a gift card has no owner until
 * redeemed, exactly like a real physical card.
 */
@ApiTags('gift-cards')
@Controller('gift-cards')
@AuthenticatedOnly()
export class GiftCardsAccountController {
  constructor(private readonly giftCards: GiftCardsService) {}

  @Get(':code/balance')
  @ApiOperation({ summary: 'Check a gift card balance by code' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async balance(@Param('code') code: string) {
    return this.giftCards.lookupBalance(code);
  }
}
