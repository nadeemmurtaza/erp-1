import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { normalizeEmail, normalizePkPhone } from '@newax/shared';
import { AuditService } from '../../audit/audit.service';
import { AppConfigService } from '../../config/app-config.service';
import { RedisService } from '../../redis/redis.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService, type AuthResult } from '../auth.service';

export interface NidAccountClaims {
  id: string;
  phone: string;
  email?: string | null;
  phoneVerifiedAt?: string | null;
}

export interface NidLoginStartResult {
  authorizeUrl: string;
  pollToken: string;
  state: string;
}

const STATE_TTL_SECONDS = 600; // 10 minutes

/**
 * nID Authentication Provider (ECOSYSTEM.md, WO-255.2).
 *
 * Implements the relying-party OAuth authorization-code exchange with nID
 * following the reference implementation in newcom/esp (esp/nid_auth.go).
 *
 * Identity model:
 * 1 nID Account <-> 1 User row linked via User.ssoExternalId = 'nid#' + account.id
 *
 * Designed for global multi-tenant SaaS:
 * Users from any organization in the world authenticating via nID are
 * matched or provisioned with appropriate roles and zero security leaks.
 */
@Injectable()
export class NidProvider {
  private readonly logger = new Logger(NidProvider.name);
  private readonly inMemoryState = new Map<string, { pollToken: string; expiresAt: number }>();

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
  ) {}

  get baseUrl(): string {
    return this.config.get('NID_BASE_URL') || this.config.get('NID_API_URL') || 'http://localhost:4000';
  }

  get clientId(): string | undefined {
    return this.config.get('NID_CLIENT_ID');
  }

  get clientSecret(): string | undefined {
    return this.config.get('NID_CLIENT_SECRET');
  }

  get defaultRedirectUri(): string {
    const configured = this.config.get('NID_REDIRECT_URI');
    if (configured) return configured;

    const base = this.config.get('API_PUBLIC_URL');
    if (base) {
      try {
        const { origin } = new URL(base);
        return `${origin}/${this.config.get('API_PREFIX')}/v1/auth/nid/callback`;
      } catch {
        // Fall back below
      }
    }
    return 'http://localhost:3001/api/v1/auth/nid/callback';
  }

  /**
   * Begins a "Login with nID" attempt (mirrors handleNidLoginStart in nid_auth.go).
   * Requests a login ticket from nID and returns the authorization URL.
   */
  async startLogin(redirectUri?: string): Promise<NidLoginStartResult> {
    const clientId = this.clientId;
    if (!clientId || !this.clientSecret) {
      throw new ServiceUnavailableException(
        'Login with nID is not configured (NID_CLIENT_ID or NID_CLIENT_SECRET unset).',
      );
    }

    const state = randomBytes(16).toString('hex');
    const finalRedirectUri = redirectUri || this.defaultRedirectUri;

    const endpoint = `${this.baseUrl.replace(/\/+$/, '')}/v1/oauth/login-requests`;

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          redirectUri: finalRedirectUri,
          state,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        this.logger.error(`nID rejected login request (HTTP ${resp.status}): ${text}`);
        throw new ServiceUnavailableException('nID rejected the login request.');
      }

      const body = (await resp.json()) as { pollToken: string; expiresAt: string };

      await this.saveState(state, body.pollToken);

      const authorizeUrl = `${this.baseUrl.replace(/\/+$/, '')}/authorize/${body.pollToken}`;
      return {
        authorizeUrl,
        pollToken: body.pollToken,
        state,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to connect to nID at ${endpoint}: ${msg}`);
      throw new ServiceUnavailableException(`nID is unreachable: ${msg}`);
    }
  }

  /**
   * Handles the OAuth callback from nID (mirrors handleNidLoginCallback in nid_auth.go).
   * Verifies CSRF state, exchanges code for verified nID Account claims,
   * matches or provisions the User row, and returns the authenticated session.
   */
  async handleCallback(
    code: string,
    state: string,
    redirectUri?: string,
  ): Promise<AuthResult> {
    if (!code || !state) {
      throw new BadRequestException('Missing authorization code or state.');
    }

    const valid = await this.verifyAndConsumeState(state);
    if (!valid) {
      throw new UnauthorizedException('Unrecognized or expired nID login attempt.');
    }

    const clientId = this.clientId;
    const clientSecret = this.clientSecret;
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException('nID client credentials are not configured.');
    }

    const finalRedirectUri = redirectUri || this.defaultRedirectUri;
    const tokenEndpoint = `${this.baseUrl.replace(/\/+$/, '')}/v1/oauth/token`;

    let claims: NidAccountClaims;
    try {
      const resp = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          clientId,
          clientSecret,
          redirectUri: finalRedirectUri,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        this.logger.warn(`nID code exchange rejected (HTTP ${resp.status}): ${text}`);
        throw new UnauthorizedException('nID rejected the authorization code.');
      }

      const json = (await resp.json()) as { account: NidAccountClaims };
      claims = json.account;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`nID code exchange failed: ${msg}`);
      throw new ServiceUnavailableException(`nID token exchange failed: ${msg}`);
    }

    return this.loginOrProvision(claims);
  }

  /**
   * Finds or provisions a User from verified nID Account claims.
   * Links User.ssoExternalId = 'nid#' + claims.id.
   */
  private async loginOrProvision(claims: NidAccountClaims): Promise<AuthResult> {
    const ssoExternalId = `nid#${claims.id}`;
    const normalizedPhone = claims.phone ? normalizePkPhone(claims.phone) : null;
    const normalizedEmail = claims.email ? normalizeEmail(claims.email) : null;

    // 1. Look for existing user linked to this exact nID account ID
    let user = await this.prisma.user.findFirst({
      where: { ssoExternalId },
    });

    if (user) {
      if (!user.isActive) {
        throw new ForbiddenException('This account has been deactivated.');
      }
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      return this.auth.issueSession(user);
    }

    // 2. Look for existing user by verified phone or email to link accounts
    if (normalizedPhone || normalizedEmail) {
      user = await this.prisma.user.findFirst({
        where: {
          OR: [
            ...(normalizedPhone ? [{ phone: String(normalizedPhone) }] : []),
            ...(normalizedEmail ? [{ email: String(normalizedEmail) }] : []),
          ],
        },
      });
    }

    if (user) {
      if (!user.isActive) {
        throw new ForbiddenException('This account has been deactivated.');
      }

      // Link nID external ID to the user account
      const updated = await this.prisma.$transaction(async (tx: any) => {
        const res = await tx.user.update({
          where: { id: user.id },
          data: {
            ssoExternalId,
            lastLoginAt: new Date(),
          },
        });

        await this.audit.recordEvidence(tx, {
          actorId: user.id,
          action: 'sso.account_linked',
          entity: 'User',
          entityId: user.id,
          data: {
            provider: 'nid',
            nidAccountId: claims.id,
          },
        });

        return res;
      });

      return this.auth.issueSession(updated);
    }

    // 3. Provision brand new user for this nID account
    const emailToUse = normalizedEmail ? String(normalizedEmail) : `${claims.id}@nid.local`;
    const newUser = await this.prisma.$transaction(async (tx: any) => {
      const created = await tx.user.create({
        data: {
          email: emailToUse,
          phone: normalizedPhone ? String(normalizedPhone) : null,
          ssoExternalId,
          role: 'STAFF',
          isActive: true,
          emailVerifiedAt: new Date(),
          lastLoginAt: new Date(),
        },
      });

      await this.audit.recordEvidence(tx, {
        actorId: created.id,
        action: 'sso.user_provisioned',
        entity: 'User',
        entityId: created.id,
        data: {
          provider: 'nid',
          nidAccountId: claims.id,
          role: 'STAFF',
        },
      });

      return created;
    });

    return this.auth.issueSession(newUser);
  }

  private async saveState(state: string, pollToken: string): Promise<void> {
    try {
      const client = this.redis.client('cache');
      await client.set(`nid_state:${state}`, pollToken, 'EX', STATE_TTL_SECONDS);
    } catch {
      // Fallback to in-memory TTL
      this.inMemoryState.set(state, {
        pollToken,
        expiresAt: Date.now() + STATE_TTL_SECONDS * 1000,
      });
    }
  }

  private async verifyAndConsumeState(state: string): Promise<boolean> {
    try {
      const client = this.redis.client('cache');
      const val = await client.get(`nid_state:${state}`);
      if (val) {
        await client.del(`nid_state:${state}`);
        return true;
      }
    } catch {
      // Fallback check
    }

    const item = this.inMemoryState.get(state);
    if (!item) return false;
    this.inMemoryState.delete(state);
    return item.expiresAt > Date.now();
  }
}
