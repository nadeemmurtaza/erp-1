import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { EmbedWidgetsService } from './embed-widgets.service';
import { CreateEmbeddedWidgetDto, UpdateEmbeddedWidgetDto } from './dto/embedded-widget.dto';

/**
 * architecture-patterns/113-micro-frontend-embedding.md (WO-113.1/113.2).
 * Defining which third-party tools may be embedded is a settings-level
 * decision (`settings.embeds.manage`); viewing an already-configured widget
 * is gated the same as the rest of this repository's supplementary admin
 * dashboards (`analytics.view`) — it never grants the embedded tool any
 * access wider than the viewer's own identity.
 */
@ApiTags('admin/embeds')
@Controller('admin/embeds')
export class EmbedWidgetsController {
  constructor(private readonly embeds: EmbedWidgetsService) {}

  @Get()
  @RequirePermission('analytics.view')
  @ApiOperation({ summary: 'Every active embedded widget' })
  list() {
    return this.embeds.listWidgets(true);
  }

  @Get('all')
  @RequirePermission('settings.embeds.manage')
  @ApiOperation({ summary: 'Every embedded widget, active or not — for the configuration screen' })
  listAll() {
    return this.embeds.listWidgets(false);
  }

  @Post()
  @RequirePermission('settings.embeds.manage')
  @ApiOperation({ summary: 'Register a new embeddable widget' })
  create(@Body() dto: CreateEmbeddedWidgetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.embeds.createWidget(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('settings.embeds.manage')
  @ApiOperation({ summary: 'Edit or deactivate an embedded widget' })
  update(@Param('id') id: string, @Body() dto: UpdateEmbeddedWidgetDto) {
    return this.embeds.updateWidget(id, dto);
  }

  @Delete(':id')
  @RequirePermission('settings.embeds.manage')
  @ApiOperation({ summary: 'Remove an embedded widget' })
  remove(@Param('id') id: string) {
    return this.embeds.deleteWidget(id);
  }

  @Post(':key/token')
  @RequirePermission('analytics.view')
  @ApiOperation({ summary: 'A short-lived, scoped token for one active widget — never a raw session credential' })
  issueToken(@Param('key') key: string, @CurrentUser() user: AuthenticatedUser) {
    return this.embeds.issueEmbedToken(user, key);
  }
}
