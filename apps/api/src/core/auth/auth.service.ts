import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { normalizeEmail, normalizePkPhone } from '@newax/shared';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config/app-config.service';
import { EventBusService } from '../events/event-bus.service';
import { DomainEvent } from '../events/domain-events';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma, RefreshToken, User } from '../prisma/client';
import type { AuthenticatedUser, JwtPayload } from './auth.constants';
import { LoginThrottleService } from './login-throttle.service';
import { hashPassword, verifyPassword } from './password.util';
import { PermissionsResolverService } from './permissions.service';
import { RolesService } from './roles.service';

/**
 * doc 206 §2.2 (WO-206.3): a rotated refresh token presented again within
 * 10 s of its own rotation is a race — two tabs, a retried request — and is
 * answered with the very pair the first rotation issued. 10 s covers a real
 * race (they resolve in low single-digit seconds) while giving a token
 * replayed minutes or hours after theft nothing.
 */
export const REFRESH_REUSE_GRACE_MS = 10_000;

export const REFRESH_REUSE_DETECTED_AUDIT_ACTION = 'auth.refresh_reuse_detected';

/** Domain separation for successorOf()'s HMAC: the refresh secret derives nothing else under this label. */
const REFRESH_ROTATION_LABEL = 'newax.refresh-rotation.v1';

/**
 * pg_advisory_xact_lock namespace for one refresh-token family (the 8_241_1xx
 * range the numbering locks already use). Rotation and family revocation both
 * take it, so they serialise: a revocation that waited behind a rotation then
 * reads with a fresh snapshot and sees the successor that rotation created —
 * without it, READ COMMITTED would let that successor slip past the
 * revocation, left live in the hands of whoever rotated.
 */
export const REFRESH_FAMILY_LOCK_NAMESPACE = 8_241_160;

const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';

/** Where a session request came from — for the audit trail only, never for a decision. */
export interface SessionRequestContext {
  /** Express's client address (main.ts trusts exactly one proxy hop). */
  ip?: string | null;
}

export interface RefreshOptions {
  /**
   * The token may be exchanged exactly once: a second presentation inside the
   * grace window is refused (401) instead of replayed; outside it, it is
   * reuse like any other. For a credential redeemed once by design — the
   * single sign-on handoff (161-sso-identity-federation.md) — rather than a
   * session refreshing itself, where the window (doc 206 §2.2, which scopes
   * it to `POST /auth/refresh`) is what keeps racing tabs signed in.
   */
  singleUse?: boolean;
}

type StoredRefreshToken = RefreshToken & { user: User };

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface AuthResult extends AuthTokens {
  user: AuthenticatedUser & { firstName: string | null; lastName: string | null };
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  /** Empty string clears the phone number. */
  phone?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly events: EventBusService,
    private readonly permissions: PermissionsResolverService,
    private readonly roles: RolesService,
    private readonly loginThrottle: LoginThrottleService,
    private readonly audit: AuditService,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    if (!email) {
      throw new ConflictException('A valid email address is required.');
    }

    const phone = input.phone ? normalizePkPhone(input.phone).e164 : null;
    if (input.phone && !phone) {
      throw new ConflictException('That phone number is not a valid number.');
    }

    const clash = await this.prisma.user.findFirst({
      where: { OR: [{ email }, ...(phone ? [{ phone }] : [])] },
      select: { id: true, email: true },
    });
    if (clash) {
      throw new ConflictException(
        clash.email === email
          ? 'An account with this email already exists.'
          : 'An account with this phone number already exists.',
      );
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        phone,
        passwordHash: await hashPassword(input.password),
        firstName: input.firstName?.trim() || null,
        lastName: input.lastName?.trim() || null,
        // The enum column stays, for display and as the seed's migration
        // source (core.prisma) — but what actually grants this account any
        // permission is the Role assignment below, not this value.
        role: 'CUSTOMER',
      },
    });

    // Best-effort: if a super admin has since renamed or removed the
    // "Customer" role, a new signup simply gets none — a storefront account
    // needs no admin capability to place an order, so this degrades safely
    // rather than blocking registration on a role that may not exist.
    await this.roles.assignByNameIfExists(user.id, 'Customer');

    // The CRM subscribes to this and creates (or merges into) a Contact.
    await this.events.publish(DomainEvent.UserRegistered, {
      userId: user.id,
      email: user.email,
      phone: user.phone,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || email,
    });

    await this.requestEmailVerification(user.id);

    return this.issue(user);
  }

  async login(identifier: string, password: string, context: SessionRequestContext = {}): Promise<AuthResult> {
    // WO-206.2: the per-account bucket, spent before the account is even
    // looked up — a refused attempt costs no query and no bcrypt round, and
    // is refused identically whether or not the account exists. 429 when the
    // identifier has no attempts left, 503 when Redis cannot say.
    await this.loginThrottle.consume(identifier, context);

    // Customers sign in with either their email or their phone number.
    const email = normalizeEmail(identifier);
    const phone = normalizePkPhone(identifier).e164;

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
      },
    });

    // Compare against a dummy hash when the user does not exist so that a
    // missing account and a wrong password take the same time to answer.
    const passwordHash = user?.passwordHash ?? DUMMY_HASH;
    const ok = await verifyPassword(password, passwordHash);

    if (!user || !ok) {
      throw new UnauthorizedException('Incorrect email/phone or password.');
    }
    // doc 206 §1.2: a correct password refills the bucket, before anything
    // else is decided — earlier typos are not carried into the next session.
    await this.loginThrottle.reset(identifier);
    if (!user.isActive) {
      throw new UnauthorizedException('This account has been deactivated.');
    }
    // WO-165.6 (165-cross-tenant-marketplace-directory.md §3, piece one):
    // a staff/tailor/admin account is refused password sign-in once any
    // active SsoConnection enforces SSO — a plain CUSTOMER is never
    // affected, since this column exists to move STAFF sign-in onto SSO,
    // not to gate storefront login. The one exception is whichever admin
    // enabled enforcement (SsoConnection.createdByUserId): they can always
    // undo their own change without being locked out by it.
    if (user.role !== 'CUSTOMER') {
      const enforced = await this.prisma.ssoConnection.findFirst({
        where: { status: 'ACTIVE', enforceSso: true, createdByUserId: { not: user.id } },
        select: { label: true },
      });
      if (enforced) {
        throw new UnauthorizedException(`Password sign-in is disabled for staff accounts. Use "Sign in with ${enforced.label}" instead.`);
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issue(user);
  }

  /**
   * Rotates a refresh token: the presented one is spent, a successor issued
   * in its family (WO-206.3, 206-rate-limiting-caching-compression-hardening.md §2.2).
   *
   * A token that was already rotated is one of two things. Within
   * REFRESH_REUSE_GRACE_MS of its rotation it is a race (two tabs, a retried
   * request) and gets back the same token pair the first rotation issued —
   * so neither racer is signed out. Later than that it is reuse: the token is
   * in two places at once, so its whole family is revoked and one
   * `auth.refresh_reuse_detected` audit row is written.
   */
  async refresh(
    refreshToken: string,
    context: SessionRequestContext = {},
    options: RefreshOptions = {},
  ): Promise<AuthResult> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });

    if (!stored) {
      throw new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
    }
    if (stored.rotatedAt) {
      return this.answerRotatedToken(stored, stored.rotatedAt, refreshToken, context, options);
    }
    if (stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
    }
    if (!stored.user.isActive) {
      throw new UnauthorizedException('This account has been deactivated.');
    }

    const rotatedAt = new Date();
    const successorToken = this.successorOf(refreshToken);
    const rotated = await this.prisma.$transaction(async (tx) => {
      await lockRefreshFamily(tx, stored.familyId);
      // Predicate-on-write: two requests racing with one token both pass the
      // checks above, and are serialised here — the second re-evaluates
      // `rotatedAt: null` after the first commits, finds it false, and is
      // answered as the race it is below.
      const claimed = await tx.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null, rotatedAt: null },
        data: { revokedAt: rotatedAt, rotatedAt },
      });
      if (claimed.count === 0) return false;

      const successor = await tx.refreshToken.create({
        data: {
          userId: stored.userId,
          tokenHash: hashToken(successorToken),
          familyId: stored.familyId,
          expiresAt: new Date(rotatedAt.getTime() + parseDuration(this.config.get('JWT_REFRESH_TTL'))),
        },
      });
      await tx.refreshToken.update({ where: { id: stored.id }, data: { replacedById: successor.id } });
      return true;
    });

    if (!rotated) {
      const current = await this.prisma.refreshToken.findUnique({
        where: { id: stored.id },
        include: { user: true },
      });
      if (current?.rotatedAt) {
        return this.answerRotatedToken(current, current.rotatedAt, refreshToken, context, options);
      }
      // Revoked some other way in between (a logout in another tab).
      throw new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
    }

    return this.issue(stored.user, { refreshToken: successorToken, issuedAt: rotatedAt });
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Your current password is incorrect.');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await hashPassword(newPassword) },
      }),
      // Changing a password signs out every other device.
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    // The confirmation mail: the one signal a customer has if this change
    // was not theirs, and their password was already checked above, so a
    // stolen session cannot silently lock them out of noticing.
    await this.events.publish(DomainEvent.PasswordChanged, { userId });
  }

  /**
   * Starts a password-reset flow. Always resolves the same way whether or
   * not the address belongs to an account — the caller gets no signal
   * either way, which is what stops this endpoint enumerating registered
   * emails.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const normalized = normalizeEmail(email);
    if (!normalized) return;

    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user || !user.isActive) return;

    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + parseDuration('1h')),
      },
    });

    await this.events.publish(DomainEvent.PasswordResetRequested, { userId: user.id, token });
  }

  /** Consumes a password-reset token minted by requestPasswordReset. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });

    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('This password reset link is invalid or has expired.');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: stored.userId },
        data: { passwordHash: await hashPassword(newPassword) },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      // A password reset is proof of mailbox access, not proof every existing
      // session was theirs — sign out everywhere, same as changePassword.
      this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.events.publish(DomainEvent.PasswordChanged, { userId: stored.userId });
  }

  /**
   * Mints and mails a fresh email-verification link. Called once from
   * register(), and again whenever the customer asks to resend it — a
   * verified address or one with no mailbox on file is left alone.
   */
  async requestEmailVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.email || user.emailVerifiedAt) return;

    const token = randomBytes(32).toString('base64url');
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + parseDuration('24h')),
      },
    });

    await this.events.publish(DomainEvent.EmailVerificationRequested, {
      userId: user.id,
      token,
    });
  }

  /** Consumes an email-verification token minted by requestEmailVerification. */
  async verifyEmail(token: string): Promise<void> {
    const stored = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });

    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('This verification link is invalid or has expired.');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: stored.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
    ]);
  }

  /** Updates the signed-in user's own profile fields. Returns the same shape login/register do, so the client can update its stored session without a re-login. */
  async updateProfile(userId: string, input: UpdateProfileInput): Promise<AuthResult['user']> {
    const data: Prisma.UserUpdateInput = {};

    if (input.firstName !== undefined) data.firstName = input.firstName.trim() || null;
    if (input.lastName !== undefined) data.lastName = input.lastName.trim() || null;

    if (input.email !== undefined) {
      const email = normalizeEmail(input.email);
      if (!email) {
        throw new ConflictException('A valid email address is required.');
      }
      const clash = await this.prisma.user.findFirst({
        where: { email, NOT: { id: userId } },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException('An account with this email already exists.');
      }
      data.email = email;
    }

    if (input.phone !== undefined) {
      if (input.phone === '') {
        data.phone = null;
      } else {
        const phone = normalizePkPhone(input.phone).e164;
        if (!phone) {
          throw new ConflictException('That phone number is not a valid number.');
        }
        const clash = await this.prisma.user.findFirst({
          where: { phone, NOT: { id: userId } },
          select: { id: true },
        });
        if (clash) {
          throw new ConflictException('An account with this phone number already exists.');
        }
        data.phone = phone;
      }
    }

    const user = await this.prisma.user.update({ where: { id: userId }, data });
    const { roles, permissions } = await this.permissions.resolveForUser(user.id);

    return {
      id: user.id,
      roles,
      permissions,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  /**
   * Mints a session for an account another sign-in path has already
   * authenticated — today single sign-on (sso.service.ts). The same
   * `issue()` a password sign-in ends in: how a session is minted never
   * depends on how the person proved who they are. Every check that path
   * owes (an active account, a verified identity) is the caller's.
   */
  issueSession(user: {
    id: string;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
  }): Promise<AuthResult> {
    return this.issue(user);
  }

  /**
   * Signs the access token and returns the pair. A sign-in (no `rotation`)
   * also starts a new refresh-token family; a rotation passes the successor
   * refresh() already stored, and the moment it was issued.
   */
  private async issue(
    user: {
      id: string;
      email: string | null;
      phone: string | null;
      firstName: string | null;
      lastName: string | null;
    },
    rotation?: { refreshToken: string; issuedAt: Date },
  ): Promise<AuthResult> {
    const issuedAt = rotation?.issuedAt ?? new Date();
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      phone: user.phone,
      // Pinned to the issue moment rather than left to the signer's clock:
      // HS256 is deterministic, so a grace-window replay (answerRotatedToken)
      // re-signs byte-for-byte the access token the first rotation issued.
      iat: Math.floor(issuedAt.getTime() / 1000),
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      // jsonwebtoken's string form is a narrow literal type; seconds avoid it.
      expiresIn: Math.floor(parseDuration(this.config.get('JWT_ACCESS_TTL')) / 1000),
    });

    const { roles, permissions } = await this.permissions.resolveForUser(user.id);

    const refreshToken = rotation?.refreshToken ?? (await this.startFamily(user.id));

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.get('JWT_ACCESS_TTL'),
      user: {
        id: user.id,
        roles,
        permissions,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  /**
   * The first token of a new family (a sign-in, never a rotation). Refresh
   * tokens are opaque random strings, stored only as a SHA-256 hash, so a
   * leaked database dump cannot be replayed as a session.
   */
  private async startFamily(userId: string): Promise<string> {
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        familyId: randomUUID(),
        expiresAt: new Date(Date.now() + parseDuration(this.config.get('JWT_REFRESH_TTL'))),
      },
    });
    return refreshToken;
  }

  /**
   * doc 206 §2.2's "the same new token pair the first rotation issued" needs
   * the successor's plaintext, which is never stored — so the successor is
   * derived from the token it replaces rather than drawn at random: an HMAC
   * under JWT_REFRESH_SECRET. Computing it takes both the presented token and
   * that secret; the secret sits beside JWT_ACCESS_SECRET, which on its own
   * already signs any access token, so this grants nothing a leaked
   * environment did not. Sign-ins still start from 48 random bytes.
   */
  private successorOf(refreshToken: string): string {
    return createHmac('sha256', this.config.get('JWT_REFRESH_SECRET'))
      .update(`${REFRESH_ROTATION_LABEL}:${refreshToken}`)
      .digest('base64url');
  }

  /** A token that was already rotated: a race inside the grace window, reuse outside it. */
  private async answerRotatedToken(
    stored: StoredRefreshToken,
    rotatedAt: Date,
    presentedToken: string,
    context: SessionRequestContext,
    options: RefreshOptions,
  ): Promise<AuthResult> {
    const sinceRotationMs = Date.now() - rotatedAt.getTime();

    if (sinceRotationMs <= REFRESH_REUSE_GRACE_MS) {
      // A single-use credential is not replayed, but a second presentation
      // this soon is no evidence of theft either — refused, not revoked.
      if (options.singleUse) throw new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
      const replay = await this.replayRotation(stored, rotatedAt, presentedToken);
      if (replay) return replay;
      // Inside the window, but the successor is gone — signed out, password
      // changed, deactivated. A benign race with nothing left to hand back,
      // never evidence of theft.
      throw new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
    }

    await this.revokeFamily(stored, rotatedAt, sinceRotationMs, context);
    throw new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
  }

  /** The pair the first rotation issued, re-issued — or null when its successor is no longer live. */
  private async replayRotation(
    stored: StoredRefreshToken,
    rotatedAt: Date,
    presentedToken: string,
  ): Promise<AuthResult | null> {
    if (!stored.replacedById) return null;

    const successorToken = this.successorOf(presentedToken);
    const successor = await this.prisma.refreshToken.findUnique({
      where: { id: stored.replacedById },
      include: { user: true },
    });
    if (
      !successor ||
      // Differs only if JWT_REFRESH_SECRET changed within the last 10 s.
      successor.tokenHash !== hashToken(successorToken) ||
      successor.revokedAt ||
      successor.expiresAt < new Date() ||
      !successor.user.isActive
    ) {
      return null;
    }

    return this.issue(successor.user, { refreshToken: successorToken, issuedAt: rotatedAt });
  }

  /**
   * Reuse outside the grace window: the token was captured and is in two
   * places at once, so every token of its family — the one being used
   * legitimately included — is revoked, forcing a real sign-in.
   */
  private async revokeFamily(
    stored: StoredRefreshToken,
    rotatedAt: Date,
    sinceRotationMs: number,
    context: SessionRequestContext,
  ): Promise<void> {
    const { count } = await this.prisma.$transaction(async (tx) => {
      // Behind any rotation of this family already in flight — see
      // REFRESH_FAMILY_LOCK_NAMESPACE — so its successor is revoked too.
      await lockRefreshFamily(tx, stored.familyId);
      return tx.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    const secondsSinceRotation = Math.round(sinceRotationMs / 1000);
    this.logger.warn(
      `Refresh token reuse detected for user ${stored.userId}, ${secondsSinceRotation} s after rotation: ` +
        `revoked ${count} live token(s) in family ${stored.familyId}`,
    );

    // Operational-class audit (canonical ruling 9), written after the
    // revocation has committed: a failed audit write must never be able to
    // undo it and leave a stolen token live.
    await this.audit.record({
      actorId: null,
      action: REFRESH_REUSE_DETECTED_AUDIT_ACTION,
      entity: 'User',
      entityId: stored.userId,
      data: {
        refreshTokenId: stored.id,
        familyId: stored.familyId,
        rotatedAt: rotatedAt.toISOString(),
        secondsSinceRotation,
        tokensRevoked: count,
      },
      ip: context.ip ?? null,
    });
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Held until the transaction ends; two families that hash alike only wait on each other, never share state. */
async function lockRefreshFamily(tx: Prisma.TransactionClient, familyId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REFRESH_FAMILY_LOCK_NAMESPACE}::int, hashtext(${familyId})::int)`;
}

/** "30d" -> milliseconds. Supports s, m, h, d. */
export function parseDuration(value: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim());
  if (!match) {
    throw new Error(`Cannot parse duration "${value}". Use a form like 15m, 24h or 30d.`);
  }
  const amount = Number(match[1]);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  const multipliers = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;
  return amount * multipliers[unit];
}

/** A real bcrypt hash of a value nobody knows, for constant-time login failure. */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.7pWvA5x0qXk2yBqk3aKQqQZ3bqQeGZi';
