import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ImapFlow } from 'imapflow';
import { EmailAccountsService } from '../../../../core/notifications/email-accounts/email-accounts.service';
import type { EmailAccount } from '../../../../core/prisma/client';
import { EmailInboxService } from './email-inbox.service';

const POLL_INTERVAL_MS = 5 * 60_000;

/**
 * Logs into every connected mailbox with IMAP configured and pulls unseen
 * mail — a customer's reply to an order or support email. Every purpose is
 * polled, not just SUPPORT: a reply to a transactional order confirmation
 * lands in whichever mailbox sent it, usually TRANSACTIONAL.
 *
 * Idempotency is InboundEmail's unique (emailAccountId, messageId)
 * constraint (EmailInboxService.ingestMessage), not the IMAP \Seen flag — a
 * human reading the same mailbox in a real client would otherwise make this
 * job silently skip mail. \Seen is still set after a successful ingest, but
 * only as a courtesy, never as the source of truth.
 */
@Injectable()
export class MailboxPollerCron {
  private readonly logger = new Logger(MailboxPollerCron.name);
  private running = false;

  constructor(
    private readonly emailAccounts: EmailAccountsService,
    private readonly emailInbox: EmailInboxService,
  ) {}

  @Interval(POLL_INTERVAL_MS)
  async poll(): Promise<void> {
    // A slow run must not stack up behind the timer.
    if (this.running) return;
    this.running = true;
    try {
      await this.pollAll();
    } catch (error) {
      this.logger.error(`mailbox poll failed: ${describe(error)}`);
    } finally {
      this.running = false;
    }
  }

  async pollAll(): Promise<number> {
    const accounts = await this.emailAccounts.listImapEnabled();
    if (accounts.length === 0) return 0;

    let ingested = 0;
    for (const account of accounts) {
      try {
        ingested += await this.pollAccount(account);
      } catch (error) {
        this.logger.error(
          `mailbox poll failed for account ${account.id} (${account.label}): ${describe(error)}`,
        );
      }
    }

    if (ingested > 0) {
      this.logger.log(`Mailbox poll: ${ingested} new message(s) ingested`);
    }
    return ingested;
  }

  private async pollAccount(account: EmailAccount): Promise<number> {
    const credentials = this.emailAccounts.decryptImapCredentials(account);
    const client = new ImapFlow({
      host: credentials.host,
      port: credentials.port,
      secure: credentials.secure,
      auth: { user: credentials.user, pass: credentials.password },
      logger: false,
      connectionTimeout: 15_000,
    });

    let ingested = 0;
    await client.connect();
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const uids = await client.search({ seen: false }, { uid: true });
        if (!uids || uids.length === 0) {
          await this.emailAccounts.recordImapPoll(account.id, account.imapLastUid);
          return 0;
        }

        let lastUid = account.imapLastUid;
        const messages = await client.fetchAll(uids, { envelope: true, bodyParts: ['text'] }, { uid: true });

        for (const message of messages) {
          try {
            const from = message.envelope?.from?.[0];
            if (!from?.address) continue;

            const bodyPart = message.bodyParts?.get('text');

            await this.emailInbox.ingestMessage(account.id, {
              messageId: message.envelope?.messageId ?? `<uid-${message.uid}@${account.id}>`,
              inReplyTo: message.envelope?.inReplyTo ?? null,
              fromAddress: from.address.toLowerCase(),
              fromName: from.name || null,
              subject: message.envelope?.subject ?? null,
              bodyText: bodyPart ? bodyPart.toString('utf8') : null,
              receivedAt: message.envelope?.date ?? new Date(),
            });
            ingested += 1;

            await client.messageFlagsAdd([message.uid], ['\\Seen'], { uid: true });
            lastUid = Math.max(lastUid ?? 0, message.uid);
          } catch (error) {
            this.logger.error(
              `could not ingest message uid ${message.uid} for account ${account.id}: ${describe(error)}`,
            );
          }
        }

        await this.emailAccounts.recordImapPoll(account.id, lastUid);
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => client.close());
    }
    return ingested;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
