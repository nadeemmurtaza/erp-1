import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../core/auth/decorators';
import {
  AuditLogQueryDto,
  UpdateAiSettingsDto,
  UpdateDocumentSettingsDto,
  UpdateMediaSettingsDto,
} from './dto/settings.dto';
import { SettingsAdminService } from './settings-admin.service';

@ApiTags('admin/settings')
@Controller('admin/settings')
export class SettingsAdminController {
  constructor(private readonly settings: SettingsAdminService) {}

  @Get('media')
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'How uploaded images are stored' })
  async getMedia() {
    return this.settings.getMedia();
  }

  @Put('media')
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'Turn WebP conversion on or off for new uploads' })
  async updateMedia(@Body() dto: UpdateMediaSettingsDto) {
    return this.settings.updateMedia(dto.webpEnabled);
  }

  @Get('documents')
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'Document branding and number prefixes' })
  async getDocuments() {
    return this.settings.getDocuments();
  }

  @Put('documents')
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'Set the document logo and number prefixes' })
  async updateDocuments(@Body() dto: UpdateDocumentSettingsDto) {
    return this.settings.updateDocuments(dto);
  }

  @Get('ai')
  @RequirePermission('ai.view', 'ai.manage')
  @ApiOperation({ summary: 'Which AI providers/capabilities are on, this month\'s spend, and the budget cap' })
  async getAi() {
    return this.settings.getAi();
  }

  @Put('ai')
  @RequirePermission('ai.manage')
  @ApiOperation({ summary: 'Set the monthly AI budget cap and the USD-to-PKR rate used to estimate cost' })
  async updateAi(@Body() dto: UpdateAiSettingsDto) {
    return this.settings.updateAi(dto);
  }

  @Get('permissions')
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'The full permission catalog, grouped by category' })
  listPermissions() {
    return this.settings.listPermissions();
  }

  @Get('audit-log')
  @RequirePermission('audit.view')
  @ApiOperation({ summary: 'The audit trail, newest first, filterable by entity/actor/date' })
  listAuditLog(@Query() query: AuditLogQueryDto) {
    return this.settings.listAuditLog({
      entity: query.entity,
      actorId: query.actorId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page: query.page ?? 1,
      perPage: Math.min(query.perPage ?? 50, 200),
    });
  }
}
