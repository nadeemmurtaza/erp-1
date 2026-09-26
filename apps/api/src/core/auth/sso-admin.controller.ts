import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import type { AuthenticatedUser } from './auth.constants';
import { CurrentUser, RequirePermission, SessionOnly } from './decorators';
import { CreateSsoConnectionDto, UpdateSsoConnectionDto } from './dto/sso.dto';
import { SsoService } from './sso.service';

/**
 * Registering, editing and suspending single sign-on connections
 * (161-sso-identity-federation.md, WO-161.4/161.5), and the accounts that
 * signed in through each.
 *
 * `settings.sso.manage` is critical and non-delegatable: a connection's
 * allowed domains decide who may sign in, and link, every account at that
 * domain. `@SessionOnly()` besides — installing a client secret or
 * unlinking a sign-in identity changes how accounts authenticate, so no API
 * key reaches any of this, whatever it carries. Nothing here ever returns
 * the stored secret.
 */
@ApiTags('admin/sso')
@Controller('admin/sso')
@RequirePermission('settings.sso.manage')
@SessionOnly()
export class SsoAdminController {
  constructor(private readonly sso: SsoService) {}

  @Get('connections')
  @ApiOperation({ summary: 'Every single sign-on connection, and the callback URL to register — never a client secret' })
  list() {
    return this.sso.listConnections();
  }

  @Post('connections')
  @ApiOperation({ summary: 'Register an identity provider for staff sign-in' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSsoConnectionDto) {
    return this.sso.createConnection(dto, user.id);
  }

  @Get('connections/:id')
  @ApiOperation({ summary: 'One connection, with the callback URL to register at the provider' })
  get(@Param('id') id: string) {
    return this.sso.getConnection(id);
  }

  @Patch('connections/:id')
  @ApiOperation({ summary: 'Edit a connection — audited with every old and new value; a sent secret replaces the stored one' })
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateSsoConnectionDto) {
    return this.sso.updateConnection(id, dto, user.id);
  }

  @Post('connections/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop new sign-ins through a connection — accounts it created or linked are untouched' })
  suspend(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sso.suspendConnection(id, user.id);
  }

  @Get('connections/:id/accounts')
  @ApiOperation({ summary: 'Accounts provisioned or linked through a connection, newest first' })
  accounts(@Param('id') id: string, @Query() query: PaginationQueryDto) {
    return this.sso.listAccounts(id, query.page, query.pageSize);
  }

  @Post('connections/:id/accounts/:userId/unlink')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Unlink an account's single sign-on identity and sign it out everywhere" })
  async unlink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    await this.sso.unlinkAccount(id, userId, user.id);
  }

  @Get('roles')
  @ApiOperation({ summary: 'Roles a new sign-in could be given, and why any may not be' })
  roles() {
    return this.sso.defaultRoleOptions();
  }
}
