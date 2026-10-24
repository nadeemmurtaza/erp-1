import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../../core/auth/decorators';
import { IdempotentWrite } from '../../../core/idempotency/idempotent-write.decorator';
import type { ShipmentStatus } from '../../../core/prisma/client';
import { AddToManifestDto, CreateManifestDto, CreateShipmentDto, RecordShipmentStatusDto } from './dto/fulfilment.dto';
import { FulfilmentService } from './fulfilment.service';

class RtoStatsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

/** WO-6.8's `/admin/fulfilment/shipments`, `/manifests`, `/tracking`, `/rto`. */
@ApiTags('admin/fulfilment')
@Controller('admin/fulfilment')
@RequirePermission('fulfilment.manage')
export class FulfilmentAdminController {
  constructor(private readonly fulfilment: FulfilmentService) {}

  @Get('couriers')
  @RequirePermission('fulfilment.view', 'fulfilment.manage')
  listCouriers() {
    return this.fulfilment.listCouriers();
  }

  @Get('shipments')
  @RequirePermission('fulfilment.view', 'fulfilment.manage')
  listShipments(@Query('status') status?: ShipmentStatus, @Query('manifestId') manifestId?: string) {
    return this.fulfilment.listShipments({ status, manifestId });
  }

  @Get('shipments/:id')
  @RequirePermission('fulfilment.view', 'fulfilment.manage')
  getShipment(@Param('id') id: string) {
    return this.fulfilment.getShipment(id);
  }

  @Post('shipments')
  @IdempotentWrite('fulfilment.shipment.create')
  createShipment(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateShipmentDto) {
    return this.fulfilment.createShipment(dto, user.id);
  }

  @Post('shipments/:id/status')
  recordStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecordShipmentStatusDto,
  ) {
    return this.fulfilment.recordStatus(id, dto, user.id);
  }

  @Get('manifests')
  @RequirePermission('fulfilment.view', 'fulfilment.manage')
  listManifests() {
    return this.fulfilment.listManifests();
  }

  @Post('manifests')
  createManifest(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateManifestDto) {
    return this.fulfilment.createManifest(dto, user.id);
  }

  @Post('manifests/:id/shipments')
  addToManifest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddToManifestDto,
  ) {
    return this.fulfilment.addToManifest(id, dto, user.id);
  }

  @Post('manifests/:id/dispatch')
  dispatchManifest(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.fulfilment.dispatchManifest(id, user.id);
  }

  @Get('rto')
  @RequirePermission('fulfilment.view', 'fulfilment.manage')
  rtoStats(@Query() query: RtoStatsQueryDto) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
    return this.fulfilment.rtoStats(from, to);
  }
}
