import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
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

  @Post()
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

  @Post(':id/reset-password')
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
