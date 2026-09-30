import { Body, Controller, Get, Headers, HttpCode, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../core/auth/decorators';
import { bearerToken } from '../../../core/auth/bearer-token';
import { TradingPartnersService } from './trading-partners.service';
import { PartnerFactInboxService } from './partner-fact-inbox.service';
import { AcceptConnectionDto } from './dto/trading-partner.dto';
import { SubmitPartnerFactDto } from './dto/partner-fact.dto';

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
  constructor(
    private readonly tradingPartners: TradingPartnersService,
    private readonly factInbox: PartnerFactInboxService,
  ) {}

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

  /**
   * WO-213.1 (213-partner-fact-exchange.md). A connected partner tells us a
   * fact — goods it dispatched to us, or goods it received from us. Answers
   * 202: the fact is STORED, not applied, so a slow or absent purchasing
   * module cannot fail the partner's delivery. Sending the same factId again
   * is answered from what was stored.
   *
   * 600 requests / 60 s per source IP: room for a partner flushing a 72-hour
   * backlog of 500-line facts (10 a second) after an outage, without being
   * able to flood. The body cap is the platform's existing 100 KiB JSON limit.
   */
  @Post('facts')
  @Public()
  @HttpCode(202)
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a fact (sale.dispatched, receipt.confirmed) — stored and acknowledged, applied afterwards' })
  async submitFact(@Headers('authorization') authorization: string | undefined, @Body() dto: SubmitPartnerFactDto) {
    const partner = await this.tradingPartners.verifyInboundKey(bearerToken(authorization));
    return this.factInbox.accept(partner, dto);
  }

  @Post('accept')
  @Public()
  @ApiOperation({ summary: '"They accept" — the second half of the first-connection handshake, starts the relation' })
  async accept(@Body() dto: AcceptConnectionDto) {
    const partner = await this.tradingPartners.acceptConnection(dto.token, dto.role);
    return { id: partner.id, name: partner.name, kind: partner.kind, status: partner.status };
  }
}
