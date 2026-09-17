import { Controller, Get, Headers, Query, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../core/auth/decorators';
import { TradingPartnersService } from './trading-partners.service';

/**
 * What a connected trading partner's own system calls — authenticated by
 * their inbound API key (WO-18.2), never a user session, so every route
 * here is `@Public()` and verifies the key itself. Distinct from
 * `TradingPartnersController` (`admin/trading-partners`), which is staff
 * registering and managing partners, not a partner calling in.
 */
@ApiTags('Trading Partner Portal')
@Controller('trading-partners')
export class TradingPartnerPortalController {
  constructor(private readonly tradingPartners: TradingPartnersService) {}

  @Get('stock')
  @Public()
  @ApiOperation({
    summary: "Live stock and price for the SKUs a connected partner names (kind CUSTOMER or BOTH only)",
  })
  async stock(
    @Headers('authorization') authorization: string | undefined,
    @Query('skus') skus: string | undefined,
  ) {
    const partner = await this.tradingPartners.verifyInboundKey(bearerToken(authorization));
    const list = (skus ?? '')
      .split(',')
      .map((sku) => sku.trim())
      .filter(Boolean);

    return { data: await this.tradingPartners.getLiveStock(partner, list) };
  }
}

function bearerToken(authorization: string | undefined): string {
  if (!authorization?.startsWith('Bearer ')) {
    throw new UnauthorizedException('Missing or malformed Authorization header — expected "Bearer <api key>".');
  }
  return authorization.slice('Bearer '.length);
}
