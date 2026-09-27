import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { AuthenticatedOnly, CurrentUser, CustomerScope, RequirePermission } from '../../core/auth/decorators';
import { CustomerSupportService } from './customer-support.service';
import { AssignCustomerTicketDto, RaiseCustomerTicketDto, ReplyCustomerTicketDto, TransitionCustomerTicketDto } from './dto/customer-support.dto';

/**
 * tasks-notifications-support/148-external-customer-support-portal.md
 * (WO-148.4). The customer's own side of the trust boundary — a `Contact`
 * authenticates via the existing storefront customer session, never
 * `PermissionsGuard`'s own staff-facing `PERMISSION_CATALOG` (the
 * document's own central rule). Bare `support/tickets`, matching
 * `ReturnsController`'s own customer-facing convention (`returns`, not
 * `admin/fulfilment/returns`).
 */
@ApiTags('support/tickets')
@Controller('support/tickets')
export class CustomerSupportController {
  constructor(private readonly support: CustomerSupportService) {}

  @Post()
  @AuthenticatedOnly()
  @CustomerScope('support:write')
  @ApiOperation({ summary: 'Raise a support ticket' })
  raise(@Body() dto: RaiseCustomerTicketDto, @CurrentUser() user: AuthenticatedUser) {
    return this.support.raise({
      userId: user.id,
      subject: dto.subject,
      category: dto.category,
      body: dto.body,
      orderId: dto.orderId,
      priority: dto.priority,
    });
  }

  @Get('mine')
  @AuthenticatedOnly()
  @CustomerScope('support:read')
  @ApiOperation({ summary: 'Every ticket you raised' })
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.support.listMine(user.id);
  }

  @Get(':id')
  @AuthenticatedOnly()
  @CustomerScope('support:read')
  @ApiOperation({ summary: 'One of your own tickets, with its full reply thread' })
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.support.getForCustomer(id, user.id);
  }

  @Post(':id/messages')
  @AuthenticatedOnly()
  @CustomerScope('support:write')
  @ApiOperation({ summary: 'Reply on your own ticket' })
  reply(@Param('id') id: string, @Body() dto: ReplyCustomerTicketDto, @CurrentUser() user: AuthenticatedUser) {
    return this.support.replyAsCustomer(id, user.id, dto.body);
  }

  @Post(':id/transition')
  @AuthenticatedOnly()
  @CustomerScope('support:write')
  @ApiOperation({ summary: 'Reopen a resolved ticket — every other status change is staff-side' })
  transition(@Param('id') id: string, @Body() dto: TransitionCustomerTicketDto, @CurrentUser() user: AuthenticatedUser) {
    return this.support.transition(id, dto.status, user);
  }
}

/**
 * The staff side — reuses doc 64's own three permissions unchanged, since
 * the handler pool is identical (the document's own WO-148.3).
 */
@ApiTags('admin/support/customer-tickets')
@Controller('admin/support/customer-tickets')
export class CustomerSupportStaffController {
  constructor(private readonly support: CustomerSupportService) {}

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Assigned to you, or every customer ticket with support.tickets.view_all' })
  list(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: 'OPEN' | 'AWAITING_CUSTOMER' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED') {
    return this.support.listForStaff(user, { status });
  }

  @Get(':id')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'One customer ticket, with its full reply thread' })
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.support.getForStaff(id, user);
  }

  @Post(':id/messages')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Reply as staff — notifies the customer through their own contact channel' })
  reply(@Param('id') id: string, @Body() dto: ReplyCustomerTicketDto, @CurrentUser() user: AuthenticatedUser) {
    return this.support.replyAsStaff(id, dto.body, user);
  }

  @Post(':id/assign')
  @RequirePermission('support.tickets.reassign')
  @ApiOperation({ summary: 'Assign or reassign a customer ticket to someone who holds support.tickets.handle' })
  assign(@Param('id') id: string, @Body() dto: AssignCustomerTicketDto, @CurrentUser() user: AuthenticatedUser) {
    return this.support.assign(id, dto.assigneeUserId, user.id);
  }

  @Post(':id/transition')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Move a customer ticket forward, or reopen a resolved one' })
  transition(@Param('id') id: string, @Body() dto: TransitionCustomerTicketDto, @CurrentUser() user: AuthenticatedUser) {
    return this.support.transition(id, dto.status, user);
  }
}
