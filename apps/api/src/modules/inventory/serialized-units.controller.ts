import { Controller, Get, Param, Post, Body, Query, NotFoundException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, Public, RequirePermission } from '../../core/auth/decorators';
import { SerializedUnitsService } from './serialized-units.service';
import { ReturnSerializedUnitDto, SellSerializedUnitDto, WriteOffSerializedUnitDto } from './dto/serialized-units.dto';

/**
 * 158-serialized-unit-tracking.md WO-158.5. Reuses `inventory.manage` for
 * sell/write-off/return — this document's own explicit choice, since a
 * serialized unit is still an ordinary stock movement at whatever value
 * threshold this repo's existing controls already gate; no new permission
 * of its own. Receiving units is NOT a route here — it happens inside
 * `purchasing.service.ts`'s own `receiveGoods()`, the one real path units
 * enter stock, the same reasoning that keeps `InventoryService.move()` the
 * single writer rather than a second entry point.
 */
@ApiTags('admin/inventory/serials')
@Controller('admin/inventory/serials')
@RequirePermission('inventory.manage')
export class SerializedUnitsController {
  constructor(private readonly serials: SerializedUnitsService) {}

  @Get()
  @ApiOperation({ summary: 'Every serialized unit for a variant' })
  list(@Query('variantId') variantId: string) {
    return this.serials.listForVariant(variantId);
  }

  @Get(':serialNumber/history')
  @ApiOperation({ summary: "A unit's status, sale and warranty history — staff-side lookup" })
  async history(@Param('serialNumber') serialNumber: string) {
    const history = await this.serials.getUnitHistory(serialNumber);
    if (!history) throw new NotFoundException('That serial number is not recorded in this system.');
    return history;
  }

  @Post('sell')
  @ApiOperation({ summary: 'Sell one specific unit against an order' })
  sell(@Body() dto: SellSerializedUnitDto, @CurrentUser() user: AuthenticatedUser) {
    return this.serials.sellUnit({ serialNumber: dto.serialNumber, orderId: dto.orderId, actorId: user.id });
  }

  @Post('return')
  @ApiOperation({ summary: 'Return one specific unit — refused unless it was sold on this exact order' })
  returnUnit(@Body() dto: ReturnSerializedUnitDto, @CurrentUser() user: AuthenticatedUser) {
    return this.serials.returnUnit({ serialNumber: dto.serialNumber, orderId: dto.orderId, locationId: dto.locationId, actorId: user.id });
  }

  @Post('write-off')
  @ApiOperation({ summary: 'Theft, damage, lost — writes the unit off and records the stock movement' })
  writeOff(@Body() dto: WriteOffSerializedUnitDto, @CurrentUser() user: AuthenticatedUser) {
    return this.serials.writeOff({ serialNumber: dto.serialNumber, note: dto.note, actorId: user.id });
  }
}

/**
 * The narrow public "verify your purchase" lookup (doc 158 §3) — never
 * exposing which branch or which employee sold it, only status/date/
 * warranty, the same minimal-disclosure principle doc 46's own FBR
 * QR-code lookup already uses.
 */
@ApiTags('public/serials')
@Controller('public/serials')
export class SerializedUnitsPublicController {
  constructor(private readonly serials: SerializedUnitsService) {}

  @Get(':serialNumber')
  @Public()
  @ApiOperation({ summary: 'Verify a purchase by serial number — status, sale date and warranty only' })
  async verify(@Param('serialNumber') serialNumber: string) {
    const history = await this.serials.getUnitHistory(serialNumber);
    if (!history) throw new NotFoundException('That serial number is not recorded in this system.');
    return history;
  }
}
