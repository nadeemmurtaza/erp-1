import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { EventBusService } from '../../../core/events/event-bus.service';
import { DomainEvent } from '../../../core/events/domain-events';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { AuditService } from '../../../core/audit/audit.service';
import type { CustomerCreditTerm } from '../../../core/prisma/client';
import { SetCreditTermDto } from './dto/receivables.dto';

export interface CreditAvailability {
  allowed: boolean;
  availableMinor: number;
  reason?: string;
}

/**
 * 145-receivables-credit-limits-dunning.md (WO-145.3) — a policy row,
 * checked at the one place a sale can be refused for it. Never queries
 * `chart-of-accounts.ts`/`ACCOUNT_CODE` directly (module-boundary DEPTH
 * rule: those are `accounting`'s own internals) — resolves "the Accounts
 * Receivable account" the same way `reports.service.ts` already does,
 * by its `type`/`isControl` flags, the one other module reaches for an
 * account it did not create.
 */
@Injectable()
export class CreditTermsService {
  private readonly logger = new Logger(CreditTermsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async findOne(customerId: string): Promise<CustomerCreditTerm | null> {
    return this.prisma.customerCreditTerm.findUnique({ where: { customerId } });
  }

  async findMany(filters: { isOnHold?: boolean } = {}): Promise<CustomerCreditTerm[]> {
    return this.prisma.customerCreditTerm.findMany({
      where: { isOnHold: filters.isOnHold },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * "Authority and blast radius" — a credit-limit increase or a hold is a
   * quiet, high-blast-radius change: `AuditService.record()` carries the
   * old AND new `creditLimitMinor`/`isOnHold`, not just a "changed" flag.
   * `isOnHold` turning true additionally fires `CreditHoldApplied`,
   * resolved to `finance.credit-terms.manage` holders — "Audience is a
   * capability, not an address."
   */
  async setTerm(customerId: string, dto: SetCreditTermDto, actorId: string): Promise<CustomerCreditTerm> {
    const existing = await this.prisma.customerCreditTerm.findUnique({ where: { customerId } });
    const wasOnHold = existing?.isOnHold ?? false;

    const term = await this.prisma.customerCreditTerm.upsert({
      where: { customerId },
      create: {
        customerId,
        creditLimitMinor: dto.creditLimitMinor,
        paymentTermDays: dto.paymentTermDays ?? 30,
        isOnHold: dto.isOnHold ?? false,
      },
      update: {
        creditLimitMinor: dto.creditLimitMinor,
        paymentTermDays: dto.paymentTermDays,
        isOnHold: dto.isOnHold,
      },
    });

    await this.audit.record({
      actorId,
      action: 'receivables.credit_term_set',
      entity: 'CustomerCreditTerm',
      entityId: customerId,
      data: {
        before: existing ? { creditLimitMinor: existing.creditLimitMinor, isOnHold: existing.isOnHold } : null,
        after: { creditLimitMinor: term.creditLimitMinor, isOnHold: term.isOnHold },
      },
    });

    if (term.isOnHold && !wasOnHold) {
      await this.events.publish(DomainEvent.CreditHoldApplied, { customerId, appliedByUserId: actorId });
      await this.notifyHoldApplied(customerId);
    }

    return term;
  }

  /**
   * `outstandingMinor` reads the SAME Accounts Receivable ledger
   * `gl-reports.service.ts`'s `agedReceivables()` FIFO-ages, filtered to
   * this one customer, so it reflects every posted sale, receipt and
   * CreditNote against them — never a second, parallel balance that could
   * drift from the report a manager actually reads. `checkCreditAvailable`
   * is a pure read: it takes inputs and returns an outcome, no
   * `prisma.<x>.create/update` and no `publish(` anywhere in it — the exact
   * function a checkout screen calls to preview "can this order go
   * through" before committing it (this doc's own "Dry run before live").
   */
  async checkCreditAvailable(customerId: string, newOrderAmountMinor: number): Promise<CreditAvailability> {
    const term = await this.prisma.customerCreditTerm.findUnique({ where: { customerId } });
    if (!term) {
      // "The failure path" — a client who never opted into credit terms
      // never has an order silently blocked by a check they never
      // configured.
      return { allowed: true, availableMinor: Number.POSITIVE_INFINITY };
    }
    if (term.isOnHold) {
      return { allowed: false, availableMinor: 0, reason: 'This customer is on a credit hold.' };
    }

    const outstandingMinor = await this.outstandingReceivableMinor(customerId);
    const availableMinor = term.creditLimitMinor - outstandingMinor;
    const allowed = outstandingMinor + newOrderAmountMinor <= term.creditLimitMinor;

    return {
      allowed,
      availableMinor,
      reason: allowed ? undefined : `This order would put the customer ${(outstandingMinor + newOrderAmountMinor) - term.creditLimitMinor} paisa over their credit limit.`,
    };
  }

  private async outstandingReceivableMinor(customerId: string): Promise<number> {
    const account = await this.prisma.account.findFirst({ where: { type: 'ASSET', isControl: true } });
    if (!account) return 0; // accounting off — nothing posted, nothing outstanding by this measure

    const result = await this.prisma.journalLine.aggregate({
      where: { accountId: account.id, contactId: customerId, entry: { status: 'POSTED' } },
      _sum: { debitMinor: true, creditMinor: true },
    });
    return (result._sum.debitMinor ?? 0) - (result._sum.creditMinor ?? 0);
  }

  private async notifyHoldApplied(customerId: string): Promise<void> {
    const holders = await this.prisma.user.findMany({
      where: {
        roleAssignments: {
          some: { role: { grants: { some: { permission: { key: 'finance.credit-terms.manage' } } } } },
        },
      },
      select: { id: true, email: true, firstName: true },
    });
    if (holders.length === 0) {
      this.logger.warn(`Credit hold applied for customer ${customerId}, but nobody holds finance.credit-terms.manage — no one was notified.`);
      return;
    }

    const contact = await this.prisma.contact.findUnique({ where: { id: customerId }, select: { name: true } });
    await Promise.all(
      holders.map((holder) =>
        this.notifications.send({
          template: 'receivables.credit_hold_applied',
          recipient: { userId: holder.id, email: holder.email, name: holder.firstName },
          subject: 'Credit hold applied',
          body: `A credit hold was applied to ${contact?.name ?? customerId}. Their account is blocked from further on-account orders until the hold is lifted.`,
        }),
      ),
    );
  }
}
