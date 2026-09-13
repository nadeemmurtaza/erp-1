import { BadRequestException, Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { USER_ROLES, type UserRole } from '@newax/shared';
import { RequirePermission } from '../../core/auth/decorators';
import {
  AuditLogQueryDto,
  UpdateDocumentSettingsDto,
  UpdateMediaSettingsDto,
  UpdateRolePermissionsDto,
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

  @Get('permissions')
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'The full permission catalog, grouped by category' })
  listPermissions() {
    return this.settings.listPermissions();
  }

  @Get('roles')
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: "Every role and its currently granted permissions" })
  listRoles() {
    return this.settings.listRoles();
  }

  @Put('roles/:role/permissions')
  @RequirePermission('roles.manage_permissions')
  @ApiOperation({ summary: "Replace a role's granted permissions" })
  updateRolePermissions(@Param('role') role: string, @Body() dto: UpdateRolePermissionsDto) {
    if (!USER_ROLES.includes(role as UserRole)) {
      throw new BadRequestException(`"${role}" is not a role.`);
    }
    return this.settings.updateRolePermissions(role as UserRole, dto.permissionKeys);
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
