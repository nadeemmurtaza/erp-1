import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@yaseen/shared';
import {
  DomainEvent,
  type EmailVerificationRequestedPayload,
  type PasswordChangedPayload,
  type PasswordResetRequestedPayload,
} from '../../core/events/domain-events';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import type {
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
