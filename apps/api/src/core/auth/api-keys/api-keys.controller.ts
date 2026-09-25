import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedUser } from '../auth.constants';
import { AuthenticatedOnly, CurrentUser, SessionOnly } from '../decorators';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto, ListMyApiKeysQueryDto, RotateApiKeyDto, UpdateApiKeyDto } from './dto/api-key.dto';

/**
 * Issuing a secret gets the same tight limit as the other credential
 * endpoints (AuthController's CREDENTIAL_THROTTLE: 10 a minute) rather than
 * the global 300 — enough for a person, not for a stolen session minting
 * keys in a loop.
 */
const KEY_ISSUE_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

/**
 * A signed-in person managing their own personal API keys, on either surface
 * (163-personal-api-keys.md §5). Every route scopes to `user.id` — nobody
 * reaches another person's key here; that is `admin/api-keys`, behind
 * `users.manage`.
 *
 * `@SessionOnly()` on the class: a key never manages keys. ApiKeysService
 * refuses a key principal again on its own, independently of this.
 */
@ApiTags('api-keys')
@Controller('api-keys')
@AuthenticatedOnly()
@SessionOnly()
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'Your own API keys for one surface, each with what it can do right now' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListMyApiKeysQueryDto) {
    return this.apiKeys.listMine(user, query.surface, query.page, query.pageSize);
  }

  @Throttle(KEY_ISSUE_THROTTLE)
  @Post()
  @ApiOperation({ summary: 'Create a key carrying some of your own access — its secret is shown in this response only' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateApiKeyDto) {
    return this.apiKeys.create(user, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: "Rename a key, or replace its scopes — re-checked against what you hold now" })
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateApiKeyDto) {
    return this.apiKeys.update(user, id, dto);
  }

  @Throttle(KEY_ISSUE_THROTTLE)
  @Post(':id/rotate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Issue a new secret and expiry for a key — same scopes; the old secret stops working at once' })
  rotate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RotateApiKeyDto) {
    return this.apiKeys.rotate(user, id, dto.expiresInDays);
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a key — final; its next request is refused' })
  revoke(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.apiKeys.revoke(user, id);
  }
}
