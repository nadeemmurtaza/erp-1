import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { NotificationChannel, NotificationMessage } from './notification-channel';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Expo accepts up to 100 messages per request. */
const BATCH_SIZE = 100;

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Push notifications to the mobile app, through Expo's push service.
 *
 * Enabled by adding `expo_push` to NOTIFICATION_CHANNELS. It needs no
 * credentials for the free tier — the device's Expo token is the address — so
 * the only setup is registering devices, which the app does on sign-in.
 *
 * A token Expo reports as dead is deleted rather than retried: a device that
 * has uninstalled the app will never come back, and a growing list of dead
 * tokens slows every future send.
 */
@Injectable()
export class ExpoPushChannel implements NotificationChannel {
  readonly name = 'expo_push';
  private readonly logger = new Logger('ExpoPush');

  constructor(private readonly prisma: PrismaService) {}

  supports(message: NotificationMessage): boolean {
    // No account, no device. Guests are reached by phone instead.
    return Boolean(message.recipient.userId);
  }

  async send(message: NotificationMessage): Promise<void> {
    const devices = await this.prisma.deviceToken.findMany({
      where: { userId: message.recipient.userId! },
      select: { token: true },
    });

    if (devices.length === 0) return;

    for (let index = 0; index < devices.length; index += BATCH_SIZE) {
      const batch = devices.slice(index, index + BATCH_SIZE);

      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(
          batch.map((device) => ({
            to: device.token,
            title: message.subject,
            body: message.body,
            sound: 'default',
            data: { template: message.template, ...message.data },
          })),
        ),
      });

      if (!response.ok) {
        throw new Error(`Expo push returned ${response.status}`);
      }

      const body = (await response.json()) as { data?: ExpoTicket[] };
      await this.pruneDeadTokens(batch.map((device) => device.token), body.data ?? []);
    }
  }

  private async pruneDeadTokens(tokens: string[], tickets: ExpoTicket[]): Promise<void> {
    const dead = tickets
      .map((ticket, index) =>
        ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered'
          ? tokens[index]
          : null,
      )
      .filter((token): token is string => Boolean(token));

    if (dead.length === 0) return;

    await this.prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });
    this.logger.log(`Removed ${dead.length} device token(s) Expo reported as gone`);
  }
}
