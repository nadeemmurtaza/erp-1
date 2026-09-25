import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import type { NotificationChannel, NotificationMessage } from './notification-channel';

/** Same generic gateway contract and honesty as whatsapp.channel.ts — see its header comment. */
@Injectable()
export class SmsChannel implements NotificationChannel {
  readonly name = 'sms';
  private readonly logger = new Logger('Sms');
  private readonly apiUrl?: string;
  private readonly apiToken?: string;
  private readonly fromNumber?: string;

  constructor(private readonly config: AppConfigService) {
    this.apiUrl = this.config.get('SMS_API_URL') || undefined;
    this.apiToken = this.config.get('SMS_API_TOKEN') || undefined;
    this.fromNumber = this.config.get('SMS_FROM_NUMBER') || undefined;

    if (!this.apiUrl) {
      this.logger.warn('SMS_API_URL is not set — the SMS channel will not send.');
    }
  }

  supports(message: NotificationMessage): boolean {
    return Boolean(message.recipient.phone);
  }

  async send(message: NotificationMessage): Promise<void> {
    if (!message.recipient.phone) return;
    if (!this.apiUrl || !this.apiToken || !this.fromNumber) {
      this.logger.warn(`No SMS gateway configured — dropped [${message.template}] to ${message.recipient.phone}`);
      return;
    }

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiToken}` },
      body: JSON.stringify({ from: this.fromNumber, to: message.recipient.phone, message: message.body }),
    });

    if (!response.ok) {
      throw new Error(`SMS gateway responded ${response.status}`);
    }

    this.logger.log(`[${message.template}] texted ${message.recipient.phone}`);
  }
}
