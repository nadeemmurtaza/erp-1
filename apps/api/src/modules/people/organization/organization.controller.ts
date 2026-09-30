import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission, SessionOnly } from '../../../core/auth/decorators';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import type { ScopedActor } from '../../../core/auth/scope.guard';
import { OrganizationService } from './organization.service';
import { NodesService } from './nodes.service';
import { GrantScopeDto } from './dto/admin-scope.dto';
import { RegisterNodeDto } from './dto/node.dto';
import { SetInterBrandTransfersPolicyDto } from './dto/organization-policy.dto';
import { UpdateBrandPolicyDto } from './dto/brand-policy.dto';
import { SetNodeBrandDto } from './dto/node-brand.dto';
import { ResolvePolicyQuarantineDto } from './dto/policy-quarantine.dto';
import { ReplicationCursorService } from '../../../core/replication/replication-cursor.service';
import { PARENT_PEER_ID } from '../../../core/replication/replication.types';

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
    private readonly replicationCursor: ReplicationCursorService,
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

  @Patch('nodes/:nodeId/brand')
  @RequirePermission('organization.manage')
  @ApiOperation({ summary: 'Set which brand a registered node belongs to (WO-23.3c/e) — governs its BrandPolicy checks on replication receipt' })
  async setNodeBrand(@Param('nodeId') nodeId: string, @Body() dto: SetNodeBrandDto) {
    return this.nodesService.setRetailBrand(nodeId, dto.retailBrandId);
  }

  // Mints a replication credential that would outlive any API key (163-personal-api-keys.md §2).
  @Post('nodes/:nodeId/rotate-inbound-key')
  @RequirePermission('organization.manage')
  @SessionOnly()
  @ApiOperation({ summary: 'Issue a fresh replication credential for a child node — shown once, never retrievable again' })
  async rotateNodeInboundKey(@Param('nodeId') nodeId: string) {
    return this.nodesService.rotateInboundKey(nodeId);
  }

  @Post('replication/resync')
  @RequirePermission('organization.manage')
  @ApiOperation({
    summary:
      "Re-pull this box's entire POLICY log from its parent from scratch (WO-20.5) — deletes the local DOWN cursor; the next sync tick replays everything",
  })
  async resyncFromParent() {
    await this.replicationCursor.reset(PARENT_PEER_ID, 'DOWN');
    return { resyncing: true };
  }

  @Patch('policy/inter-brand-transfers')
  @RequirePermission('organization.manage')
  @ApiOperation({ summary: 'Turn inter-brand transfers on or off for this organization (RETAIL-ERP.md R9, WO-22.2)' })
  async setInterBrandTransfersPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetInterBrandTransfersPolicyDto,
  ) {
    return this.organization.setInterBrandTransfersPolicy(await this.actorFor(user), dto.allow);
  }

  @Get('brands/:brandId/policy')
  @ApiOperation({ summary: "A brand's own policy switches for its branches (RETAIL-ERP.md R9/R13) — null when never configured, which means every switch is off" })
  async brandPolicy(@CurrentUser() user: AuthenticatedUser, @Param('brandId') brandId: string) {
    return this.organization.getBrandPolicy(await this.actorFor(user), brandId);
  }

  @Patch('brands/:brandId/policy')
  @RequirePermission('organization.manage')
  @ApiOperation({ summary: 'Set a brand policy switch — allowBranchProductCreation, allowBranchLocalPurchasing, allowInterBranchTransfers' })
  async setBrandPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Body() dto: UpdateBrandPolicyDto,
  ) {
    return this.organization.setBrandPolicy(await this.actorFor(user), brandId, dto);
  }

  @Get('policy-quarantine')
  @ApiOperation({ summary: "R9's quarantine — facts that applied but violate the BrandPolicy switch meant to govern their origin node, held open for review (WO-23.3c/e)" })
  async listPolicyQuarantine(@CurrentUser() user: AuthenticatedUser) {
    return this.organization.listPolicyQuarantine(await this.actorFor(user));
  }

  @Post('policy-quarantine/:id/resolve')
  @RequirePermission('organization.manage')
  @ApiOperation({ summary: 'Mark a quarantined policy exception reviewed' })
  async resolvePolicyQuarantine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResolvePolicyQuarantineDto,
  ) {
    return this.organization.resolvePolicyQuarantine(await this.actorFor(user), id, user.id, dto.note);
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
