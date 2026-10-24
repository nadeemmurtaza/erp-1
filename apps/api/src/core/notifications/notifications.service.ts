import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { DomainEvent } from '../events/domain-events';
import { EventBusService } from '../events/event-bus.service';
import { EmailChannel } from './email.channel';
import { ExpoPushChannel } from './expo-push.channel';
import { LogNotificationChannel } from './log.channel';
import type { NotificationChannel, NotificationMessage } from './notification-channel';
import { SmsChannel } from './sms.channel';
import { WhatsAppChannel } from './whatsapp.channel';

/**
 * Fans a message out to every enabled channel that can reach the recipient.
 *
 * A failing channel is logged and skipped: a dead SMTP server must never stop
 * an order from being placed.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly channels: NotificationChannel[];

  constructor(
    config: AppConfigService,
    log: LogNotificationChannel,
    expoPush: ExpoPushChannel,
    email: EmailChannel,
    whatsapp: WhatsAppChannel,
    sms: SmsChannel,
    private readonly events: EventBusService,
  ) {
    const available: NotificationChannel[] = [log, expoPush, email, whatsapp, sms];
    this.channels = available.filter((channel) =>
      config.isNotificationChannelEnabled(channel.name),
    );

    if (this.channels.length === 0) {
      this.logger.warn(
        'No notification channels are enabled — customers will not be notified.',
      );
    } else {
      this.logger.log(
        `Notification channels: ${this.channels.map((c) => c.name).join(', ')}`,
      );
    }
  }

  async send(message: NotificationMessage): Promise<void> {
    const matched = this.channels.filter((channel) => channel.supports(message));

    await Promise.all(
      matched.map(async (channel) => {
        try {
          await channel.send(message);
        } catch (error) {
          this.logger.error(
            `channel ${channel.name} failed for ${message.template}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }),
    );

    // doc 153 §2 — one consolidated "messages sent" meter, not three: this
    // is the single call site every channel already fans out from, so it
    // fires once per logical message regardless of which channel(s) it
    // actually left through. Never gated on per-channel delivery success
    // (a failed SMS still consumed a gateway credit) — only on whether a
    // message was attempted at all (`matched.length > 0`); an app with no
    // enabled channels never fires this.
    if (matched.length > 0) {
      await this.events.publish(DomainEvent.NotificationSent, {
        template: message.template,
        channelsAttempted: matched.length,
      });
    }
  }
}
