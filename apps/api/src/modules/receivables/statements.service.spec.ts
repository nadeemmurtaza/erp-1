import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { StatementsService } from './statements.service';

describe('StatementsService — WO-145.5', () => {
  let service: StatementsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      order: { findMany: jest.fn().mockResolvedValue([]) },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      creditNote: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [StatementsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(StatementsService);
  });

  it('opening balance sums every movement before the period, closing balance sums the running total through it', async () => {
    prisma.order.findMany
      .mockResolvedValueOnce([{ id: 'o0', number: 'YSN-0000', placedAt: new Date('2026-01-01'), grandTotal: 5_000 }]) // before period
      .mockResolvedValueOnce([{ id: 'o1', number: 'YSN-0001', placedAt: new Date('2026-02-10'), grandTotal: 2_000 }]); // in period
    prisma.payment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'pay1', paidAt: new Date('2026-02-15'), amount: 1_000 }]);
    prisma.creditNote.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const statement = await service.customerStatement('contact1', new Date('2026-02-01'), new Date('2026-03-01'));

    expect(statement.openingBalanceMinor).toBe(5_000);
    expect(statement.lines).toHaveLength(2);
    expect(statement.lines[0]).toMatchObject({ type: 'INVOICE', amountMinor: 2_000, runningBalanceMinor: 7_000 });
    expect(statement.lines[1]).toMatchObject({ type: 'PAYMENT', amountMinor: -1_000, runningBalanceMinor: 6_000 });
    expect(statement.closingBalanceMinor).toBe(6_000);
  });

  it('a CreditNote line reduces the running balance', async () => {
    prisma.order.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prisma.payment.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prisma.creditNote.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'cn1', number: 'CN-2026-0001', issuedAt: new Date('2026-02-05'), amountMinor: 500 }]);

    const statement = await service.customerStatement('contact1', new Date('2026-02-01'), new Date('2026-03-01'));

    expect(statement.lines).toEqual([
      expect.objectContaining({ type: 'CREDIT_NOTE', amountMinor: -500, runningBalanceMinor: -500 }),
    ]);
    expect(statement.closingBalanceMinor).toBe(-500);
  });

  it('an empty period returns opening === closing with no lines', async () => {
    const statement = await service.customerStatement('contact1', new Date('2026-02-01'), new Date('2026-03-01'));
    expect(statement.lines).toEqual([]);
    expect(statement.openingBalanceMinor).toBe(0);
    expect(statement.closingBalanceMinor).toBe(0);
  });
});
