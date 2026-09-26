import { Controller, Delete, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { OpsAuthGuard } from '../../core/security/ops-auth.guard';
import { RequireOpsPermission } from '../../core/security/decorators';
import { MarketplaceCredentialsService } from './marketplace-credentials.service';

/**
 * `POST /marketplace/tenants/:tenantId/credential{,/rotate}`,
 * `DELETE /marketplace/tenants/:tenantId/credential` — ops-authenticated,
 * mirroring `TenantsController`'s own shape exactly. This is doc 165's own
 * "Admin screen: register a partner, issue/rotate its inbound API key"
 * concept applied at the platform level: an ops principal onboards an
 * existing `PlatformTenant` onto the cross-tenant network. A tenant's own
 * erp-1-side admin screen (not yet built — WO-165.2/WO-166.3) calls
 * through to this same API, never a second issuance mechanism.
 */
@Controller('marketplace/tenants/:tenantId/credential')
@UseGuards(OpsAuthGuard)
export class MarketplaceCredentialsController {
  constructor(private readonly credentials: MarketplaceCredentialsService) {}

  @Post()
  @RequireOpsPermission('platform.marketplace.manage')
  issue(@Param('tenantId') tenantId: string) {
    return this.credentials.issue(tenantId);
  }

  @Post('rotate')
  @RequireOpsPermission('platform.marketplace.manage')
  rotate(@Param('tenantId') tenantId: string) {
    return this.credentials.rotate(tenantId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireOpsPermission('platform.marketplace.manage')
  async revoke(@Param('tenantId') tenantId: string): Promise<void> {
    await this.credentials.revoke(tenantId);
  }
}
