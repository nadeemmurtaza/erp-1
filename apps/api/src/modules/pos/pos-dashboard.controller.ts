import { BadRequestException, Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../core/auth/decorators';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PosDashboardService } from './pos-dashboard.service';

/**
 * pos-hardware/76-pos-mobile-dashboard.md WO-76.1/76.3 — gated by
 * `pos.dashboard.view`, distinct from `inventory.view_cost` (this screen
 * shows counts and revenue, never per-item cost/margin).
 */
@ApiTags('admin/pos/dashboard')
@Controller('admin/pos/dashboard')
@RequirePermission('pos.dashboard.view')
export class PosDashboardController {
  constructor(
    private readonly dashboard: PosDashboardService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: "The till's own daily-sales/customers/low-stock snapshot, scoped to one terminal's location" })
  async summary(@Query('terminalId') terminalId?: string) {
    if (!terminalId) throw new BadRequestException('terminalId is required.');
    const terminal = await this.prisma.posTerminal.findUnique({ where: { id: terminalId }, select: { locationId: true } });
    if (!terminal) throw new NotFoundException('Terminal not found');

    return this.dashboard.summary(terminal.locationId);
  }
}
