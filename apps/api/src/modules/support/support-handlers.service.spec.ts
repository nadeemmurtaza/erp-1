import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SupportHandlersService } from './support-handlers.service';

/**
 * Shared between doc 64 (internal) and doc 148 (external customer)
 * support tickets — "audience is a capability" resolution and the
 * assignee-eligibility check, one implementation for both.
 */
describe('SupportHandlersService', () => {
  let service: SupportHandlersService;
  let prisma: any;
  let notifications: any;

  beforeEach(async () => {
    prisma = { user: { findMany: jest.fn(), count: jest.fn() } };
    notifications = { send: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportHandlersService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(SupportHandlersService);
  });

  describe('holdsPermission', () => {
    it('is true when the user holds the key through a role grant', async () => {
      prisma.user.count.mockResolvedValue(1);
      await expect(service.holdsPermission('u1', 'support.tickets.handle')).resolves.toBe(true);
    });

    it('is false otherwise', async () => {
      prisma.user.count.mockResolvedValue(0);
      await expect(service.holdsPermission('u1', 'support.tickets.handle')).resolves.toBe(false);
    });
  });

  describe('notifyHandlers', () => {
    it('notifies every current holder of support.tickets.handle, once each', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'h1', email: 'h1@x.test', phone: null, firstName: 'H', lastName: 'One' },
        { id: 'h2', email: 'h2@x.test', phone: null, firstName: 'H', lastName: 'Two' },
      ]);

      await service.notifyHandlers({ ticketId: 't1', subject: 'Broken laptop', priorityLabel: 'normal', template: 'support.ticket_raised' });

      expect(notifications.send).toHaveBeenCalledTimes(2);
      expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ template: 'support.ticket_raised', subject: expect.stringContaining('normal') }));
    });

    it('warns and sends nothing when nobody holds support.tickets.handle', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await service.notifyHandlers({ ticketId: 't1', subject: 'Broken laptop', priorityLabel: 'normal', template: 'support.ticket_raised' });
      expect(notifications.send).not.toHaveBeenCalled();
    });
  });
});
