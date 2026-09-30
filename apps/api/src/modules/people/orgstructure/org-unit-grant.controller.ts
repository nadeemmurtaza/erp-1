import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../../core/auth/decorators';
import { GrantService } from './org-unit-grant.service';
import { IssueOrgUnitGrantDto } from './dto/org-unit-grant.dto';

/**
 * access-control-identity/21-access-over-the-org-tree.md WO-21.6 — "one
 * access screen per unit: who reaches this unit, by posting or by grant".
 * Reads sit behind `org.access.view`; issuing or revoking additionally
 * needs `org.access.grant`, re-checked inside `GrantService` itself as one
 * of its own five refusals, never trusted from the route decorator alone.
 */
@ApiTags('admin/org-structure')
@Controller('admin/org-structure/:unitId/access')
@RequirePermission('org.access.view', 'org.access.grant')
export class GrantController {
  constructor(private readonly grants: GrantService) {}

  @Get()
  @ApiOperation({ summary: 'Who reaches this unit, by posting or by grant' })
  accessOverUnit(@Param('unitId') unitId: string) {
    return this.grants.accessOverUnit(unitId);
  }

  @Post('preview')
  @RequirePermission('org.access.grant')
  @ApiOperation({ summary: 'Which refusals a grant would hit, without writing anything' })
  previewIssue(
    @Param('unitId') unitId: string,
    @Body() dto: IssueOrgUnitGrantDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.grants.previewIssue({ ...dto, orgUnitId: unitId, expiresAt: new Date(dto.expiresAt) }, user.id);
  }

  @Post()
  @RequirePermission('org.access.grant')
  @ApiOperation({ summary: 'Issue a time-boxed access grant over this unit' })
  issue(@Param('unitId') unitId: string, @Body() dto: IssueOrgUnitGrantDto, @CurrentUser() user: AuthenticatedUser) {
    return this.grants.issue({ ...dto, orgUnitId: unitId, expiresAt: new Date(dto.expiresAt) }, user.id);
  }

  @Post(':grantId/revoke')
  @RequirePermission('org.access.grant')
  @ApiOperation({ summary: 'Revoke an active grant' })
  revoke(@Param('grantId') grantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.grants.revoke(grantId, user.id);
  }
}
