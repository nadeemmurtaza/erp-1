import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedOnly, CurrentUser, CustomerScope } from '../../../core/auth/decorators';
import { PaginationQueryDto } from '../../../core/common/dto/pagination.dto';
import { StoreCreditService } from './store-credit.service';

/** WO-7.4 — the customer's own balance and full transaction history. Read-only, so one scope covers the class. */
@ApiTags('store-credit')
@Controller('store-credit')
@AuthenticatedOnly()
@CustomerScope('store-credit:read')
export class StoreCreditAccountController {
  constructor(private readonly storeCredit: StoreCreditService) {}

  @Get()
  @ApiOperation({ summary: 'My store credit balance' })
  async balance(@CurrentUser('id') userId: string) {
    return { balance: await this.storeCredit.balance(userId) };
  }

  @Get('ledger')
  @ApiOperation({ summary: 'My store credit history' })
  async ledger(@CurrentUser('id') userId: string, @Query() query: PaginationQueryDto) {
    return this.storeCredit.ledger(userId, { skip: query.skip, take: query.take, order: query.order });
  }
}
