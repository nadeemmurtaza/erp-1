import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { AppConfigService } from '../../config/app-config.service';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { decryptSecret, encryptSecret } from '../../security/secret-crypto';
import type { EmailAccount, EmailAccountPurpose } from '../../prisma/client';

/** Everything but the two *Encrypted columns — what the API is allowed to return. */
export type EmailAccountSummary = Omit<
  EmailAccount,
  'smtpPasswordEncrypted' | 'imapPasswordEncrypted'
> & {
  /** True once a password is on file — the form shows "•••• (unchanged)" instead of asking again. */
  hasSmtpPassword: boolean;
  hasImapPassword: boolean;
};

export interface SmtpFields {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}

export interface ImapFields {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}

export interface CreateEmailAccountInput {
  label: string;
  purpose: EmailAccountPurpose;
  isActive?: boolean;
  isDefault?: boolean;
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  smtp: SmtpFields;
  /** Omit entirely for an account with no IMAP configured. */
  imap?: ImapFields | null;
}

/** Same shape as create, but every field optional — an omitted password keeps the stored one. */
export interface UpdateEmailAccountInput {
  label?: string;
  purpose?: EmailAccountPurpose;
  isActive?: boolean;
  isDefault?: boolean;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string | null;
  smtp?: Partial<SmtpFields>;
  imap?: Partial<ImapFields> | null;
  /** True clears a previously configured IMAP connection entirely. */
  clearImap?: boolean;
}

/**
 * Connected mailboxes, so the store can send transactional mail from one
 * address, marketing from another, and (eventually) read a support inbox
 * from a third — instead of every outgoing email leaving from one hard-coded
 * SMTP_* env block.
 *
 * Passwords are AES-256-GCM ciphertext at rest (secret-crypto.ts) and never
 * leave decrypted except to hand to nodemailer/imapflow for a live
 * connection — never in an API response, never in a log line.
 */
@Injectable()
export class EmailAccountsService {
  private readonly logger = new Logger(EmailAccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<EmailAccountSummary[]> {
    const accounts = await this.prisma.emailAccount.findMany({
      orderBy: [{ purpose: 'asc' }, { isDefault: 'desc' }, { label: 'asc' }],
    });
    return accounts.map((account) => this.toSummary(account));
  }

  async get(id: string): Promise<EmailAccountSummary> {
    return this.toSummary(await this.findOrThrow(id));
  }

  async create(actorId: string, input: CreateEmailAccountInput): Promise<EmailAccountSummary> {
    const key = this.encryptionKey();

    const account = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.emailAccount.updateMany({
          where: { purpose: input.purpose, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.emailAccount.create({
        data: {
          label: input.label,
          purpose: input.purpose,
          isActive: input.isActive ?? true,
          isDefault: input.isDefault ?? false,
          fromName: input.fromName,
          fromEmail: input.fromEmail,
          replyTo: input.replyTo ?? null,
          smtpHost: input.smtp.host,
          smtpPort: input.smtp.port,
          smtpSecure: input.smtp.secure,
          smtpUser: input.smtp.user,
          smtpPasswordEncrypted: encryptSecret(input.smtp.password, key),
          imapHost: input.imap?.host ?? null,
          imapPort: input.imap?.port ?? null,
          imapSecure: input.imap?.secure ?? true,
          imapUser: input.imap?.user ?? null,
          imapPasswordEncrypted: input.imap ? encryptSecret(input.imap.password, key) : null,
        },
      });
    });

    await this.audit.record({
      actorId,
      action: 'email_account.created',
      entity: 'EmailAccount',
      entityId: account.id,
      data: { label: account.label, purpose: account.purpose },
    });

    return this.toSummary(account);
  }

  async update(
    actorId: string,
    id: string,
    input: UpdateEmailAccountInput,
  ): Promise<EmailAccountSummary> {
    const existing = await this.findOrThrow(id);
    const key = this.encryptionKey();
    const purpose = input.purpose ?? existing.purpose;

    const account = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.emailAccount.updateMany({
          where: { purpose, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      }

      const imapCleared = input.clearImap === true;
      const imapHost = imapCleared ? null : (input.imap?.host ?? existing.imapHost);
      const imapUser = imapCleared ? null : (input.imap?.user ?? existing.imapUser);

      return tx.emailAccount.update({
        where: { id },
        data: {
          label: input.label ?? existing.label,
          purpose,
          isActive: input.isActive ?? existing.isActive,
          isDefault: input.isDefault ?? existing.isDefault,
          fromName: input.fromName ?? existing.fromName,
          fromEmail: input.fromEmail ?? existing.fromEmail,
          replyTo: input.replyTo !== undefined ? input.replyTo : existing.replyTo,
          smtpHost: input.smtp?.host ?? existing.smtpHost,
          smtpPort: input.smtp?.port ?? existing.smtpPort,
          smtpSecure: input.smtp?.secure ?? existing.smtpSecure,
          smtpUser: input.smtp?.user ?? existing.smtpUser,
          smtpPasswordEncrypted: input.smtp?.password
            ? encryptSecret(input.smtp.password, key)
            : existing.smtpPasswordEncrypted,
          imapHost,
          imapPort: imapCleared ? null : (input.imap?.port ?? existing.imapPort),
          imapSecure: imapCleared ? true : (input.imap?.secure ?? existing.imapSecure),
          imapUser,
          imapPasswordEncrypted: imapCleared
            ? null
            : input.imap?.password
              ? encryptSecret(input.imap.password, key)
              : existing.imapPasswordEncrypted,
        },
      });
    });

    await this.audit.record({
      actorId,
      action: 'email_account.updated',
      entity: 'EmailAccount',
      entityId: account.id,
      data: { label: account.label, purpose: account.purpose },
    });

    return this.toSummary(account);
  }

  async remove(actorId: string, id: string): Promise<void> {
    const existing = await this.findOrThrow(id);
    await this.prisma.emailAccount.delete({ where: { id } });
    await this.audit.record({
      actorId,
      action: 'email_account.deleted',
      entity: 'EmailAccount',
      entityId: id,
      data: { label: existing.label },
    });
  }

  /** Connects and authenticates over SMTP without sending anything. */
  async testSmtp(fields: SmtpFields): Promise<void> {
    const transporter = createTransport({
      host: fields.host,
      port: fields.port,
      secure: fields.secure,
      auth: { user: fields.user, pass: fields.password },
      connectionTimeout: 10_000,
    });

    try {
      await transporter.verify();
    } catch (error) {
      throw new BadRequestException(
        `Could not connect: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      transporter.close();
    }
  }

  /** Connects and authenticates over IMAP, then logs out. Nothing reads the mailbox yet. */
  async testImap(fields: ImapFields): Promise<void> {
    const client = new ImapFlow({
      host: fields.host,
      port: fields.port,
      secure: fields.secure,
      auth: { user: fields.user, pass: fields.password },
      logger: false,
      // Authenticates then logs out immediately — exactly a connectivity check.
      verifyOnly: true,
      connectionTimeout: 10_000,
    });

    try {
      await client.connect();
    } catch (error) {
      throw new BadRequestException(
        `Could not connect: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      client.close();
    }
  }

  /** Tests the SMTP credentials already on file for a saved account, and records success. */
  async testSavedSmtp(id: string): Promise<void> {
    const account = await this.findOrThrow(id);
    await this.testSmtp({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpSecure,
      user: account.smtpUser,
      password: decryptSecret(account.smtpPasswordEncrypted, this.encryptionKey()),
    });
    await this.prisma.emailAccount.update({
      where: { id },
      data: { smtpVerifiedAt: new Date() },
    });
  }

  /** Tests the IMAP credentials already on file for a saved account, and records success. */
  async testSavedImap(id: string): Promise<void> {
    const account = await this.findOrThrow(id);
    if (!account.imapHost || !account.imapUser || !account.imapPasswordEncrypted) {
      throw new BadRequestException('This account has no IMAP connection configured.');
    }
    await this.testImap({
      host: account.imapHost,
      port: account.imapPort ?? 993,
      secure: account.imapSecure,
      user: account.imapUser,
      password: decryptSecret(account.imapPasswordEncrypted, this.encryptionKey()),
    });
    await this.prisma.emailAccount.update({
      where: { id },
      data: { imapVerifiedAt: new Date() },
    });
  }

  /**
   * The account EmailChannel should send a message through for a given
   * purpose: the active default for that purpose, else the most recently
   * updated active one for it, else (for anything other than TRANSACTIONAL)
   * the same resolution against TRANSACTIONAL — every purpose can fall back
   * to the transactional sender, but transactional mail has nowhere further
   * to fall back to. Returns null when nothing is configured at all, so the
   * caller can fall back to the env-based SMTP_* transport.
   */
  async resolveFor(
    purpose: EmailAccountPurpose,
  ): Promise<{ account: EmailAccount; password: string } | null> {
    const account =
      (await this.pickActive(purpose)) ??
      (purpose !== 'TRANSACTIONAL' ? await this.pickActive('TRANSACTIONAL') : null);

    if (!account) return null;

    return { account, password: decryptSecret(account.smtpPasswordEncrypted, this.encryptionKey()) };
  }

  private async pickActive(purpose: EmailAccountPurpose): Promise<EmailAccount | null> {
    return this.prisma.emailAccount.findFirst({
      where: { purpose, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  private async findOrThrow(id: string): Promise<EmailAccount> {
    const account = await this.prisma.emailAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('That email account no longer exists.');
    return account;
  }

  private encryptionKey(): string {
    return this.config.get('APP_ENCRYPTION_KEY');
  }

  private toSummary(account: EmailAccount): EmailAccountSummary {
    const { smtpPasswordEncrypted, imapPasswordEncrypted, ...rest } = account;
    return {
      ...rest,
      hasSmtpPassword: Boolean(smtpPasswordEncrypted),
      hasImapPassword: Boolean(imapPasswordEncrypted),
    };
  }
}
