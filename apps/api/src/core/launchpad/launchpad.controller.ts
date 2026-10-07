import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ResolvedLaunchpadApp } from '@newax/shared';
import { AuthenticatedOnly, CurrentUser, RequirePermission } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/auth.constants';
import { SetAppEnablementDto } from './dto/set-app-enablement.dto';
import { LaunchpadService, type LaunchpadAppStatus } from './launchpad.service';

/**
 * The launchpad (launchpad-apps/232). `GET /launchpad` is open to any signed-in
 * user on purpose: it returns only which APPS exist for this deployment, never
 * data, and showing a tile grants nothing — every route behind it keeps its own
 * `@RequirePermission`. The web app narrows it to the entries the person can
 * actually reach.
 */
@ApiTags('launchpad')
@Controller('launchpad')
export class LaunchpadController {
  constructor(private readonly launchpad: LaunchpadService) {}

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'The first-party apps this deployment and organization show on the launchpad' })
  async list(): Promise<{ apps: ResolvedLaunchpadApp[] }> {
    return { apps: await this.launchpad.visibleApps() };
  }

  @Get('apps')
  @RequirePermission('launchpad.manage')
  @ApiOperation({ summary: 'Every shipped app with its on/off switch and why it is hidden, if it is' })
  async statuses(): Promise<{ apps: LaunchpadAppStatus[] }> {
    return { apps: await this.launchpad.statuses() };
  }

  @Put('apps/:key')
  @RequirePermission('launchpad.manage')
  @ApiOperation({ summary: 'Switch one app on or off for the whole organization (hides the tile; deletes nothing)' })
  async setEnabled(
    @Param('key') key: string,
    @Body() dto: SetAppEnablementDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ apps: LaunchpadAppStatus[] }> {
    return { apps: await this.launchpad.setEnabled(key, dto.enabled, user.id) };
  }
}
