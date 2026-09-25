import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { OpsAuthGuard } from '../../core/security/ops-auth.guard';
import { RequireOpsPermission } from '../../core/security/decorators';
import { SupportAccessService } from './support-access.service';
import { ApproveGrantDto, IssueGrantDto } from './dto/issue-grant.dto';

@Controller('support-access')
@UseGuards(OpsAuthGuard)
export class SupportAccessController {
  constructor(private readonly supportAccess: SupportAccessService) {}

  @Post()
  @RequireOpsPermission('platform.support.grant_access')
  issue(@Body() dto: IssueGrantDto) {
    return this.supportAccess.issue(dto);
  }

  @Get()
  @RequireOpsPermission('platform.support.grant_access')
  findByTicket(@Query('ticketReference') ticketReference: string) {
    return this.supportAccess.findByTicketReference(ticketReference ?? '');
  }

  @Get('tenant/:tenantId')
  @RequireOpsPermission('platform.support.grant_access')
  listForTenant(@Param('tenantId') tenantId: string) {
    return this.supportAccess.listForTenant(tenantId);
  }

  @Get(':id')
  @RequireOpsPermission('platform.support.grant_access')
  getById(@Param('id') id: string) {
    return this.supportAccess.getById(id);
  }

  @Patch(':id/approve')
  @RequireOpsPermission('platform.support.approve_dedicated_access')
  approve(@Param('id') id: string, @Body() dto: ApproveGrantDto) {
    return this.supportAccess.approve(id, dto.approvedByUserId);
  }

  @Patch(':id/revoke')
  @RequireOpsPermission('platform.support.grant_access')
  revoke(@Param('id') id: string) {
    return this.supportAccess.revoke(id);
  }

  @Post(':id/access')
  @RequireOpsPermission('platform.support.grant_access')
  recordAccess(@Param('id') id: string) {
    return this.supportAccess.recordAccess(id);
  }
}
