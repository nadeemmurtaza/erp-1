import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { stringify } from 'csv-stringify/sync';
import { BRAND } from '@newax/shared';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { CurrentUser, Public, RequirePermission } from '../../../core/auth/decorators';
import { PaginationQueryDto } from '../../../core/common/dto/pagination.dto';
import { OnsiteMessagesService } from './onsite-messages.service';
import { CreateOnsiteMessageDto, NewsletterSignupDto, UpdateOnsiteMessageDto } from './dto/onsite-message.dto';

@ApiTags('admin/onsite-messages')
@Controller('admin/onsite-messages')
export class OnsiteMessagesAdminController {
  constructor(private readonly onsiteMessages: OnsiteMessagesService) {}

  @Get()
  @RequirePermission('onsitemessages.view', 'onsitemessages.manage')
  list() {
    return this.onsiteMessages.listMessages();
  }

  @Get('newsletter-subscribers')
  @RequirePermission('onsitemessages.view', 'onsitemessages.manage')
  subscribers(@Query() query: PaginationQueryDto) {
    return this.onsiteMessages.listSubscribers(query.page, query.pageSize);
  }

  @Patch('newsletter-subscribers/:id/opt-out')
  @RequirePermission('onsitemessages.manage')
  optOutSubscriber(@Param('id') id: string) {
    return this.onsiteMessages.optOutSubscriber(id);
  }

  @Get('newsletter-subscribers/export')
  @RequirePermission('onsitemessages.view', 'onsitemessages.manage')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    `attachment; filename="${BRAND.identity.domain.split('.')[0]}-newsletter-subscribers.csv"`,
  )
  @ApiOperation({ summary: 'Every still-subscribed newsletter capture, for an email tool import' })
  async exportSubscribers(): Promise<string> {
    const subscribers = await this.onsiteMessages.listAllActiveSubscribers();
    return stringify(
      subscribers.map((s) => ({ email: s.email, locale: s.locale, subscribedAt: s.subscribedAt.toISOString() })),
      { header: true },
    );
  }

  @Get(':id')
  @RequirePermission('onsitemessages.view', 'onsitemessages.manage')
  get(@Param('id') id: string) {
    return this.onsiteMessages.getMessage(id);
  }

  @Post()
  @RequirePermission('onsitemessages.manage')
  create(@Body() dto: CreateOnsiteMessageDto) {
    return this.onsiteMessages.createMessage(dto);
  }

  @Patch(':id')
  @RequirePermission('onsitemessages.manage')
  update(@Param('id') id: string, @Body() dto: UpdateOnsiteMessageDto) {
    return this.onsiteMessages.updateMessage(id, dto);
  }

  @Delete(':id')
  @RequirePermission('onsitemessages.manage')
  remove(@Param('id') id: string) {
    return this.onsiteMessages.deleteMessage(id);
  }
}

@ApiTags('onsite-messages')
@Controller('onsite-messages')
@Public()
export class OnsiteMessagesController {
  constructor(private readonly onsiteMessages: OnsiteMessagesService) {}

  @Get('active')
  active(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query('path') path = '/',
    @Query('locale') locale = 'en',
  ) {
    return this.onsiteMessages.activeMessages(path, locale, user?.id);
  }

  @Post('newsletter')
  subscribe(@Body() dto: NewsletterSignupDto) {
    return this.onsiteMessages.subscribeNewsletter(dto.email, dto.locale);
  }
}
