import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { CurrentUser, Public, RequirePermission } from '../../../core/auth/decorators';
import { CreateRedirectDto } from './dto/redirect.dto';
import { RedirectService } from './redirect.service';

/** WO-3.9 (03-variants-sku-seo.md) — Catalogue -> SEO & redirects. */
@ApiTags('admin/catalog')
@Controller('admin/catalog/redirects')
@RequirePermission('catalog.manage')
export class RedirectAdminController {
  constructor(private readonly redirects: RedirectService) {}

  @Get()
  @ApiOperation({ summary: 'Every redirect, newest first' })
  list() {
    return this.redirects.list();
  }

  @Post()
  @ApiOperation({ summary: 'Add a manual redirect' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRedirectDto) {
    return this.redirects.create(user.id, dto);
  }

  @Post('import')
  @ApiOperation({ summary: 'Bulk-import redirects from a CSV (from_path,to_path[,status_code])' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file'))
  importCsv(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: { buffer: Buffer },
  ) {
    return this.redirects.importCsv(user.id, file.buffer);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a redirect' })
  delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.redirects.delete(user.id, id);
  }
}

/**
 * Public, unauthenticated lookup for the storefront's own middleware
 * (apps/web/src/middleware.ts) — a redirect is public information (it's a
 * 301 response), and gating it behind auth would mean the till has to hold
 * an admin session just to render a 404 correctly.
 */
@ApiTags('catalog')
@Controller('catalog/redirects')
@Public()
export class RedirectLookupController {
  constructor(private readonly redirects: RedirectService) {}

  @Get('lookup')
  @ApiOperation({ summary: 'Whether a path now redirects somewhere else' })
  lookup(@Query('path') path: string) {
    return this.redirects.lookup(path);
  }
}
