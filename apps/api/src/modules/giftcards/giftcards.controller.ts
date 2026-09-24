import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { GiftCardsService } from './giftcards.service';
import { StoreCreditService } from './store-credit.service';
import { GiftCardQueryDto, IssueGiftCardDto } from './dto/gift-card.dto';
import { IssueStoreCreditDto } from './dto/store-credit.dto';
import { PaginationQueryDto } from '../../core/common/dto/pagination.dto';

@ApiTags('Gift Cards Admin')
@Controller('admin/gift-cards')
export class GiftCardsController {
  constructor(private readonly giftCards: GiftCardsService) {}

  @Get()
  @RequirePermission('giftcards.view')
  @ApiOperation({ summary: 'List gift cards, paginated' })
  async list(@Query() query: GiftCardQueryDto) {
    return this.giftCards.list(query);
  }

  @Get(':id')
  @RequirePermission('giftcards.view')
  @ApiOperation({ summary: 'One gift card with its full ledger' })
  async getById(@Param('id') id: string) {
    return this.giftCards.getById(id);
  }

  @Post()
  @RequirePermission('giftcards.manage')
  @ApiOperation({ summary: 'Issue a gift card' })
  async issue(@Body() dto: IssueGiftCardDto, @CurrentUser('id') actorId: string) {
    return this.giftCards.issue(dto, actorId);
  }

  @Patch(':id/cancel')
  @RequirePermission('giftcards.manage')
  @ApiOperation({ summary: 'Cancel a gift card, forfeiting any remaining balance' })
  async cancel(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.giftCards.cancel(id, actorId);
  }
}

@ApiTags('Store Credit Admin')
@Controller('admin/customers/:userId/store-credit')
export class StoreCreditController {
  constructor(private readonly storeCredit: StoreCreditService) {}

  @Get()
  @RequirePermission('giftcards.view')
  @ApiOperation({ summary: "A customer's store credit balance and ledger" })
  async ledger(@Param('userId') userId: string, @Query() query: PaginationQueryDto) {
    const [balance, ledger] = await Promise.all([
      this.storeCredit.balance(userId),
      this.storeCredit.ledger(userId, { skip: query.skip, take: query.take, order: query.order }),
    ]);
    return { balance, ...ledger };
  }

  @Post()
  @RequirePermission('giftcards.manage')
  @ApiOperation({ summary: 'Issue goodwill store credit to a customer' })
  async issue(@Param('userId') userId: string, @Body() dto: IssueStoreCreditDto, @CurrentUser('id') actorId: string) {
    return this.storeCredit.issue(userId, dto, actorId);
  }
}
