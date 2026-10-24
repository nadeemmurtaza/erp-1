import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../../core/auth/decorators';
import { PaginationQueryDto } from '../../../core/common/dto/pagination.dto';
import { WalletService } from './wallet.service';
import { WalletAdjustmentDto, DecideAdjustmentDto, SetWalletAccountStatusDto, RefundPurchaseDto, RefundRedeemedOrderDto } from './dto/wallet.dto';

/**
 * doc 155 (WO-155.4/155.5) — staff-side wallet administration: manual
 * adjustments (below/at-or-above the auto-approval threshold), refunds, and
 * account status. Reachable only when `wallet` is enabled in MODULES.
 */
@ApiTags('Wallet Admin')
@Controller('admin/wallet')
export class WalletAdminController {
  constructor(private readonly wallet: WalletService) {}

  @Get('customers/:customerId')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: "A customer's own wallet account — the id a staff screen starts from" })
  async findAccount(@Param('customerId') customerId: string) {
    return this.wallet.findAccountByCustomer(customerId);
  }

  @Get('accounts/:accountId/ledger')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: "A wallet account's balance and full ledger" })
  async ledger(@Param('accountId') accountId: string, @Query() query: PaginationQueryDto) {
    const [balance, ledger] = await Promise.all([
      this.wallet.availableBalance(accountId),
      this.wallet.ledgerByAccountId(accountId, { skip: query.skip, take: query.take, order: query.order }),
    ]);
    return { balance, ...ledger };
  }

  @Post('accounts/:accountId/adjustments')
  @RequirePermission('finance.wallets.adjust')
  @ApiOperation({ summary: 'Issue a manual wallet correction — auto-committed below threshold, otherwise opens an approval request' })
  async adjust(@Param('accountId') accountId: string, @Body() dto: WalletAdjustmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.wallet.adjustment(accountId, { ...dto, requestedByUserId: user.id });
  }

  @Post('adjustment-requests/:requestId/decide')
  @RequirePermission('finance.wallets.adjust.approve')
  @ApiOperation({ summary: 'Approve or reject an above-threshold adjustment — never its own requester' })
  async decideAdjustment(@Param('requestId') requestId: string, @Body() dto: DecideAdjustmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.wallet.decideAdjustment(requestId, user.id, dto.decision, dto.comment);
  }

  @Post('accounts/:accountId/status')
  @RequirePermission('finance.wallets.adjust.approve')
  @ApiOperation({ summary: 'Freeze, close or reactivate a wallet — a higher bar than a routine adjustment' })
  async setStatus(@Param('accountId') accountId: string, @Body() dto: SetWalletAccountStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.wallet.setAccountStatus(accountId, dto.status, user.id);
  }

  @Post('customers/:customerId/refund/purchase')
  @RequirePermission('finance.wallets.adjust')
  @ApiOperation({ summary: 'Refund an unredeemed wallet purchase' })
  async refundPurchase(@Param('customerId') customerId: string, @Body() dto: RefundPurchaseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.wallet.refund({ kind: 'PURCHASE', customerId, ...dto, actorId: user.id });
  }

  @Post('orders/:orderId/refund/redeemed')
  @RequirePermission('finance.wallets.adjust')
  @ApiOperation({ summary: "Refund an order already redeemed from a customer's wallet — corrects the merchant's own payable, never the customer's balance directly" })
  async refundRedeemedOrder(@Param('orderId') orderId: string, @Body() dto: RefundRedeemedOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.wallet.refund({ kind: 'REDEEM', orderId, ...dto, actorId: user.id });
  }
}
