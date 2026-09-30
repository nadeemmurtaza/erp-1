import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../core/auth/decorators';
import { OfferService } from './offer.service';
import { CreateOfferDto } from './dto/offer.dto';

@ApiTags('Trading Partner Offers')
@Controller('admin/offers')
@RequirePermission('orders.manage')
export class OffersController {
  constructor(private readonly offers: OfferService) {}

  @Get()
  @ApiOperation({ summary: 'List offers broadcast to trading partners' })
  async findAll() {
    return { data: await this.offers.findAll() };
  }

  @Post()
  @ApiOperation({ summary: 'Publish an offer — broadcast to every connected CUSTOMER/BOTH trading partner' })
  async publish(@Body() dto: CreateOfferDto) {
    return this.offers.publish(dto);
  }
}
