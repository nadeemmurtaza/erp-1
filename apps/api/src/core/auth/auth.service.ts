import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { normalizeEmail, normalizePkPhone } from '@yaseen/shared';
import { AppConfigService } from '../config/app-config.service';
import { EventBusService } from '../events/event-bus.service';
import { DomainEvent } from '../events/domain-events';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma, UserRole } from '../prisma/client';
import type { AuthenticatedUser, JwtPayload } from './auth.constants';
import { hashPassword } from './password.util';
import { PermissionsResolverService } from './permissions.service';

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
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    if (!email) {
      throw new ConflictException('A valid email address is required.');
    }

    const phone = input.phone ? normalizePkPhone(input.phone).e164 : null;
    if (input.phone && !phone) {
      throw new ConflictException('That phone number is not a valid Pakistani number.');
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
        role: 'CUSTOMER',
      },
    });

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

  async login(identifier: string, password: string): Promise<AuthResult> {
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
    const ok = await compare(password, passwordHash);

    if (!user || !ok) {
      throw new UnauthorizedException('Incorrect email/phone or password.');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('This account has been deactivated.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issue(user);
  }

  /** Rotates a refresh token: the presented one is revoked as it is used. */
  async refresh(refreshToken: string): Promise<AuthResult> {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }
    if (!stored.user.isActive) {
      throw new UnauthorizedException('This account has been deactivated.');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issue(stored.user);
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
    if (!user?.passwordHash || !(await compare(currentPassword, user.passwordHash))) {
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
          throw new ConflictException('That phone number is not a valid Pakistani number.');
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
    const permissions = await this.permissions.resolveForUser(user.id, user.role);

    return {
      id: user.id,
      role: user.role,
      permissions,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  private async issue(user: {
    id: string;
    role: UserRole;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
  }): Promise<AuthResult> {
    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      email: user.email,
      phone: user.phone,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      // jsonwebtoken's string form is a narrow literal type; seconds avoid it.
      expiresIn: Math.floor(parseDuration(this.config.get('JWT_ACCESS_TTL')) / 1000),
    });

    const permissions = await this.permissions.resolveForUser(user.id, user.role);

    // Refresh tokens are opaque random strings, stored only as a SHA-256 hash,
    // so a leaked database dump cannot be replayed as a session.
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + parseDuration(this.config.get('JWT_REFRESH_TTL'))),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.get('JWT_ACCESS_TTL'),
      user: {
        id: user.id,
        role: user.role,
        permissions,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
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
