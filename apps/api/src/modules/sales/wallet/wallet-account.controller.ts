import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedOnly, CurrentUser } from '../../../core/auth/decorators';
import { IdempotentWrite } from '../../../core/idempotency/idempotent-write.decorator';
import { PaginationQueryDto } from '../../../core/common/dto/pagination.dto';
import { WalletService } from './wallet.service';
import { PurchaseCreditDto } from './dto/wallet.dto';

/**
 * doc 155 (WO-155.5) — the customer's own balance, purchase and history
 * screen. Reachable only when the `wallet` module is enabled in MODULES —
 * see wallet.module.ts's own header comment. `purchaseCredit` is exposed
 * here for completeness and direct testing; it is not reachable from any
 * live checkout flow today (DECISIONS.md).
 */
@ApiTags('wallet')
@Controller('wallet')
@AuthenticatedOnly()
export class WalletAccountController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'My wallet balance' })
  async balance(@CurrentUser('id') userId: string) {
    return this.wallet.balance(userId);
  }

  @Get('ledger')
  @ApiOperation({ summary: 'My wallet history' })
  async ledger(@CurrentUser('id') userId: string, @Query() query: PaginationQueryDto) {
    return this.wallet.ledger(userId, { skip: query.skip, take: query.take, order: query.order });
  }

  @Post('purchase')
  @IdempotentWrite('wallet.purchase')
  @ApiOperation({ summary: 'Buy wallet credit — settles into an existing Payment, never a new tender of its own' })
  async purchase(@CurrentUser('id') userId: string, @Body() dto: PurchaseCreditDto) {
    return this.wallet.purchaseCredit(userId, dto);
  }
}
