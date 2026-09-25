import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth.constants';
import { CurrentUser, RequirePermission, SessionOnly } from '../decorators';
import { ApiKeysService } from './api-keys.service';
import { ListApiKeysQueryDto } from './dto/api-key.dto';

/**
 * Oversight of every account's personal API keys — read and revoke only
 * (163-personal-api-keys.md §5). Gated by `users.manage`, whose holder can
 * already deactivate a back-office account outright, which revokes all its
 * keys; revoking one is strictly narrower. Nobody — the owner included — can
 * read a key's secret after it was issued, so neither route returns one.
 */
@ApiTags('admin/api-keys')
@Controller('admin/api-keys')
@RequirePermission('users.manage')
@SessionOnly()
export class ApiKeysAdminController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'Every API key on this deployment, by staff and customers — metadata only' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListApiKeysQueryDto) {
    return this.apiKeys.listAll(user, {
      surface: query.surface,
      status: query.status,
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Revoke anyone's API key — final; its next request is refused" })
  revoke(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.apiKeys.revokeAsAdministrator(user, id);
  }
}
