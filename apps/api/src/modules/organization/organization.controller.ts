import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import type { ScopedActor } from '../../core/auth/scope.guard';
import { OrganizationService } from './organization.service';

/**
 * Read side of the three-level admin shell (R19, WO-18.5). Every route here
 * is scoped by the caller's own `AdminScope` grants, resolved fresh per
 * request — see `OrganizationService.grantsFor()`. `organization.view` gates
 * whether the shell exists for this user at all; `AdminScope` (empty for
 * everyone until an ORG/BRAND/BRANCH admin is explicitly granted one) gates
 * which rows they see inside it.
 */
@ApiTags('admin/organization')
@Controller('organization')
@RequirePermission('organization.view')
export class OrganizationController {
  constructor(private readonly organization: OrganizationService) {}

  private async actorFor(user: AuthenticatedUser): Promise<ScopedActor> {
    const adminScopes = await this.organization.grantsFor(user.id);
    return { id: user.id, permissions: user.permissions, adminScopes };
  }

  @Get('me/scope')
  @ApiOperation({ summary: "The caller's resolved scope — where to land, and what chips to draw" })
  async myScope(@CurrentUser() user: AuthenticatedUser) {
    return this.organization.myScope(await this.actorFor(user));
  }

  @Get('brands')
  @ApiOperation({ summary: 'Retail brands visible to the caller' })
  async brands(@CurrentUser() user: AuthenticatedUser) {
    return this.organization.listBrands(await this.actorFor(user));
  }

  @Get('nodes')
  @ApiOperation({ summary: "This deployment's registered child nodes, visible to the caller" })
  async nodes(@CurrentUser() user: AuthenticatedUser) {
    return this.organization.listNodes(await this.actorFor(user));
  }
}
