import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../core/auth/decorators';
import { bearerToken } from '../../../core/auth/bearer-token';
import { TradingPartnersService } from './trading-partners.service';
import { AcceptConnectionDto } from './dto/trading-partner.dto';

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

  @Post('accept')
  @Public()
  @ApiOperation({ summary: '"They accept" — the second half of the first-connection handshake, starts the relation' })
  async accept(@Body() dto: AcceptConnectionDto) {
    const partner = await this.tradingPartners.acceptConnection(dto.token, dto.role);
    return { id: partner.id, name: partner.name, kind: partner.kind, status: partner.status };
  }
}
