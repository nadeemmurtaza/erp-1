import { BadRequestException, Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../core/auth/decorators';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { PosCatalogService } from './pos-catalog.service';

@ApiTags('admin/pos/products')
@Controller('admin/pos/products')
@RequirePermission('pos.operate')
export class PosCatalogController {
  constructor(
    private readonly catalog: PosCatalogService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('search')
  @ApiOperation({ summary: 'sku/barcode/name lookup, scoped to one terminal’s location stock' })
  async search(@Query('terminalId') terminalId?: string, @Query('q') q?: string) {
    if (!terminalId) throw new BadRequestException('terminalId is required.');
    const terminal = await this.prisma.posTerminal.findUnique({ where: { id: terminalId }, select: { locationId: true } });
    if (!terminal) throw new NotFoundException('Terminal not found');

    return { data: await this.catalog.searchVariants(terminal.locationId, q ?? '') };
  }

  @Get('recipes')
  @ApiOperation({ summary: 'pos-hardware/31 WO-31.4 — sellable BOM recipes, for a BOM_RECIPE_SCALE line' })
  async recipes() {
    return { data: await this.catalog.listSellableRecipes() };
  }
}
