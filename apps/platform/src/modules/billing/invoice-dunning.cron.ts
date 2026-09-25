import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PlatformNotificationsService } from '../../core/notifications/notifications.service';

/**
 * doc 153 §3 — "this pricing model is, structurally, the platform's own
 * accounts-receivable problem", reusing doc 145's own Invoice/aging/
 * dunning DESIGN PATTERN one level up (see ADR-037: the shape, not
 * apps/api's actual CreditNote/dunning code, which cannot be imported
 * across the app boundary). Scoped to what doc 153's own acceptance
 * criteria actually require: ONE overdue reminder per invoice, idempotent
 * via `dunningReminderSentAt`. A multi-stage escalation ladder, automatic
 * suspension for non-payment, or a tenant-facing statement page are named,
 * not built — see ADR-037's own "out of scope" note.
 */
@Injectable()
export class InvoiceDunningCron {
  private readonly logger = new Logger(InvoiceDunningCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: PlatformNotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async run(): Promise<void> {
    const overdue = await this.prisma.platformInvoice.findMany({
      where: {
        status: 'ISSUED',
        dueAt: { lt: new Date() },
        dunningReminderSentAt: null,
      },
      include: { tenant: true },
    });

    for (const invoice of overdue) {
      await this.notifications.send(
        invoice.tenant.billingContactEmail,
        `Invoice overdue — ${invoice.tenant.legalName}`,
        `Your invoice for ${invoice.periodStart.toDateString()}–${invoice.periodEnd.toDateString()} (${(invoice.amountMinor / 100).toFixed(2)}) was due ${invoice.dueAt?.toDateString()} and is still unpaid.`,
      );
      await this.prisma.platformInvoice.update({
        where: { id: invoice.id },
        data: { dunningReminderSentAt: new Date() },
      });
    }

    if (overdue.length > 0) this.logger.log(`Dunning sweep: ${overdue.length} overdue invoice(s) reminded`);
  }
}
