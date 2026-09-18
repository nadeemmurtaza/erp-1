import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { StockVarianceService } from './stock-variance.service';
import { ResolveStockVarianceDto } from './dto/stock-variance.dto';

@ApiTags('admin/inventory/variances')
@Controller('admin/inventory/variances')
@RequirePermission('inventory.manage')
export class StockVarianceController {
  constructor(private readonly variances: StockVarianceService) {}

  @Get()
  @ApiOperation({ summary: 'Open oversells — postUnconditional() drove a location negative' })
  listOpen() {
    return this.variances.listOpen();
  }

  @Post(':id/resolve')
  @ApiOperation({ summary: 'Acknowledge a variance — never reverses the shrinkage journal it already posted' })
  async resolve(
    @Param('id') id: string,
    @Body() dto: ResolveStockVarianceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.variances.resolve(id, user.id, dto.resolutionNote);
  }
}
