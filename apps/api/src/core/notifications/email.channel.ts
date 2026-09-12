import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { DEFAULT_LOCALE, type Locale } from '@newax/shared';
import { AppConfigService } from '../config/app-config.service';
import type { EmailAccount } from '../prisma/client';
import { EmailAccountsService } from './email-accounts/email-accounts.service';
import type { NotificationChannel, NotificationMessage } from './notification-channel';
import { htmlToText, layout, heading, paragraph } from './email/html';
import { purposeForTemplate } from './email/catalog';
import { renderEmail, type EmailContext } from './email/templates';

interface Sender {
  transporter: Transporter;
  context: EmailContext;
  /** Envelope sender / Return-Path — what SPF is checked against. */
  fromAddress: string;
  /** Full "Name <address>" for the From: header. */
  from: string;
}

/**
 * Sends customer email over SMTP.
 *
 * Enabled by adding `email` to NOTIFICATION_CHANNELS; the env schema refuses to
 * boot if that is set without an SMTP_HOST, so a half-configured deploy fails
 * loudly at startup instead of quietly dropping order confirmations.
 *
 * Which mailbox a message actually leaves from is resolved per send, not
 * fixed at construction: EmailAccountsService picks a connected mailbox for
 * the template's purpose (transactional vs. marketing — see
 * email/catalog.ts's purposeForTemplate), so a store with a dedicated
 * marketing sender configured in Settings → Email Accounts gets that, and a
 * store with none configured falls back to the single SMTP_* transport this
 * channel has always used. That fallback is why SMTP_HOST stays part of the
 * env contract rather than becoming purely a database concern.
 */
@Injectable()
export class EmailChannel implements NotificationChannel {
  readonly name = 'email';
  private readonly logger = new Logger('Email');
  private readonly envSender: Sender | null;
  private readonly warnedDomains = new Set<string>();
  /** Keyed by account id; replaced whenever the account's updatedAt moves, so a rotated password never sends on stale creds. */
  private readonly accountSenders = new Map<string, { sender: Sender; updatedAt: number }>();

  constructor(
    private readonly config: AppConfigService,
    private readonly accounts: EmailAccountsService,
  ) {
    const host = this.config.get('SMTP_HOST');

    this.envSender = host ? this.buildEnvSender(host) : null;

    if (!this.envSender) {
      this.logger.warn(
        'SMTP_HOST is not set and no connected mailbox exists yet — the email channel will not send until one of the two is configured.',
      );
    }
  }

  private buildEnvSender(host: string): Sender {
    const user = this.config.get('SMTP_USER');
    const password = this.config.get('SMTP_PASSWORD');
    const from = this.config.get('MAIL_FROM');
    const replyTo = this.config.get('MAIL_REPLY_TO') || undefined;
    const fromAddress = from.match(/<([^>]+)>/)?.[1]?.trim() ?? from.trim();

    this.warnIfSenderWillFailDmarc(fromAddress);

    const transporter = createTransport({
      host,
      port: this.config.get('SMTP_PORT'),
      // Implicit TLS on 465; 587 connects in the clear and upgrades with
      // STARTTLS, which nodemailer does on its own when the server offers it.
      secure: this.config.get('SMTP_SECURE'),
      // The API signs in as an ordinary mailbox (no-reply@), not as an
      // administrator, so the mail server can rate-limit and account for it
      // like any other client. Left unset only for a server that accepts
      // unauthenticated submission from the private network.
      auth: user && password ? { user, pass: password } : undefined,
      // Order bursts arrive together during a sale. Pooling keeps a few
      // connections warm instead of renegotiating TLS per message.
      pool: true,
      maxConnections: 3,
      maxMessages: 50,
    });

    return {
      transporter,
      fromAddress,
      from,
      context: {
        storeName: this.config.get('STORE_NAME'),
        storefrontUrl: this.config.get('STOREFRONT_URL'),
        contactEmail: replyTo ?? this.config.get('SEED_ADMIN_EMAIL'),
        supportWhatsapp: this.config.get('SUPPORT_WHATSAPP') || undefined,
        bankTransferDetails: this.config.get('BANK_TRANSFER_DETAILS') || undefined,
      },
    };
  }

  private senderForAccount(account: EmailAccount, password: string): Sender {
    const updatedAt = account.updatedAt.getTime();
    const cached = this.accountSenders.get(account.id);
    if (cached && cached.updatedAt === updatedAt) return cached.sender;

    if (cached) cached.sender.transporter.close();

    this.warnIfSenderWillFailDmarc(account.fromEmail);

    const transporter = createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpSecure,
      auth: { user: account.smtpUser, pass: password },
      pool: true,
      maxConnections: 3,
      maxMessages: 50,
    });

    const sender: Sender = {
      transporter,
      fromAddress: account.fromEmail,
      from: `${account.fromName} <${account.fromEmail}>`,
      context: {
        storeName: this.config.get('STORE_NAME'),
        storefrontUrl: this.config.get('STOREFRONT_URL'),
        contactEmail: account.replyTo ?? account.fromEmail,
        supportWhatsapp: this.config.get('SUPPORT_WHATSAPP') || undefined,
        bankTransferDetails: this.config.get('BANK_TRANSFER_DETAILS') || undefined,
      },
    };

    this.accountSenders.set(account.id, { sender, updatedAt });
    return sender;
  }

  private async resolveSender(template: string): Promise<Sender | null> {
    const purpose = purposeForTemplate(template);

    try {
      const resolved = await this.accounts.resolveFor(purpose);
      if (resolved) return this.senderForAccount(resolved.account, resolved.password);
    } catch (error) {
      this.logger.error(
        `failed to resolve a connected mailbox for purpose ${purpose}, falling back to SMTP_*: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return this.envSender;
  }

  /**
   * The one misconfiguration that guarantees the spam folder.
   *
   * DMARC passes on alignment: the domain in From: must be one that SPF or DKIM
   * authenticated. Sending as a Gmail or Yahoo address from our own server can
   * never align — those domains publish a reject policy precisely so nobody
   * else can send as them — so every order confirmation would be refused or
   * filed as spam. Worth a loud warning at boot (or the moment a mailbox with
   * such an address is connected) rather than a mystery later. Warned once per
   * domain, since a store can connect several mailboxes on the same free host.
   */
  private warnIfSenderWillFailDmarc(fromAddress: string): void {
    const domain = fromAddress.split('@')[1]?.toLowerCase();
    const free = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'];

    if (domain && free.includes(domain) && !this.warnedDomains.has(domain)) {
      this.warnedDomains.add(domain);
      this.logger.error(
        `A sender uses @${domain}. That domain's DMARC policy rejects mail from our server, so its mail will be spam-filed or refused. Send as your own domain.`,
      );
    }
  }

  /**
   * An email channel needs an email address. Guests who checked out with only a
   * phone number are reached by the other channels instead, which is why this
   * returns false rather than throwing.
   */
  supports(message: NotificationMessage): boolean {
    return isDeliverable(message.recipient.email);
  }

  async send(message: NotificationMessage): Promise<void> {
    if (!message.recipient.email) return;

    const sender = await this.resolveSender(message.template);
    if (!sender) {
      this.logger.warn(
        `No connected mailbox and no SMTP_* fallback — dropped [${message.template}] to ${message.recipient.email}`,
      );
      return;
    }

    const locale: Locale = message.recipient.locale ?? DEFAULT_LOCALE;
    const rendered =
      renderEmail(message.template, message.data, locale, sender.context) ??
      this.fallback(message, locale, sender.context);

    await sender.transporter.sendMail({
      from: sender.from,
      to: message.recipient.name
        ? { name: message.recipient.name, address: message.recipient.email }
        : message.recipient.email,
      replyTo: sender.context.contactEmail,
      // Pins the envelope sender (the Return-Path SPF is checked against) to
      // the same domain as the visible From. Left to itself nodemailer can use
      // a different address, and DMARC alignment then rests on DKIM alone.
      envelope: { from: sender.fromAddress, to: message.recipient.email },
      // Built from our own domain rather than the machine's hostname, which in
      // a container is a random hex string — a Message-ID like
      // <...@4f2a9c1b8e77> reads as botnet output to a spam filter.
      messageId: `<${randomUUID()}@${sender.fromAddress.split('@')[1] ?? 'yaseen.pk'}>`,
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
   *
   * Also what a Support Inbox reply's free-typed text goes through
   * (sendReply(), below) — a staff reply has no template of its own either,
   * just the same branded shell every other untemplated message gets. Split
   * on blank lines so a multi-paragraph reply doesn't collapse into one
   * run-on <p>, the way HTML whitespace collapsing would otherwise render it.
   */
  private fallback(
    message: Pick<NotificationMessage, 'subject' | 'body'>,
    locale: Locale,
    context: EmailContext,
  ) {
    const paragraphs = message.body
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);

    const html = layout({
      locale,
      storeName: context.storeName,
      footer: `${context.storeName} — ${context.contactEmail}`,
      body: [
        heading(message.subject, locale),
        ...(paragraphs.length > 0 ? paragraphs : [message.body]).map((part) =>
          paragraph(part, locale),
        ),
      ].join('\n'),
    });

    return { subject: message.subject, html, text: htmlToText(html) };
  }

  /**
   * Sends a staff-typed reply from the Support Inbox, over the SAME account
   * the original message arrived at — never resolved by purpose, since a
   * reply has to leave from the mailbox the customer is already talking to.
   * Threaded via In-Reply-To/References so it lands in the customer's
   * existing thread rather than starting a new one.
   */
  async sendReply(
    accountId: string,
    message: {
      to: string;
      toName?: string | null;
      subject: string;
      body: string;
      inReplyTo?: string;
      references?: string[];
    },
  ): Promise<void> {
    const { account, password } = await this.accounts.getSmtpCredentials(accountId);
    const sender = this.senderForAccount(account, password);
    const rendered = this.fallback(message, DEFAULT_LOCALE, sender.context);

    await sender.transporter.sendMail({
      from: sender.from,
      to: message.toName ? { name: message.toName, address: message.to } : message.to,
      replyTo: sender.context.contactEmail,
      envelope: { from: sender.fromAddress, to: message.to },
      messageId: `<${randomUUID()}@${sender.fromAddress.split('@')[1] ?? 'yaseen.pk'}>`,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      inReplyTo: message.inReplyTo,
      references: message.references,
      // A human wrote this, unlike every other send() path — no
      // Auto-Submitted header, so a reply-scanning filter treats it normally.
      headers: { 'X-Yaseen-Template': 'support.reply' },
      disableFileAccess: true,
      disableUrlAccess: true,
    });

    this.logger.log(`[support.reply] emailed ${message.to}`);
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
