import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { DunningService } from './dunning.service';
import { DunningCron } from './dunning.cron';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('DunningCron — WO-145.4', () => {
  let cron: DunningCron;
  let prisma: any;
  let dunning: any;
  let notifications: any;

  beforeEach(async () => {
    prisma = {
      customerCreditTerm: { findMany: jest.fn() },
      order: { findMany: jest.fn() },
      dunningEvent: { create: jest.fn() },
      contact: { findUnique: jest.fn() },
    };
    dunning = { getSteps: jest.fn() };
    notifications = { send: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DunningCron,
        { provide: PrismaService, useValue: prisma },
        { provide: DunningService, useValue: dunning },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    cron = module.get(DunningCron);
  });

  it('does nothing when no dunning policy is configured', async () => {
    dunning.getSteps.mockResolvedValue([]);
    await cron.sweep();
    expect(prisma.customerCreditTerm.findMany).not.toHaveBeenCalled();
  });

  it('does nothing when no customer has a credit term', async () => {
    dunning.getSteps.mockResolvedValue([{ daysOverdue: 7, templateKey: 'gentle-reminder' }]);
    prisma.customerCreditTerm.findMany.mockResolvedValue([]);
    await cron.sweep();
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('sends the step for an order overdue past its threshold and records the DunningEvent', async () => {
    dunning.getSteps.mockResolvedValue([{ daysOverdue: 7, templateKey: 'gentle-reminder' }]);
    prisma.customerCreditTerm.findMany.mockResolvedValue([{ customerId: 'contact1', paymentTermDays: 0 }]);
    prisma.order.findMany.mockResolvedValue([
      { id: 'order1', contactId: 'contact1', placedAt: new Date(Date.now() - 10 * DAY_MS) },
    ]);
    prisma.dunningEvent.create.mockResolvedValue({ id: 'de1', orderId: 'order1', stepIndex: 0 });
    prisma.contact.findUnique.mockResolvedValue({ name: 'Sana', email: 'sana@example.com', phoneE164: null });

    await cron.sweep();

    expect(prisma.dunningEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orderId: 'order1', stepIndex: 0 }),
    });
    expect(notifications.send).toHaveBeenCalledTimes(1);
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'gentle-reminder', data: { orderId: 'order1' } }),
    );
  });

  it('never fires the same step twice for the same order — a second sweep is a no-op for that step (Acceptance #3)', async () => {
    dunning.getSteps.mockResolvedValue([{ daysOverdue: 7, templateKey: 'gentle-reminder' }]);
    prisma.customerCreditTerm.findMany.mockResolvedValue([{ customerId: 'contact1', paymentTermDays: 0 }]);
    prisma.order.findMany.mockResolvedValue([
      { id: 'order1', contactId: 'contact1', placedAt: new Date(Date.now() - 10 * DAY_MS) },
    ]);
    prisma.contact.findUnique.mockResolvedValue({ name: 'Sana', email: 'sana@example.com', phoneE164: null });

    // First sweep: the unique(orderId, stepIndex) row does not exist yet.
    prisma.dunningEvent.create.mockResolvedValueOnce({ id: 'de1', orderId: 'order1', stepIndex: 0 });
    await cron.sweep();
    expect(notifications.send).toHaveBeenCalledTimes(1);

    // Second sweep (the watcher's next nightly run): the row already
    // exists, so the real @@unique([orderId, stepIndex]) constraint would
    // reject this create() — simulated here as a rejected promise, exactly
    // the idempotency guard `dunning.cron.ts`'s own try/catch relies on.
    prisma.dunningEvent.create.mockRejectedValueOnce(new Error('Unique constraint failed'));
    await cron.sweep();
    expect(notifications.send).toHaveBeenCalledTimes(1); // still 1 — no second send
  });

  it('does not send a step whose threshold has not been crossed yet', async () => {
    dunning.getSteps.mockResolvedValue([{ daysOverdue: 30, templateKey: 'final-notice' }]);
    prisma.customerCreditTerm.findMany.mockResolvedValue([{ customerId: 'contact1', paymentTermDays: 0 }]);
    prisma.order.findMany.mockResolvedValue([
      { id: 'order1', contactId: 'contact1', placedAt: new Date(Date.now() - 5 * DAY_MS) },
    ]);

    await cron.sweep();

    expect(prisma.dunningEvent.create).not.toHaveBeenCalled();
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('records the step (so a re-run never retries it) even when the customer has no reachable contact, but sends nothing', async () => {
    dunning.getSteps.mockResolvedValue([{ daysOverdue: 7, templateKey: 'gentle-reminder' }]);
    prisma.customerCreditTerm.findMany.mockResolvedValue([{ customerId: 'contact1', paymentTermDays: 0 }]);
    prisma.order.findMany.mockResolvedValue([
      { id: 'order1', contactId: 'contact1', placedAt: new Date(Date.now() - 10 * DAY_MS) },
    ]);
    prisma.dunningEvent.create.mockResolvedValue({ id: 'de1' });
    prisma.contact.findUnique.mockResolvedValue({ name: 'No Contact Info', email: null, phoneE164: null });

    await cron.sweep();

    expect(prisma.dunningEvent.create).toHaveBeenCalledTimes(1);
    expect(notifications.send).not.toHaveBeenCalled();
  });
});
