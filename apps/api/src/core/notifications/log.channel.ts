import { Injectable, Logger } from '@nestjs/common';
import type { NotificationChannel, NotificationMessage } from './notification-channel';

/**
 * Writes notifications to the application log instead of sending them.
 *
 * This is the default channel and the reason the store is fully testable
 * without an SMTP or WhatsApp account: every message the system would send is
 * visible in the log, in order, with its recipient.
 */
@Injectable()
export class LogNotificationChannel implements NotificationChannel {
  readonly name = 'log';
  private readonly logger = new Logger('Notification');

  supports(): boolean {
    return true;
  }

  async send(message: NotificationMessage): Promise<void> {
    const to =
      message.recipient.phone ?? message.recipient.email ?? message.recipient.name ?? '?';
    this.logger.log(`[${message.template}] to ${to}: ${message.subject} — ${message.body}`);
  }
}
