import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../../core/auth/decorators';
import { EmailInboxService } from './email-inbox.service';
import { EmailInboxQueryDto, LinkInboundEmailDto, ReplyToInboundEmailDto } from './email-inbox.dto';

/**
 * Support Inbox — replies to order/support mail that the mailbox poller
 * pulled from a connected mailbox. Lives under crm.manage: this is customer
 * correspondence, not mailbox configuration (that's settings.manage, on
 * EmailAccountsAdminController).
 */
@ApiTags('admin/crm')
@Controller('admin/crm/inbox')
@RequirePermission('crm.manage')
export class EmailInboxAdminController {
  constructor(private readonly inbox: EmailInboxService) {}

  @Get()
  @ApiOperation({ summary: 'Messages pulled from connected mailboxes, newest first' })
  list(@Query() query: EmailInboxQueryDto) {
    return this.inbox.list({
      page: query.page,
      pageSize: query.pageSize,
      skip: query.skip,
      take: query.take,
      linked: query.linked,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.inbox.get(id);
  }

  @Post(':id/link')
  @ApiOperation({ summary: 'Link an unrecognised sender to a contact' })
  link(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: LinkInboundEmailDto,
  ) {
    return this.inbox.link(user.id, id, dto.contactId);
  }

  @Post(':id/reply')
  @ApiOperation({ summary: 'Reply from the same mailbox the message arrived at' })
  reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReplyToInboundEmailDto,
  ) {
    return this.inbox.reply(user.id, id, dto.text);
  }
}
