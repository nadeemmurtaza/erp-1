import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { DEFAULT_LOCALE, type Locale } from '@yaseen/shared';
import { AppConfigService } from '../config/app-config.service';
import type { NotificationChannel, NotificationMessage } from './notification-channel';
import { htmlToText, layout, heading, paragraph } from './email/html';
import { renderEmail, type EmailContext } from './email/templates';

/**
 * Sends customer email over SMTP.
 *
 * Enabled by adding `email` to NOTIFICATION_CHANNELS; the env schema refuses to
 * boot if that is set without an SMTP_HOST, so a half-configured deploy fails
 * loudly at startup instead of quietly dropping order confirmations.
 *
 * Deliberately plain SMTP rather than a vendor SDK. The mail server is ours
 * (docker-compose.mail.yml), and if its reputation ever disappoints, pointing
 * SMTP_HOST at a relay is the entire migration.
 */
@Injectable()
export class EmailChannel implements NotificationChannel {
  readonly name = 'email';
  private readonly logger = new Logger('Email');
  private readonly transporter: Transporter | null;
  private readonly from: string;
  private readonly replyTo?: string;
  private readonly context: EmailContext;

  constructor(private readonly config: AppConfigService) {
    const host = this.config.get('SMTP_HOST');
    const user = this.config.get('SMTP_USER');
    const password = this.config.get('SMTP_PASSWORD');

    this.from = this.config.get('MAIL_FROM');
    this.replyTo = this.config.get('MAIL_REPLY_TO') || undefined;
    this.context = {
      storeName: this.config.get('STORE_NAME'),
      storefrontUrl: this.config.get('STOREFRONT_URL'),
      contactEmail: this.replyTo ?? this.config.get('SEED_ADMIN_EMAIL'),
      supportWhatsapp: this.config.get('SUPPORT_WHATSAPP') || undefined,
      bankTransferDetails: this.config.get('BANK_TRANSFER_DETAILS') || undefined,
    };

    this.transporter = host
      ? createTransport({
          host,
          port: this.config.get('SMTP_PORT'),
          // Implicit TLS on 465; 587 connects in the clear and upgrades with
          // STARTTLS, which nodemailer does on its own when the server offers it.
          secure: this.config.get('SMTP_SECURE'),
          // Our own server needs no login when the API reaches it over the
          // private Docker network; a relay will.
          auth: user && password ? { user, pass: password } : undefined,
          // Order bursts arrive together during a sale. Pooling keeps a few
          // connections warm instead of renegotiating TLS per message.
          pool: true,
          maxConnections: 3,
          maxMessages: 50,
        })
      : null;

    if (!this.transporter) {
      this.logger.warn('SMTP_HOST is not set — the email channel will not send.');
    }
  }

  /**
   * An email channel needs an email address. Guests who checked out with only a
   * phone number are reached by the other channels instead, which is why this
   * returns false rather than throwing.
   */
  supports(message: NotificationMessage): boolean {
    return Boolean(this.transporter && message.recipient.email?.includes('@'));
  }

  async send(message: NotificationMessage): Promise<void> {
    if (!this.transporter || !message.recipient.email) return;

    const locale: Locale = message.recipient.locale ?? DEFAULT_LOCALE;
    const rendered =
      renderEmail(message.template, message.data, locale, this.context) ??
      this.fallback(message, locale);

    await this.transporter.sendMail({
      from: this.from,
      to: message.recipient.name
        ? { name: message.recipient.name, address: message.recipient.email }
        : message.recipient.email,
      replyTo: this.replyTo,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      headers: {
        // Lets a customer's client thread the mail for one order together,
        // and gives support something to quote when chasing a delivery.
        'X-Yaseen-Template': message.template,
      },
    });

    this.logger.log(`[${message.template}] emailed ${message.recipient.email}`);
  }

  /**
   * Wraps a message that has no registered template in the standard shell.
   *
   * This is what keeps adding a notification cheap: a new `send()` call reaches
   * the customer as properly branded mail immediately, and designing a layout
   * for it later is an entry in EMAIL_TEMPLATES rather than a prerequisite.
   */
  private fallback(message: NotificationMessage, locale: Locale) {
    const html = layout({
      locale,
      storeName: this.context.storeName,
      footer: `${this.context.storeName} — ${this.context.contactEmail}`,
      body: [heading(message.subject, locale), paragraph(message.body, locale)].join('\n'),
    });

    return { subject: message.subject, html, text: htmlToText(html) };
  }
}
