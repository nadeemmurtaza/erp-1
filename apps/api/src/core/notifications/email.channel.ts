import { randomUUID } from 'node:crypto';
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
  /** Bare address out of MAIL_FROM — the envelope sender and Message-ID domain. */
  private readonly fromAddress: string;

  constructor(private readonly config: AppConfigService) {
    const host = this.config.get('SMTP_HOST');
    const user = this.config.get('SMTP_USER');
    const password = this.config.get('SMTP_PASSWORD');

    this.from = this.config.get('MAIL_FROM');
    this.replyTo = this.config.get('MAIL_REPLY_TO') || undefined;
    this.fromAddress = this.from.match(/<([^>]+)>/)?.[1]?.trim() ?? this.from.trim();
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

    this.warnIfSenderWillFailDmarc();
  }

  /**
   * The one misconfiguration that guarantees the spam folder.
   *
   * DMARC passes on alignment: the domain in From: must be one that SPF or DKIM
   * authenticated. Sending as a Gmail or Yahoo address from our own server can
   * never align — those domains publish a reject policy precisely so nobody
   * else can send as them — so every order confirmation would be refused or
   * filed as spam. Worth a loud warning at boot rather than a mystery later.
   */
  private warnIfSenderWillFailDmarc(): void {
    const domain = this.fromAddress.split('@')[1]?.toLowerCase();
    const free = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'];

    if (domain && free.includes(domain)) {
      this.logger.error(
        `MAIL_FROM sends as @${domain}. That domain's DMARC policy rejects mail from our server, so confirmations will be spam-filed or refused. Send as your own domain.`,
      );
    }
  }

  /**
   * An email channel needs an email address. Guests who checked out with only a
   * phone number are reached by the other channels instead, which is why this
   * returns false rather than throwing.
   */
  supports(message: NotificationMessage): boolean {
    return Boolean(this.transporter && isDeliverable(message.recipient.email));
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
      // Pins the envelope sender (the Return-Path SPF is checked against) to
      // the same domain as the visible From. Left to itself nodemailer can use
      // a different address, and DMARC alignment then rests on DKIM alone.
      envelope: { from: this.fromAddress, to: message.recipient.email },
      // Built from our own domain rather than the machine's hostname, which in
      // a container is a random hex string — a Message-ID like
      // <...@4f2a9c1b8e77> reads as botnet output to a spam filter.
      messageId: `<${randomUUID()}@${this.fromAddress.split('@')[1] ?? 'yaseen.pk'}>`,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      headers: {
        // Says this is machine-generated and transactional (RFC 3834). Stops
        // out-of-office autoresponders replying to it, which would otherwise
        // bounce back at us and cost reputation for no reason.
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Suppress': 'All',
        // Lets a customer's client thread one order's mail together, and gives
        // support something to quote when chasing a delivery.
        'X-Yaseen-Template': message.template,
      },
      // Nothing in a template should be reaching the filesystem or the network
      // to build a message; if one ever tries, fail rather than fetch.
      disableFileAccess: true,
      disableUrlAccess: true,
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

/**
 * Whether an address is worth attempting.
 *
 * Deliberately a shape check, not an attempt at RFC 5322 — the point is to
 * catch the addresses that are obviously going to hard-bounce (no domain, a
 * bare name, a stray space from a checkout form). Hard bounces are the fastest
 * way to lose a young server's reputation, so not sending is better than
 * sending and being rejected.
 */
export function isDeliverable(email: string | null | undefined): boolean {
  if (!email) return false;
  const trimmed = email.trim();
  return /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/.test(trimmed) && trimmed.length <= 254;
}
