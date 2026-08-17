import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { ExpoPushChannel } from './expo-push.channel';
import { LogNotificationChannel } from './log.channel';
import type { NotificationChannel, NotificationMessage } from './notification-channel';

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
  ) {
    const available: NotificationChannel[] = [log, expoPush];
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
    await Promise.all(
      this.channels
        .filter((channel) => channel.supports(message))
        .map(async (channel) => {
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
  }
}
