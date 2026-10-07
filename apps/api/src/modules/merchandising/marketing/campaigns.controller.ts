import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiExcludeController, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, Public, RequirePermission } from '../../../core/auth/decorators';
import { AppConfigService } from '../../../core/config/app-config.service';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, ScheduleCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';

/** A 1x1 transparent GIF, served on every tracking-pixel hit. */
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
  'base64',
);

@ApiTags('admin/campaigns')
@Controller('admin/campaigns')
@RequirePermission('campaigns.view', 'campaigns.manage')
export class CampaignsAdminController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  list() {
    return this.campaigns.listCampaigns();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.campaigns.getCampaign(id);
  }

  @Post()
  @RequirePermission('campaigns.manage')
  create(@Body() dto: CreateCampaignDto, @CurrentUser('id') userId: string) {
    return this.campaigns.createCampaign(dto, userId);
  }

  @Patch(':id')
  @RequirePermission('campaigns.manage')
  update(@Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaigns.updateCampaign(id, dto);
  }

  @Post(':id/schedule')
  @RequirePermission('campaigns.manage')
  schedule(@Param('id') id: string, @Body() dto: ScheduleCampaignDto) {
    return this.campaigns.scheduleCampaign(id, dto);
  }

  @Post(':id/cancel')
  @RequirePermission('campaigns.manage')
  cancel(@Param('id') id: string) {
    return this.campaigns.cancelCampaign(id);
  }
}

/** Public — the open-tracking pixel and click-through redirect embedded in a sent campaign. */
@ApiExcludeController()
@Controller('campaigns/r')
@Public()
export class CampaignTrackingController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly config: AppConfigService,
  ) {}

  @Get(':recipientId/open.gif')
  async open(@Param('recipientId') recipientId: string, @Res() response: Response): Promise<void> {
    await this.campaigns.recordOpen(recipientId);
    response.setHeader('Content-Type', 'image/gif');
    response.setHeader('Cache-Control', 'no-store');
    response.send(TRACKING_PIXEL);
  }

  /**
   * `url` is attacker-controlled input inside a link this codebase itself
   * emails out, so an open-redirect check is not optional here: only a
   * relative path, or an absolute URL on the storefront's own origin, is
   * ever followed. Anything else — a phishing domain riding on a
   * legitimate-looking campaign link — is refused outright.
   */
  @Get(':recipientId/click')
  async click(
    @Param('recipientId') recipientId: string,
    @Query('url') url: string,
    @Res() response: Response,
  ): Promise<void> {
    await this.campaigns.recordClick(recipientId);
    response.redirect(this.safeRedirectTarget(url));
  }

  private safeRedirectTarget(url: string | undefined): string {
    const storefront = this.config.get('STOREFRONT_URL').replace(/\/+$/, '');
    if (!url) return storefront;
    if (url.startsWith('/')) return `${storefront}${url}`;
    try {
      const parsed = new URL(url);
      const allowed = new URL(storefront);
      if (parsed.origin === allowed.origin) return url;
    } catch {
      // fall through to the refusal below
    }
    throw new BadRequestException('That link does not point at this store.');
  }
}
