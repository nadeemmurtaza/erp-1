import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import type { NotificationChannel, NotificationMessage } from './notification-channel';

/**
 * WO-8.4. A generic gateway contract — POSTs {from, to, message} as JSON with
 * a bearer token — since this codebase has no confirmed provider reference
 * yet (same honesty as giftkarta.provider.ts's own header comment: never
 * guess a real API's request shape without one). Enabled by adding
 * `whatsapp` to NOTIFICATION_CHANNELS; env.validation.ts refuses to boot if
 * that is set without WHATSAPP_API_URL/TOKEN/FROM_NUMBER, so a half-
 * configured deploy fails loudly at startup rather than silently dropping
 * campaign and abandoned-cart WhatsApp sends.
 *
 * Failure mode: a non-2xx gateway response throws, which NotificationsService
 * catches and logs per-channel — a dead gateway never blocks the other
 * channels or the caller's own transaction. No retry (matches every other
 * channel here); a failed send is visible on the CampaignRecipient row
 * (FAILED) for manual resend, not auto-retried.
 */
@Injectable()
export class WhatsAppChannel implements NotificationChannel {
  readonly name = 'whatsapp';
  private readonly logger = new Logger('WhatsApp');
  private readonly apiUrl?: string;
  private readonly apiToken?: string;
  private readonly fromNumber?: string;

  constructor(private readonly config: AppConfigService) {
    this.apiUrl = this.config.get('WHATSAPP_API_URL') || undefined;
    this.apiToken = this.config.get('WHATSAPP_API_TOKEN') || undefined;
    this.fromNumber = this.config.get('WHATSAPP_FROM_NUMBER') || undefined;

    if (!this.apiUrl) {
      this.logger.warn('WHATSAPP_API_URL is not set — the WhatsApp channel will not send.');
    }
  }

  supports(message: NotificationMessage): boolean {
    return Boolean(message.recipient.phone);
  }

  async send(message: NotificationMessage): Promise<void> {
    if (!message.recipient.phone) return;
    if (!this.apiUrl || !this.apiToken || !this.fromNumber) {
      this.logger.warn(`No WhatsApp gateway configured — dropped [${message.template}] to ${message.recipient.phone}`);
      return;
    }

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiToken}` },
      body: JSON.stringify({ from: this.fromNumber, to: message.recipient.phone, message: message.body }),
    });

    if (!response.ok) {
      throw new Error(`WhatsApp gateway responded ${response.status}`);
    }

    this.logger.log(`[${message.template}] whatsapp'd ${message.recipient.phone}`);
  }
}
