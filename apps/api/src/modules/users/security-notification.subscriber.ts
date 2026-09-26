import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@newax/shared';
import {
  DomainEvent,
  type ApiKeyIssuedPayload,
  type EmailVerificationRequestedPayload,
  type PasswordChangedPayload,
  type PasswordResetRequestedPayload,
  type SsoAccountLinkedPayload,
} from '../../core/events/domain-events';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import type {
  ApiKeyIssuedEmailData,
  EmailVerificationEmailData,
  PasswordResetEmailData,
} from '../../core/notifications/email/templates';

/**
 * Account-security mail: a changed password, a reset link, a verification
 * link. Separate from WelcomeNotificationSubscriber because every handler
 * here needs a fresh lookup of the user (the domain events only carry a
 * userId and, for the two token flows, the one-time token itself — nothing
 * else is safe to put on the event bus).
 */
@Injectable()
export class SecurityNotificationSubscriber {
  private readonly logger = new Logger(SecurityNotificationSubscriber.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @OnDomainEvent(DomainEvent.PasswordChanged)
  async onPasswordChanged(payload: PasswordChangedPayload): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      select: { email: true, firstName: true, lastName: true },
    });
    if (!user?.email) return;

    const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || null;
    const locale = await this.localeFor(payload.userId);

    await this.notifications.send({
      template: 'user.password_changed',
      recipient: { name, email: user.email, phone: null, userId: payload.userId, locale },
      subject: 'Your password was changed',
      body: 'Your password was just changed. If this was not you, contact us right away.',
      data: {},
    });

    this.logger.log(`Sent password-changed confirmation to user ${payload.userId}`);
  }

  @OnDomainEvent(DomainEvent.PasswordResetRequested)
  async onPasswordResetRequested(payload: PasswordResetRequestedPayload): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      select: { email: true, firstName: true, lastName: true },
    });
    if (!user?.email) return;

    const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || null;
    const locale = await this.localeFor(payload.userId);
    const data: PasswordResetEmailData = { token: payload.token };

    await this.notifications.send({
      template: 'user.password_reset',
      recipient: { name, email: user.email, phone: null, userId: payload.userId, locale },
      subject: 'Reset your password',
      body: 'Use the link in this email to set a new password. It expires in one hour.',
      data: data as unknown as Record<string, unknown>,
    });

    this.logger.log(`Sent password-reset link to user ${payload.userId}`);
  }

  @OnDomainEvent(DomainEvent.EmailVerificationRequested)
  async onEmailVerificationRequested(
    payload: EmailVerificationRequestedPayload,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      select: { email: true, firstName: true, lastName: true },
    });
    if (!user?.email) return;

    const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || null;
    const locale = await this.localeFor(payload.userId);
    const data: EmailVerificationEmailData = { token: payload.token };

    await this.notifications.send({
      template: 'user.email_verification',
      recipient: { name, email: user.email, phone: null, userId: payload.userId, locale },
      subject: 'Confirm your email address',
      body: 'Use the link in this email to confirm your email address.',
      data: data as unknown as Record<string, unknown>,
    });

    this.logger.log(`Sent email-verification link to user ${payload.userId}`);
  }

  /**
   * A personal API key's secret was issued, at create or rotate
   * (163-personal-api-keys.md §5). The one control that makes the
   * persistence attack visible — someone briefly holding a session mints a
   * key to keep access after the password is changed — so it goes to the
   * key's owner every time, never gated by a notification preference.
   * Idempotent in effect: a redelivered event re-sends the same notice.
   */
  @OnDomainEvent(DomainEvent.ApiKeyIssued)
  async onApiKeyIssued(payload: ApiKeyIssuedPayload): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      select: { email: true, firstName: true, lastName: true },
    });
    if (!user?.email) return;

    const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || null;
    const locale = await this.localeFor(payload.userId);
    const data: ApiKeyIssuedEmailData = {
      surface: payload.surface,
      lastFour: payload.lastFour,
      reason: payload.reason,
    };

    await this.notifications.send({
      template: 'user.api_key_issued',
      recipient: { name, email: user.email, phone: null, userId: payload.userId, locale },
      subject: 'A new API key was issued for your account',
      body: 'A new API key was issued for your account. If this was not you, revoke it and change your password.',
      data: data as unknown as Record<string, unknown>,
    });

    this.logger.log(`Sent API-key-issued notice for key ${payload.apiKeyId} to user ${payload.userId}`);
  }

  /**
   * An existing account was linked to a single sign-on identity
   * (161-sso-identity-federation.md §3). Linking is automatic once the
   * domain gate passes, so this mail is what makes it never silent: an
   * unexpected link reaches the account holder, who can have an admin
   * unlink it. Not sent for an account single sign-on newly created — that
   * person just signed in, live, and nothing about it is unexpected.
   * Idempotent in effect: a redelivered event re-sends the same notice.
   */
  @OnDomainEvent(DomainEvent.SsoAccountLinked)
  async onSsoAccountLinked(payload: SsoAccountLinkedPayload): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      select: { email: true, firstName: true, lastName: true },
    });
    if (!user?.email) return;

    const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || null;
    const locale = await this.localeFor(payload.userId);

    await this.notifications.send({
      template: 'user.sso_account_linked',
      recipient: { name, email: user.email, phone: null, userId: payload.userId, locale },
      subject: 'Single sign-on was linked to your account',
      body: 'Your account can now be signed in to through single sign-on. If this was not you, reply to this email right away.',
      data: {},
    });

    this.logger.log(`Sent single-sign-on-linked notice to user ${payload.userId}`);
  }

  /** Same resolution as the orders/payments subscribers; see the note there. */
  private async localeFor(userId: string): Promise<Locale> {
    const device = await this.prisma.deviceToken.findFirst({
      where: { userId, locale: { not: null } },
      orderBy: { lastSeenAt: 'desc' },
      select: { locale: true },
    });

    const locale = device?.locale?.split('-')[0];
    return locale && isLocale(locale) ? locale : DEFAULT_LOCALE;
  }
}
