import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { decryptSecret, encryptSecret } from '@newax/shared/secret-crypto';
import type { Request, Response } from 'express';
import { AppConfigService } from '../config/app-config.service';
import {
  SSO_HANDOFF_COOKIE,
  SSO_HANDOFF_TTL_MS,
  SSO_STATE_COOKIE,
  SSO_STATE_TTL_MS,
} from './auth.constants';
import { CREDENTIAL_THROTTLE, setRefreshCookie } from './auth.controller';
import { AuthService, type AuthResult } from './auth.service';
import { Public } from './decorators';
import { readSsoCallbackQuery } from './dto/sso.dto';
import { SSO_SIGN_IN_FAILED, SsoSignInRefused, type SsoFlowSecrets } from './identity-provider';
import { SsoService, ssoCookiePath } from './sso.service';

/** What the state cookie carries from /start to /callback. */
interface SealedFlow extends SsoFlowSecrets {
  connectionId: string;
}

/** Where the admin app finishes, or explains, a single sign-on. */
const ADMIN_SSO_COMPLETE_PATH = '/admin/login/sso-complete';
const ADMIN_SSO_FAILED_PATH = '/admin/login?sso=failed';

/**
 * Single sign-on, the browser half (161-sso-identity-federation.md).
 *
 * `start` and `callback` are top-level navigations, not API calls: each ends
 * in a redirect — to the identity provider, to the admin app, or on any
 * failure to the admin sign-in page with `?sso=failed` — never in a JSON
 * error page a person is stranded on. Which check refused a sign-in is
 * logged for the operator; the browser only learns that it failed.
 *
 * No token ever travels in a URL. The callback seals the session it issued
 * into a two-minute, httpOnly cookie scoped to these routes, and the admin
 * app redeems it once through `POST /auth/sso/session` — which returns the
 * same AuthResult a password sign-in does.
 */
@ApiTags('auth')
@Controller('auth/sso')
export class SsoController {
  private readonly logger = new Logger(SsoController.name);

  constructor(
    private readonly sso: SsoService,
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Get('connections')
  @ApiOperation({ summary: 'The single sign-on buttons the admin sign-in screen shows — id and label only' })
  signInOptions() {
    return this.sso.listSignInOptions();
  }

  @Throttle(CREDENTIAL_THROTTLE)
  @Public()
  @Get(':connectionId/start')
  @ApiOperation({ summary: 'Begin single sign-on — redirects to the identity provider' })
  async start(@Param('connectionId') connectionId: string, @Res() response: Response): Promise<void> {
    try {
      const { authorizationUrl, state, nonce, codeVerifier } = await this.sso.startLogin(connectionId);
      this.writeSealed<SealedFlow>(response, SSO_STATE_COOKIE, { connectionId, state, nonce, codeVerifier }, SSO_STATE_TTL_MS);
      response.redirect(HttpStatus.FOUND, authorizationUrl);
    } catch (error) {
      this.fail(response, 'start', connectionId, error);
    }
  }

  @Throttle(CREDENTIAL_THROTTLE)
  @Public()
  @Get('callback')
  @ApiOperation({ summary: 'Where the identity provider returns — completes single sign-on and redirects to the admin app' })
  async callback(
    // Not a DTO on purpose — see readSsoCallbackQuery().
    @Query() query: Record<string, unknown>,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const flow = this.readSealed(request, SSO_STATE_COOKIE, isSealedFlow);
    // Single use, whatever happens next.
    this.clearSealed(response, SSO_STATE_COOKIE);

    try {
      if (!flow) {
        throw new SsoSignInRefused('no sign-in was started in this browser, or it expired');
      }

      const answer = readSsoCallbackQuery(query);
      if (answer.outcome === 'error') {
        throw new SsoSignInRefused(
          `connection ${flow.connectionId}: the identity provider answered "${logSafe(answer.error)}"`,
        );
      }

      const result = await this.sso.completeLogin(flow.connectionId, answer.params, flow);
      this.writeSealed(response, SSO_HANDOFF_COOKIE, { refreshToken: result.refreshToken }, SSO_HANDOFF_TTL_MS);
      response.redirect(HttpStatus.FOUND, this.adminUrl(ADMIN_SSO_COMPLETE_PATH));
    } catch (error) {
      this.fail(response, 'callback', flow?.connectionId ?? 'none', error);
    }
  }

  /**
   * Redeems the session the callback just issued — once. The admin app
   * calls it from `/admin/login/sso-complete`; a visit there that did not
   * come from a callback finds no handoff cookie and gets a 401, touching
   * no other session.
   */
  @Throttle(CREDENTIAL_THROTTLE)
  @Public()
  @Post('session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a completed single sign-on for a session — the same result a password sign-in returns' })
  async session(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<AuthResult> {
    const handoff = this.readSealed(request, SSO_HANDOFF_COOKIE, isHandoff);
    this.clearSealed(response, SSO_HANDOFF_COOKIE);
    if (!handoff) {
      throw new UnauthorizedException(SSO_SIGN_IN_FAILED);
    }

    // Rotates the just-issued refresh token and re-checks the account is
    // still active — the ordinary refresh path, nothing SSO-specific, except
    // that the handoff redeems once: no 10-second grace replay (doc 206 §2.2
    // scopes that to POST /auth/refresh), so a second redemption is refused
    // even when it races the first.
    const result = await this.auth.refresh(handoff.refreshToken, { ip: request.ip }, { singleUse: true });
    setRefreshCookie(response, result.refreshToken, this.config);
    return result;
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  private fail(response: Response, step: 'start' | 'callback', connectionId: string, error: unknown): void {
    const where = `Single sign-on ${step} (connection ${logSafe(connectionId)})`;
    if (error instanceof SsoSignInRefused) {
      this.logger.warn(`${where} refused: ${error.detail}`);
    } else if (error instanceof HttpException) {
      this.logger.warn(`${where} refused: ${error.message}`);
    } else {
      this.logger.error(
        `${where} failed: ${error instanceof Error ? error.name : 'unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
    response.redirect(HttpStatus.FOUND, this.adminUrl(ADMIN_SSO_FAILED_PATH));
  }

  /** The admin app is served by the storefront's web app, under /admin. */
  private adminUrl(path: string): string {
    return `${this.config.get('STOREFRONT_URL').replace(/\/+$/, '')}${path}`;
  }

  private writeSealed<T extends object>(response: Response, name: string, payload: T, ttlMs: number): void {
    const sealed = encryptSecret(JSON.stringify({ ...payload, expiresAt: Date.now() + ttlMs }), this.encryptionKey());
    response.cookie(name, sealed, { ...this.cookieOptions(), maxAge: ttlMs });
  }

  /** The sealed value, or null when it is missing, forged, tampered with, malformed or past its own expiry. */
  private readSealed<T>(request: Request, name: string, isShape: (value: unknown) => value is T): T | null {
    const raw: unknown = request.cookies?.[name];
    if (typeof raw !== 'string' || raw.length === 0) return null;
    try {
      const value: unknown = JSON.parse(decryptSecret(raw, this.encryptionKey()));
      if (!value || typeof value !== 'object') return null;
      const expiresAt = (value as { expiresAt?: unknown }).expiresAt;
      if (typeof expiresAt !== 'number' || expiresAt < Date.now()) return null;
      return isShape(value) ? value : null;
    } catch {
      return null;
    }
  }

  private clearSealed(response: Response, name: string): void {
    response.clearCookie(name, this.cookieOptions());
  }

  /** Mirrors setRefreshCookie()'s options, scoped to these routes only. */
  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.config.isProduction,
      path: ssoCookiePath(this.config),
    };
  }

  private encryptionKey(): string {
    return this.config.get('APP_ENCRYPTION_KEY');
  }
}

function isSealedFlow(value: unknown): value is SealedFlow {
  const flow = value as Partial<SealedFlow>;
  return (
    typeof flow.connectionId === 'string' &&
    typeof flow.state === 'string' &&
    typeof flow.nonce === 'string' &&
    typeof flow.codeVerifier === 'string'
  );
}

function isHandoff(value: unknown): value is { refreshToken: string } {
  const handoff = value as { refreshToken?: unknown };
  return typeof handoff.refreshToken === 'string' && handoff.refreshToken.length > 0;
}

/** A value from the request, fit for one log line — no newlines, nothing long. */
function logSafe(value: string): string {
  return value.replace(/[^\w.-]/g, '').slice(0, 64) || '(unprintable)';
}
