import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../core/auth/decorators';
import { WishlistService } from './wishlist.service';

/** Staff value from WO-7.6: what is wanted and out of stock, feeding Phase 1's reorder suggestions. */
@ApiTags('wishlist')
@Controller('admin/wishlist')
@RequirePermission('analytics.view')
export class WishlistAdminController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get('out-of-stock-report')
  @ApiOperation({ summary: 'Wishlisted products that are currently out of stock, most-wanted first' })
  async report() {
    return this.wishlist.outOfStockReport();
  }
}
