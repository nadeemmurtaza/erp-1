import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import type { ScopedActor } from '../../core/auth/scope.guard';
import { OrganizationService } from './organization.service';
import { NodesService } from './nodes.service';
import { GrantScopeDto } from './dto/admin-scope.dto';
import { RegisterNodeDto } from './dto/node.dto';

/**
 * The three-level admin shell (R19, WO-18.5) plus who holds a seat in it
 * (R10, WO-18.6). Every route is scoped by the caller's own `AdminScope`
 * grants, resolved fresh per request — see `OrganizationService.grantsFor()`.
 * `organization.view` gates the read side; `organization.manage` the
 * admin-scope roster below, which additionally requires the caller's own
 * scope to be ORG-wide — a permission alone is not enough to hand out
 * power over brands and branches, only a super admin may.
 */
@ApiTags('admin/organization')
@Controller('organization')
@RequirePermission('organization.view')
export class OrganizationController {
  constructor(
    private readonly organization: OrganizationService,
    private readonly nodesService: NodesService,
  ) {}

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

  @Post('nodes')
  @RequirePermission('organization.manage')
  @ApiOperation({ summary: 'Register a child node — or re-activate and update one that already exists' })
  async registerNode(@Body() dto: RegisterNodeDto) {
    return this.nodesService.register(dto);
  }

  @Post('nodes/:nodeId/rotate-inbound-key')
  @RequirePermission('organization.manage')
  @ApiOperation({ summary: 'Issue a fresh replication credential for a child node — shown once, never retrievable again' })
  async rotateNodeInboundKey(@Param('nodeId') nodeId: string) {
    return this.nodesService.rotateInboundKey(nodeId);
  }

  @Get('admin-scopes')
  @RequirePermission('organization.manage')
  @ApiOperation({ summary: 'Every AdminScope grant — who is a super admin, who runs which brand, who manages which branch' })
  async adminScopes(@CurrentUser() user: AuthenticatedUser) {
    return this.organization.listScopes(await this.actorFor(user));
  }

  @Post('admin-scopes')
  @RequirePermission('organization.manage')
  @ApiOperation({ summary: 'Make a user a super admin, a brand admin, or a branch admin' })
  async grantScope(@CurrentUser() user: AuthenticatedUser, @Body() dto: GrantScopeDto) {
    return this.organization.grantScope(await this.actorFor(user), dto);
  }

  @Delete('admin-scopes/:id')
  @RequirePermission('organization.manage')
  @ApiOperation({ summary: 'Revoke an AdminScope grant' })
  async revokeScope(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.organization.revokeScope(await this.actorFor(user), id);
    return { revoked: true };
  }
}
