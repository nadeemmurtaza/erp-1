import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { DunningService } from './dunning.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 145-receivables-credit-limits-dunning.md (WO-145.4) — the nightly dunning
 * sweep.
 *
 * DEVIATION from this doc's own literal text, documented in full in the
 * doc's own shipped-status note: it asks to "register Invoice.dueDate
 * against doc 54's existing ExpiringRecordSource watcher" — but doc 54
 * (docs/implementation/hr-people-org/54-employee-document-lifecycle-alerts.md)
 * is itself unshipped (verified by search before writing this: no
 * `ExpiringRecordSource` type, registry or nightly watcher exists anywhere
 * in apps/api/src today), so there is no existing mechanism to register
 * against. Rather than build that generic registry as an unrequested,
 * separately-scoped piece of doc 54's own work, this is a dedicated cron
 * following the identical idiom every other module's own nightly sweep
 * already uses (purchasing.cron.ts, cod-risk.cron.ts, inventory.cron.ts) —
 * consistent with this codebase's OWN actual convention (one cron per
 * module, not one shared registry) rather than the not-yet-real one the
 * doc assumed.
 *
 * A customer's own `Order` is "overdue" once
 * `placedAt + CustomerCreditTerm.paymentTermDays` has passed AND it carries
 * no PAID `Payment` — the identical settlement test the AR ledger's own
 * posting already implies, without re-deriving a partial-payment balance
 * this codebase does not track anywhere else either.
 */
@Injectable()
export class DunningCron {
  private readonly logger = new Logger(DunningCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dunning: DunningService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 4 * * *')
  async sweep(): Promise<void> {
    const steps = await this.dunning.getSteps();
    if (steps.length === 0) return;

    const terms = await this.prisma.customerCreditTerm.findMany({
      select: { customerId: true, paymentTermDays: true },
    });
    if (terms.length === 0) return;
    const termByCustomer = new Map(terms.map((t) => [t.customerId, t.paymentTermDays]));

    const candidates = await this.prisma.order.findMany({
      where: {
        contactId: { in: [...termByCustomer.keys()] },
        status: { notIn: ['CANCELLED', 'RETURNED'] },
        payments: { none: { status: 'PAID' } },
      },
      select: { id: true, contactId: true, placedAt: true },
    });

    const now = Date.now();
    let sent = 0;
    for (const order of candidates) {
      if (!order.contactId) continue;
      const paymentTermDays = termByCustomer.get(order.contactId) ?? 30;
      const dueAt = order.placedAt.getTime() + paymentTermDays * DAY_MS;
      const daysOverdue = Math.floor((now - dueAt) / DAY_MS);
      if (daysOverdue < 0) continue;

      for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
        const step = steps[stepIndex];
        if (daysOverdue < step.daysOverdue) continue;

        try {
          await this.prisma.dunningEvent.create({ data: { orderId: order.id, stepIndex, sentAt: new Date() } });
        } catch {
          // Unique(orderId, stepIndex) already exists — this step already
          // sent, the exact idempotency guard a re-run of this sweep needs.
          continue;
        }

        await this.sendStep(order.id, order.contactId, step.templateKey);
        sent += 1;
      }
    }

    if (sent > 0) this.logger.log(`Dunning: sent ${sent} step(s) across ${candidates.length} candidate order(s).`);
  }

  /** "Audience is a capability" — resolves the recipient from the customer's own Contact record, never a hardcoded address. */
  private async sendStep(orderId: string, customerId: string, templateKey: string): Promise<void> {
    const contact = await this.prisma.contact.findUnique({
      where: { id: customerId },
      select: { name: true, email: true, phoneE164: true },
    });
    if (!contact || (!contact.email && !contact.phoneE164)) {
      this.logger.warn(`Dunning step ${templateKey} for order ${orderId} has no reachable contact — recorded, not sent.`);
      return;
    }

    await this.notifications.send({
      template: templateKey,
      recipient: { name: contact.name, email: contact.email, phone: contact.phoneE164 },
      subject: 'A payment on your account is overdue',
      body: `Order ${orderId} is now overdue. Please arrange payment at your earliest convenience.`,
      data: { orderId },
    });
  }
}
