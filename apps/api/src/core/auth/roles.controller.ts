import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from './decorators';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

/**
 * Custom roles (owner's request) — create, edit, delete a named permission
 * bundle, freely, without a deploy. `roles.manage_permissions` gates all of
 * it, the same locked permission that already gated the old fixed-role
 * editor at /admin/settings, which this replaces.
 */
@ApiTags('admin/roles')
@Controller('admin/roles')
@RequirePermission('roles.manage_permissions')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @ApiOperation({ summary: 'Every custom role, its permissions, and how many users hold it' })
  list() {
    return this.roles.list();
  }

  @Post()
  @ApiOperation({ summary: 'Create a role. Duplicate names are refused; a duplicate permission set is only flagged.' })
  create(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: "Edit a role's name, description, or permission set" })
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a role — refused if it would leave a critical permission held by nobody' })
  async delete(@Param('id') id: string) {
    await this.roles.delete(id);
    return { deleted: true };
  }
}
