import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission, SessionOnly } from '../../core/auth/decorators';
import { TradingPartnersService } from './trading-partners.service';
import { CreateTradingPartnerDto, SetOutboundApiKeyDto, UpdateTradingPartnerDto } from './dto/trading-partner.dto';

/**
 * `purchasing.manage` may be put in a personal API key (purchase-order sync
 * is a legitimate integration), so every route that issues, installs, or can
 * redirect a credential is `@SessionOnly()` instead: a key must never mint a
 * trading-partner credential that outlives it, and must never repoint where
 * an already-stored one gets sent (163-personal-api-keys.md §2). `update()`
 * is in that second group — it writes `outboundBaseUrl`, and
 * `pushOutbound()` (trading-partners.service.ts) decrypts and POSTs the
 * stored `outboundApiKeyEncrypted` to exactly that URL, so an API key able to
 * change it could redirect the partner's real credential to itself. `status`
 * (re-enabling a suspended partner's inbound key) sits on the same route, so
 * it gets the same guard rather than splitting the endpoint.
 */
@ApiTags('Trading Partners')
@Controller('admin/trading-partners')
@RequirePermission('purchasing.manage')
export class TradingPartnersController {
  constructor(private readonly tradingPartners: TradingPartnersService) {}

  @Get()
  @ApiOperation({ summary: 'List trading partners' })
  async findAll() {
    return { data: await this.tradingPartners.findAll() };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a trading partner' })
  async findOne(@Param('id') id: string) {
    return this.tradingPartners.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Register a trading partner' })
  async create(@Body() dto: CreateTradingPartnerDto) {
    return this.tradingPartners.create(dto);
  }

  @Patch(':id')
  @SessionOnly()
  @ApiOperation({ summary: 'Update a trading partner' })
  async update(@Param('id') id: string, @Body() dto: UpdateTradingPartnerDto) {
    return this.tradingPartners.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a trading partner — linked suppliers fall back to manual entry' })
  async remove(@Param('id') id: string) {
    return this.tradingPartners.remove(id);
  }

  @Post(':id/rotate-inbound-key')
  @SessionOnly()
  @ApiOperation({ summary: 'Issue a fresh key for them to call us with — shown once, never retrievable again' })
  async rotateInboundKey(@Param('id') id: string) {
    return this.tradingPartners.rotateInboundKey(id);
  }

  @Post(':id/outbound-key')
  @SessionOnly()
  @ApiOperation({ summary: 'Store the key they gave us, for calling their API' })
  async setOutboundApiKey(@Param('id') id: string, @Body() dto: SetOutboundApiKeyDto) {
    await this.tradingPartners.setOutboundApiKey(id, dto.apiKey);
    return { saved: true };
  }

  @Post(':id/invite')
  @SessionOnly()
  @ApiOperation({ summary: 'Send the first-connection request — returns a one-time accept link, shown once' })
  async invite(@Param('id') id: string) {
    return this.tradingPartners.inviteConnection(id);
  }
}
