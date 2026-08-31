import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import type { NotificationChannel, NotificationMessage } from './notification-channel';
import nodemailer from 'nodemailer';

/**
 * Sends email through any SMTP relay — Stalwart, Cloudflare, SES, Resend, etc.
 *
 * Enabled by adding `email` to NOTIFICATION_CHANNELS. Requires SMTP_HOST and
 * SMTP_PASSWORD in the environment. The transporter is created lazily on first
 * send so the app boots cleanly even when email is disabled.
 */
@Injectable()
export class EmailNotificationChannel implements NotificationChannel {
  readonly name = 'email';
  private readonly logger = new Logger('Email');
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: AppConfigService) {}

  supports(message: NotificationMessage): boolean {
    return Boolean(message.recipient.email);
  }

  async send(message: NotificationMessage): Promise<void> {
    const transporter = this.getTransporter();
    const from = this.config.get('MAIL_FROM');
    const replyTo = this.config.get('MAIL_REPLY_TO');

    const mailOptions: nodemailer.SendMailOptions = {
      from,
      to: message.recipient.email!,
      subject: message.subject,
      text: message.body,
    };

    if (replyTo) {
      mailOptions.replyTo = replyTo;
    }

    await transporter.sendMail(mailOptions);

    this.logger.log(`Email sent to ${message.recipient.email}: ${message.subject}`);
  }

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: this.config.get('SMTP_HOST'),
        port: this.config.get('SMTP_PORT'),
        secure: this.config.get('SMTP_SECURE'),
        auth: {
          user: this.config.get('SMTP_USER') || 'api_token',
          pass: this.config.get('SMTP_PASSWORD'),
        },
      });
    }
    return this.transporter;
  }
}
