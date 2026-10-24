import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public, RequirePermission } from '../../../core/auth/decorators';
import {
  CreateShippingClassDto,
  CreateShippingMethodDto,
  CreateShippingRateDto,
  CreateShippingZoneDto,
  ShippingQuoteQueryDto,
  UpdateShippingClassDto,
  UpdateShippingMethodDto,
  UpdateShippingRateDto,
  UpdateShippingZoneDto,
} from './dto/shipping.dto';
import { ShippingService } from './shipping.service';

/**
 * WO-6.8's `/admin/settings/shipping` (zones, rates, methods, classes) plus
 * the storefront's own live quote — the "delivery charges are automatically
 * calculated at checkout based on your city and weight" copy on the
 * /shipping policy page needs a real endpoint behind it.
 */
@ApiTags('admin/settings/shipping')
@Controller('admin/settings/shipping')
@RequirePermission('fulfilment.manage')
export class ShippingAdminController {
  constructor(private readonly shipping: ShippingService) {}

  @Get('zones')
  @RequirePermission('fulfilment.view', 'fulfilment.manage')
  listZones() {
    return this.shipping.listZones();
  }

  @Post('zones')
  createZone(@Body() dto: CreateShippingZoneDto) {
    return this.shipping.createZone(dto);
  }

  @Patch('zones/:id')
  updateZone(@Param('id') id: string, @Body() dto: UpdateShippingZoneDto) {
    return this.shipping.updateZone(id, dto);
  }

  @Get('methods')
  @RequirePermission('fulfilment.view', 'fulfilment.manage')
  listMethods() {
    return this.shipping.listMethods();
  }

  @Post('methods')
  createMethod(@Body() dto: CreateShippingMethodDto) {
    return this.shipping.createMethod(dto);
  }

  @Patch('methods/:id')
  updateMethod(@Param('id') id: string, @Body() dto: UpdateShippingMethodDto) {
    return this.shipping.updateMethod(id, dto);
  }

  @Get('rates')
  @RequirePermission('fulfilment.view', 'fulfilment.manage')
  listRates(@Query('zoneId') zoneId?: string) {
    return this.shipping.listRates(zoneId);
  }

  @Post('rates')
  createRate(@Body() dto: CreateShippingRateDto) {
    return this.shipping.createRate(dto);
  }

  @Patch('rates/:id')
  updateRate(@Param('id') id: string, @Body() dto: UpdateShippingRateDto) {
    return this.shipping.updateRate(id, dto);
  }

  @Delete('rates/:id')
  deleteRate(@Param('id') id: string) {
    return this.shipping.deleteRate(id);
  }

  @Get('classes')
  @RequirePermission('fulfilment.view', 'fulfilment.manage')
  listClasses() {
    return this.shipping.listClasses();
  }

  @Post('classes')
  createClass(@Body() dto: CreateShippingClassDto) {
    return this.shipping.createClass(dto);
  }

  @Patch('classes/:id')
  updateClass(@Param('id') id: string, @Body() dto: UpdateShippingClassDto) {
    return this.shipping.updateClass(id, dto);
  }
}

@ApiTags('shipping')
@Controller('shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Public()
  @Get('quote')
  quote(@Query() query: ShippingQuoteQueryDto) {
    return this.shipping.quote(query.city, query.subtotal, {
      methodKey: query.methodKey,
      weightGrams: query.weightGrams,
      itemCount: query.itemCount,
    });
  }
}
