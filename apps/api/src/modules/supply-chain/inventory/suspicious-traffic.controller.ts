import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../core/auth/decorators';
import { SuspiciousTrafficService } from './suspicious-traffic.service';

@ApiTags('admin/inventory/suspicious-traffic')
@Controller('admin/inventory/suspicious-traffic')
export class SuspiciousTrafficController {
  constructor(private readonly service: SuspiciousTrafficService) {}

  @Get()
  @RequirePermission('analytics.view')
  async report(@Query('locationId') locationId: string, @Query('date') date?: string) {
    if (!locationId) throw new BadRequestException('locationId is required.');
    return this.service.report(locationId, date ? new Date(date) : new Date());
  }
}
