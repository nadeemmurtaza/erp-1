import { Injectable } from '@nestjs/common';
import { DEFAULT_LOCALE } from '@yaseen/shared';
import { DomainEvent, type UserRegisteredPayload } from '../../core/events/domain-events';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { NotificationsService } from '../../core/notifications/notifications.service';
import type { WelcomeEmailData } from '../../core/notifications/email/templates';

/**
 * Welcomes a new account.
 *
 * UserRegisteredPayload already carries everything needed — no DB fetch
 * required, unlike the order/payment subscribers. A brand new account has no
 * DeviceToken yet (that only exists once the mobile app registers for push),
 * so there is no locale signal to read; DEFAULT_LOCALE is the only option.
 */
@Injectable()
export class WelcomeNotificationSubscriber {
  constructor(private readonly notifications: NotificationsService) {}

  @OnDomainEvent(DomainEvent.UserRegistered)
  async onRegistered(payload: UserRegisteredPayload): Promise<void> {
    const data: WelcomeEmailData = { name: payload.name };

    await this.notifications.send({
      template: 'user.welcome',
      recipient: {
        name: payload.name,
        phone: payload.phone,
        email: payload.email,
        userId: payload.userId,
        locale: DEFAULT_LOCALE,
      },
      subject: 'Welcome to Yaseen',
      body: `Hi ${payload.name}, your account is ready. You can now save your measurements, track orders and check out faster next time.`,
      data: data as unknown as Record<string, unknown>,
    });
  }
}
