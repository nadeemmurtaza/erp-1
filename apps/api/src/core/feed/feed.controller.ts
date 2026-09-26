import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/auth.constants';
import { FeedRegistryService } from './feed-registry.service';

const MAX_PAGE_SIZE = 20;

/**
 * `GET /admin/feed` (WO-58.3). Gated on `analytics.view` — the same
 * "can see the admin dashboard home" permission `ActionHubController`
 * already uses for the identical reason: this is a dashboard-home widget,
 * not a domain-specific screen.
 */
@ApiTags('admin/feed')
@Controller('admin/feed')
@RequirePermission('analytics.view')
export class FeedController {
  constructor(private readonly registry: FeedRegistryService) {}

  @Get()
  @ApiOperation({ summary: 'Recent order, purchase-order and payment activity, merged and capped, newest first' })
  collect(
    @CurrentUser() user: AuthenticatedUser,
    @Query('sinceId') sinceId: string | undefined,
    @Query('locationId') locationId: string | undefined,
    @Query('limit', new DefaultValuePipe(MAX_PAGE_SIZE), ParseIntPipe) limit: number,
  ) {
    return this.registry.collect(user, sinceId ?? null, locationId, Math.min(Math.max(limit, 1), MAX_PAGE_SIZE));
  }
}
