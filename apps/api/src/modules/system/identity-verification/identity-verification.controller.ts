import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { AuthenticatedOnly, CurrentUser, Public } from '../../../core/auth/decorators';
import { SubmitOtpDto } from './dto/submit-otp.dto';
import { IdentityVerificationService } from './identity-verification.service';

@ApiTags('identity-verification')
@Controller('identity-verification')
export class IdentityVerificationController {
  constructor(private readonly service: IdentityVerificationService) {}

  @Post('start')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Start (or restart, after a rejection/expiry) identity verification' })
  start(@CurrentUser() user: AuthenticatedUser) {
    return this.service.start(user.id);
  }

  @Post('otp/submit')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Submit the one-time code received during verification' })
  submitOtp(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitOtpDto) {
    return this.service.submitOtp(user.id, dto.code);
  }

  @Get('me')
  @AuthenticatedOnly()
  @ApiOperation({ summary: "The current account's identity-verification status" })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.service.status(user.id);
  }

  /**
   * nID posts here when a case resolves. Public because nID's servers call
   * it, not a logged-in user — authenticity comes from the signature the
   * service verifies, not a session. Reads `req.rawBody` (see main.ts's
   * `rawBody: true`) rather than the parsed body, because the signature is
   * over the exact bytes nID sent.
   */
  @Public()
  @Post('webhook')
  @ApiOperation({ summary: 'nID verification-result callback (signature-verified, not session-authenticated)' })
  webhook(@Req() req: RawBodyRequest<Request>) {
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    return this.service.handleWebhook(rawBody, req.headers);
  }
}
