import { BadRequestException, Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { USER_ROLES, type UserRole } from '@yaseen/shared';
import { RequirePermission } from '../../core/auth/decorators';
import { AuditLogQueryDto, UpdateRolePermissionsDto } from './dto/settings.dto';
import { SettingsAdminService } from './settings-admin.service';

@ApiTags('admin/settings')
@Controller('admin/settings')
export class SettingsAdminController {
  constructor(private readonly settings: SettingsAdminService) {}

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
