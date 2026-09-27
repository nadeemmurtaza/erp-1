import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { AuthenticatedOnly, CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { AssignTicketDto, CreateTicketDto, ReplyTicketDto, TransitionTicketDto } from './dto/support.dto';
import { SupportTicketsService } from './support-tickets.service';

/**
 * tasks-notifications-support/64-help-desk-support-ticketing.md (WO-64.5).
 * Raising a ticket needs `support.tickets.raise` (broad); reading, replying
 * and transitioning a specific ticket are gated per-instance inside the
 * service (visibility, and who may move a status) rather than one blanket
 * route permission — the same shape doc 24's `NotifyService.decide()`
 * already uses for an identity check `@RequirePermission` cannot express.
 */
@ApiTags('admin/support/tickets')
@Controller('admin/support/tickets')
export class SupportTicketsController {
  constructor(private readonly tickets: SupportTicketsService) {}

  @Post()
  @RequirePermission('support.tickets.raise')
  @ApiOperation({ summary: 'Raise a support ticket' })
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tickets.create({ raisedByUserId: user.id, subject: dto.subject, category: dto.category, priority: dto.priority });
  }

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Tickets you raised or were assigned — or every ticket, with support.tickets.view_all' })
  list(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED') {
    return this.tickets.list(user, { status });
  }

  @Get(':id')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'One ticket, with its full reply thread' })
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tickets.get(id, user);
  }

  @Post(':id/messages')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Reply on a ticket you can see' })
  reply(@Param('id') id: string, @Body() dto: ReplyTicketDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tickets.reply(id, dto.body, user);
  }

  @Post(':id/assign')
  @RequirePermission('support.tickets.reassign')
  @ApiOperation({ summary: 'Assign or reassign a ticket to someone who holds support.tickets.handle' })
  assign(@Param('id') id: string, @Body() dto: AssignTicketDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tickets.assign(id, dto.assigneeUserId, user.id);
  }

  @Post(':id/transition')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Move a ticket forward, or reopen a resolved one' })
  transition(@Param('id') id: string, @Body() dto: TransitionTicketDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tickets.transition(id, dto.status, user);
  }
}
