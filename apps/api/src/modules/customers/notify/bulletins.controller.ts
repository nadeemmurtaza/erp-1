import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../../core/auth/decorators';
import { PublishBulletinDto } from './dto/notify.dto';
import { BulletinsService } from './bulletins.service';

/**
 * tasks-notifications-support/61-policy-communications-bulletin.md
 * (WO-61.5). Publishing and retracting need `hr.bulletins.publish`;
 * reading and acknowledging need only `hr.bulletins.view`, seeded broadly
 * — "the whole point is being read by everyone in scope" (the doc's own
 * words).
 */
@ApiTags('admin/bulletins')
@Controller('admin/bulletins')
export class BulletinsController {
  constructor(private readonly bulletins: BulletinsService) {}

  @Post()
  @RequirePermission('hr.bulletins.publish')
  @ApiOperation({ summary: 'Publish a notice, queuing the "new notice" ping through the existing notification delivery' })
  publish(@Body() dto: PublishBulletinDto, @CurrentUser() user: AuthenticatedUser) {
    return this.bulletins.publish({
      authorId: user.id,
      title: dto.title,
      bodyMarkdown: dto.bodyMarkdown,
      category: dto.category,
      audienceOrgUnitId: dto.audienceOrgUnitId,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      requiresAcknowledgement: dto.requiresAcknowledgement,
    });
  }

  @Get()
  @RequirePermission('hr.bulletins.view')
  @ApiOperation({ summary: "Every active notice the caller's own org-tree membership reaches" })
  list(@CurrentUser() user: AuthenticatedUser, @Query('includeExpired') includeExpired?: string) {
    return this.bulletins.list(user.id, { includeExpired: includeExpired === 'true' });
  }

  @Get(':id')
  @RequirePermission('hr.bulletins.view')
  @ApiOperation({ summary: 'One notice, if the caller is within its audience' })
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bulletins.get(id, user.id);
  }

  @Post(':id/acknowledge')
  @RequirePermission('hr.bulletins.view')
  @ApiOperation({ summary: 'Record that the caller has read this notice — a second click is a no-op' })
  acknowledge(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bulletins.acknowledge(id, user.id);
  }

  @Post(':id/retract')
  @RequirePermission('hr.bulletins.publish')
  @ApiOperation({ summary: 'Retract a notice — removes it from the active list, never deletes the row or its acknowledgement trail' })
  retract(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bulletins.retract(id, user.id);
  }
}
