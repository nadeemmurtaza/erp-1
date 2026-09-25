import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/auth.constants';
import { ActionHubRegistryService } from './action-hub-registry.service';

/**
 * `GET /admin/action-hub` (WO-44.3). Gated on `analytics.view` — the same
 * "can see the admin dashboard home" permission `10-admin-dashboard.md`'s
 * own `/admin/analytics/cards` uses, since the doc's own named gate
 * (`admin.dashboard.view`) is not a permission this codebase's catalogue
 * has ever defined.
 */
@ApiTags('admin/action-hub')
@Controller('admin/action-hub')
@RequirePermission('analytics.view')
export class ActionHubController {
  constructor(private readonly registry: ActionHubRegistryService) {}

  @Get()
  @ApiOperation({ summary: 'Every action item pending on the caller, merged from every registered source' })
  collect(@CurrentUser() user: AuthenticatedUser) {
    return this.registry.collect(user);
  }
}
