import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent, type ShipmentReturnedToOriginPayload } from '../../../core/events/domain-events';
import { OnDomainEvent } from '../../../core/events/on-domain-event.decorator';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { FinanceService } from './finance.service';

/**
 * WO-6.7 — "Record the RTO cost (both legs of courier charge) as a direct
 * cost." Posted as an Expense against the existing seeded `courier_charges`
 * category (isDirect: true, seed.ts), reusing the whole Expense -> GL
 * pipeline (ExpenseRecorded -> accounting's posting-rules.subscriber.ts)
 * rather than inventing a second posting path. Lives in `finance` so
 * calling FinanceService.createExpense() is a same-module call — fulfilment
 * never imports FinanceService.
 */
@Injectable()
export class RtoExpenseListener {
  private readonly logger = new Logger(RtoExpenseListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
  ) {}

  @OnDomainEvent(DomainEvent.ShipmentReturnedToOrigin)
  async onShipmentReturnedToOrigin(payload: ShipmentReturnedToOriginPayload): Promise<void> {
    if (payload.courierChargeMinor <= 0) return;

    const category = await this.prisma.expenseCategory.findUnique({ where: { key: 'courier_charges' } });
    if (!category) {
      this.logger.error('No "courier_charges" expense category — cannot post the RTO cost.');
      return;
    }

    await this.finance.createExpense(
      {
        categoryId: category.id,
        amount: payload.courierChargeMinor,
        description: `RTO — order ${payload.orderNumber}, shipment ${payload.shipmentId}`,
        incurredAt: payload.rtoAt,
        reference: payload.orderNumber,
      },
      null,
    );
  }
}
