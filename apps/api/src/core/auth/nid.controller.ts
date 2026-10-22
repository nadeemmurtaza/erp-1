import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { setRefreshCookie } from './auth.controller';
import { Public } from './decorators';
import { NidProvider } from './providers/nid.provider';

/**
 * nID Single Sign-On Controller (ECOSYSTEM.md, WO-255.2).
 *
 * Implements the browser and client OAuth flow with nID:
 * 1. GET /auth/nid/start -> returns { authorizeUrl, pollToken, state } or redirects.
 * 2. GET /auth/nid/callback?code=...&state=... -> exchanges code for session.
 */
@ApiTags('auth')
@Controller('auth/nid')
export class NidController {
  private readonly logger = new Logger(NidController.name);

  constructor(private readonly nidProvider: NidProvider) {}

  @Public()
  @Get('start')
  @ApiOperation({ summary: 'Initiates a Login with nID authorization flow' })
  async startLogin(
    @Query('redirectUri') redirectUri?: string,
    @Query('redirect') redirect?: string,
    @Res() res?: Response,
  ) {
    const result = await this.nidProvider.startLogin(redirectUri);

    if (redirect === 'true' && res) {
      return res.redirect(result.authorizeUrl);
    }

    if (res) {
      return res.status(HttpStatus.OK).json(result);
    }
    return result;
  }

  @Public()
  @Get('callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handles the OAuth authorization callback from nID' })
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('redirectUri') redirectUri?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const session = await this.nidProvider.handleCallback(code, state, redirectUri);

    if (res) {
      setRefreshCookie(res, session.refreshToken);
    }

    return session;
  }
}
