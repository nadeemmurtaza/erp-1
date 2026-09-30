import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { CurrentUser, RequirePermission, SessionOnly } from '../../../core/auth/decorators';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto, UpdateUserPermissionsDto } from './dto/user.dto';
import { UsersAdminService } from './users-admin.service';

@ApiTags('admin/users')
@Controller('admin/users')
@RequirePermission('users.manage')
export class UsersAdminController {
  constructor(private readonly users: UsersAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Back-office users (STAFF/TAILOR/ADMIN)' })
  list() {
    return this.users.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'A user, their role defaults, overrides and effective permissions' })
  get(@Param('id') id: string) {
    return this.users.get(id);
  }

  // Issues a password. users.manage is already never in an API key; the
  // marker states the rule where the credential is minted (163 §2).
  @Post()
  @SessionOnly()
  @ApiOperation({ summary: 'Create a back-office user' })
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.users.create(actor.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a user — name, contact info, role, active status' })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(actor.id, id, dto);
  }

  @Put(':id/permissions')
  @ApiOperation({ summary: "Replace a user's permission overrides on top of their role" })
  updatePermissions(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserPermissionsDto,
  ) {
    return this.users.updatePermissions(actor.id, id, dto.overrides);
  }

  @Post(':id/roles/:roleId')
  @ApiOperation({ summary: 'Assign a custom Role to this user (owner\'s request — a user may hold several)' })
  assignRole(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Param('roleId') roleId: string,
  ) {
    return this.users.assignRole(actor.id, id, roleId);
  }

  @Delete(':id/roles/:roleId')
  @ApiOperation({ summary: 'Remove a Role from this user' })
  unassignRole(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Param('roleId') roleId: string,
  ) {
    return this.users.unassignRole(actor.id, id, roleId);
  }

  @Post(':id/reset-password')
  @SessionOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Set a user's password directly and sign them out everywhere" })
  resetPassword(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ): Promise<void> {
    return this.users.resetPassword(actor.id, id, dto.newPassword);
  }
}
