import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';

export interface StatementLine {
  date: Date;
  type: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE';
  reference: string;
  amountMinor: number;
  runningBalanceMinor: number;
}

export interface CustomerStatement {
  customerId: string;
  periodStart: Date;
  periodEnd: Date;
  openingBalanceMinor: number;
  lines: StatementLine[];
  closingBalanceMinor: number;
}

interface RawMovement {
  date: Date;
  type: StatementLine['type'];
  reference: string;
  /** Positive = increases what the customer owes; negative = reduces it. */
  amountMinor: number;
}

/**
 * 145-receivables-credit-limits-dunning.md (WO-145.5) — a read-model over
 * rows that already exist: `Order` (the "invoice" a credit customer is
 * billed on — see receivables.prisma's own file header on why this document
 * ties to `Order`, not the tradingpartners `Invoice`), `Payment`, and
 * `CreditNote`. Never a stored/cached document — recomputed on every call,
 * the identical "read-model over existing rows" discipline this doc's own
 * text asks for. Bounded by its own stated period (`periodStart`/
 * `periodEnd`), never an unbounded full-history scan — "the hundred-
 * thousandth row" lens.
 */
@Injectable()
export class StatementsService {
  constructor(private readonly prisma: PrismaService) {}

  async customerStatement(customerId: string, periodStart: Date, periodEnd: Date): Promise<CustomerStatement> {
    const [ordersBefore, paymentsBefore, notesBefore, ordersIn, paymentsIn, notesIn] = await Promise.all([
      this.orders(customerId, { lt: periodStart }),
      this.payments(customerId, { lt: periodStart }),
      this.creditNotes(customerId, { lt: periodStart }),
      this.orders(customerId, { gte: periodStart, lt: periodEnd }),
      this.payments(customerId, { gte: periodStart, lt: periodEnd }),
      this.creditNotes(customerId, { gte: periodStart, lt: periodEnd }),
    ]);

    const openingBalanceMinor = [...ordersBefore, ...paymentsBefore, ...notesBefore].reduce((sum, m) => sum + m.amountMinor, 0);

    const periodMovements = [...ordersIn, ...paymentsIn, ...notesIn].sort((a, b) => a.date.getTime() - b.date.getTime());

    let running = openingBalanceMinor;
    const lines: StatementLine[] = periodMovements.map((m) => {
      running += m.amountMinor;
      return { date: m.date, type: m.type, reference: m.reference, amountMinor: m.amountMinor, runningBalanceMinor: running };
    });

    return {
      customerId,
      periodStart,
      periodEnd,
      openingBalanceMinor,
      lines,
      closingBalanceMinor: running,
    };
  }

  private async orders(customerId: string, range: { lt?: Date; gte?: Date }): Promise<RawMovement[]> {
    const rows = await this.prisma.order.findMany({
      where: { contactId: customerId, placedAt: range, status: { notIn: ['CANCELLED'] } },
      select: { id: true, number: true, placedAt: true, grandTotal: true },
    });
    return rows.map((o) => ({ date: o.placedAt, type: 'INVOICE', reference: o.number, amountMinor: o.grandTotal }));
  }

  private async payments(customerId: string, range: { lt?: Date; gte?: Date }): Promise<RawMovement[]> {
    const rows = await this.prisma.payment.findMany({
      where: { status: 'PAID', paidAt: range, order: { contactId: customerId } },
      select: { id: true, paidAt: true, amount: true },
    });
    return rows
      .filter((p) => p.paidAt)
      .map((p) => ({ date: p.paidAt as Date, type: 'PAYMENT', reference: p.id, amountMinor: -p.amount }));
  }

  private async creditNotes(customerId: string, range: { lt?: Date; gte?: Date }): Promise<RawMovement[]> {
    const rows = await this.prisma.creditNote.findMany({
      where: { customerId, status: { in: ['ISSUED', 'APPLIED'] }, issuedAt: range },
      select: { id: true, number: true, issuedAt: true, amountMinor: true },
    });
    return rows
      .filter((n) => n.issuedAt)
      .map((n) => ({ date: n.issuedAt as Date, type: 'CREDIT_NOTE', reference: n.number, amountMinor: -n.amountMinor }));
  }
}
