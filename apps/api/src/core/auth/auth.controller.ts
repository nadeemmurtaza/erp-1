import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, parseDuration } from './auth.service';
import { AppConfigService } from '../config/app-config.service';
import {
  LEGACY_REFRESH_COOKIE,
  REFRESH_COOKIE,
  readCookie,
  type AuthenticatedUser,
} from './auth.constants';
import {
  AuditRateLimit,
  AuthenticatedOnly,
  CurrentUser,
  CustomerScope,
  Public,
  RequirePermission,
  SessionOnly,
} from './decorators';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateProfileDto,
  VerifyEmailDto,
} from './dto/auth.dto';

/**
 * Credential endpoints are rate limited far tighter than the global 300/min,
 * which on a login form is 18,000 password guesses an hour from one address.
 * These are the only routes where an attacker gets to guess a secret.
 * Exported for sso.controller.ts, whose sign-in routes take the same limit.
 */
export const CREDENTIAL_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

/** The refresh-token cookie every sign-in path writes — password here, single sign-on in sso.controller.ts. */
export function setRefreshCookie(response: Response, token: string, config: AppConfigService): void {
  response.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: parseDuration(config.get('JWT_REFRESH_TTL')),
  });
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  @Throttle(CREDENTIAL_THROTTLE)
  @AuditRateLimit('email')
  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create a customer account' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.register(dto);
    this.setRefreshCookie(response, result.refreshToken);
    return result;
  }

  /**
   * Two limits stand in front of a password guess (206-rate-limiting-caching-compression-hardening.md
   * §1): CREDENTIAL_THROTTLE per client IP, then — inside AuthService.login()
   * — a 5-attempt, one-per-5-minutes bucket per identifier, which a guesser
   * spreading attempts over many addresses cannot step around. Either answers
   * 429 with a Retry-After; either one's refusals are audited.
   */
  @Throttle(CREDENTIAL_THROTTLE)
  @AuditRateLimit('identifier')
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with an email or phone number' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(dto.identifier, dto.password, { ip: request.ip });
    this.setRefreshCookie(response, result.refreshToken);
    return result;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new access token' })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token =
      dto.refreshToken ?? readCookie(request.cookies, REFRESH_COOKIE, LEGACY_REFRESH_COOKIE);
    if (!token) {
      throw new UnauthorizedException('No refresh token was supplied.');
    }

    const result = await this.auth.refresh(token, { ip: request.ip });
    this.setRefreshCookie(response, result.refreshToken);
    return result;
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current refresh token' })
  async logout(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(
      dto.refreshToken ?? readCookie(request.cookies, REFRESH_COOKIE, LEGACY_REFRESH_COOKIE),
    );
    response.clearCookie(REFRESH_COOKIE, { path: '/' });
    // Signing out has to clear the pre-rename cookie too, or the next refresh
    // would revive the session from it.
    response.clearCookie(LEGACY_REFRESH_COOKIE, { path: '/' });
  }

  @AuthenticatedOnly()
  @CustomerScope('profile:read')
  @Get('me')
  @ApiOperation({ summary: 'The signed-in user' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });
  }

  // The email and phone are the sign-in and password-reset identity:
  // changing either through a key would be account takeover.
  @AuthenticatedOnly()
  @SessionOnly()
  @Patch('me')
  @ApiOperation({ summary: 'Update your own profile fields' })
  updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto);
  }

  @Throttle(CREDENTIAL_THROTTLE)
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('account.change_own_password')
  @SessionOnly()
  @ApiOperation({ summary: 'Change your password and sign out other devices' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  @Throttle(CREDENTIAL_THROTTLE)
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Request a password reset link by email' })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.auth.requestPasswordReset(dto.email);
  }

  @Throttle(CREDENTIAL_THROTTLE)
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Set a new password using a reset link token' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto.token, dto.newPassword);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Confirm an email address using a verification link token' })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
    await this.auth.verifyEmail(dto.token);
  }

  @Throttle(CREDENTIAL_THROTTLE)
  @AuthenticatedOnly()
  @Post('resend-verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Resend the email verification link' })
  async resendVerification(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.auth.requestEmailVerification(user.id);
  }

  private setRefreshCookie(response: Response, token: string): void {
    setRefreshCookie(response, token, this.config);
  }
}
