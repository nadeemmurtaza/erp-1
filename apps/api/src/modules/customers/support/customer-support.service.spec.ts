import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { AuditService } from '../../../core/audit/audit.service';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { CrmService } from '../crm/crm.service';
import { CustomerSupportService } from './customer-support.service';
import { SupportHandlersService } from './support-handlers.service';

/**
 * tasks-notifications-support/148-external-customer-support-portal.md
 * (WO-148.2) — covers the doc's own Acceptance criteria: a customer can
 * view/reply only to their own tickets, a staff reply notifies the
 * customer through their own contact channel, and AWAITING_CUSTOMER vs.
 * IN_PROGRESS stay distinguishable.
 */
describe('CustomerSupportService', () => {
  let service: CustomerSupportService;
  let prisma: any;
  let crm: any;
  let handlers: any;
  let notifications: any;
  let audit: any;

  const actor = (id: string, permissions: string[] = []): AuthenticatedUser =>
    ({ id, roles: [], permissions, email: null, phone: null } as AuthenticatedUser);

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      contact: { findUnique: jest.fn(), findMany: jest.fn() },
      customerSupportTicket: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      customerSupportMessage: { create: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    crm = { upsertContact: jest.fn() };
    handlers = { holdsPermission: jest.fn(), notifyHandlers: jest.fn() };
    notifications = { send: jest.fn() };
    audit = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerSupportService,
        { provide: PrismaService, useValue: prisma },
        { provide: CrmService, useValue: crm },
        { provide: SupportHandlersService, useValue: handlers },
        { provide: NotificationsService, useValue: notifications },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(CustomerSupportService);
  });

  describe('raise', () => {
    it('refuses an empty subject, category or opening message', async () => {
      await expect(service.raise({ userId: 'u1', subject: '', category: 'ORDER', body: 'hi' })).rejects.toThrow(BadRequestException);
      await expect(service.raise({ userId: 'u1', subject: 'Help', category: '', body: 'hi' })).rejects.toThrow(BadRequestException);
      await expect(service.raise({ userId: 'u1', subject: 'Help', category: 'ORDER', body: '' })).rejects.toThrow(BadRequestException);
    });

    it('finds-or-creates the caller\'s own Contact, creates the ticket and its opening message, and notifies handlers', async () => {
      prisma.user.findUnique.mockResolvedValue({ firstName: 'Aisha', lastName: 'Khan', email: 'aisha@x.test', phone: null });
      crm.upsertContact.mockResolvedValue({ id: 'contact1' });
      prisma.customerSupportTicket.create.mockResolvedValue({ id: 'ct1', subject: 'Where is my parcel', priority: 'NORMAL' });

      const ticket = await service.raise({ userId: 'u1', subject: 'Where is my parcel', category: 'ORDER', body: 'It has not arrived' });

      expect(crm.upsertContact).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Aisha Khan', email: 'aisha@x.test', userId: 'u1', source: 'support-portal' }),
      );
      expect(prisma.customerSupportMessage.create).toHaveBeenCalledWith({
        data: { ticketId: 'ct1', authorType: 'CUSTOMER', contactId: 'contact1', body: 'It has not arrived' },
      });
      expect(handlers.notifyHandlers).toHaveBeenCalledWith(
        expect.objectContaining({ ticketId: 'ct1', template: 'support.customer_ticket_raised' }),
      );
      expect(ticket.id).toBe('ct1');
    });
  });

  describe('replyAsCustomer', () => {
    it('refuses a customer with no Contact of their own', async () => {
      prisma.contact.findUnique.mockResolvedValue(null);
      await expect(service.replyAsCustomer('ct1', 'u1', 'hello')).rejects.toThrow(NotFoundException);
    });

    it('refuses a reply on a ticket belonging to another customer', async () => {
      prisma.contact.findUnique.mockResolvedValue({ id: 'contact1' });
      prisma.customerSupportTicket.findUnique.mockResolvedValue({ id: 'ct1', contactId: 'someone-elses-contact', status: 'OPEN' });
      await expect(service.replyAsCustomer('ct1', 'u1', 'hello')).rejects.toThrow(NotFoundException);
    });

    it('resumes the SLA clock (AWAITING_CUSTOMER -> IN_PROGRESS) when the customer replies', async () => {
      prisma.contact.findUnique.mockResolvedValue({ id: 'contact1' });
      prisma.customerSupportTicket.findUnique.mockResolvedValue({ id: 'ct1', contactId: 'contact1', status: 'AWAITING_CUSTOMER' });
      prisma.customerSupportMessage.create.mockResolvedValue({ id: 'm1' });

      await service.replyAsCustomer('ct1', 'u1', 'Here is more info');

      expect(prisma.customerSupportTicket.update).toHaveBeenCalledWith({ where: { id: 'ct1' }, data: { status: 'IN_PROGRESS' } });
    });

    it('does not touch status when not AWAITING_CUSTOMER', async () => {
      prisma.contact.findUnique.mockResolvedValue({ id: 'contact1' });
      prisma.customerSupportTicket.findUnique.mockResolvedValue({ id: 'ct1', contactId: 'contact1', status: 'IN_PROGRESS' });
      prisma.customerSupportMessage.create.mockResolvedValue({ id: 'm1' });

      await service.replyAsCustomer('ct1', 'u1', 'Still waiting');

      expect(prisma.customerSupportTicket.update).not.toHaveBeenCalled();
    });
  });

  describe('replyAsStaff', () => {
    it('refuses staff with no relation to the ticket (not assigned, no view_all)', async () => {
      prisma.customerSupportTicket.findUnique.mockResolvedValue({ id: 'ct1', contactId: 'contact1', assignedToUserId: 'other-handler', messages: [] });
      await expect(service.replyAsStaff('ct1', 'hello', actor('bystander'))).rejects.toThrow(NotFoundException);
    });

    it('notifies the customer through their own resolved contact channel', async () => {
      prisma.customerSupportTicket.findUnique.mockResolvedValue({
        id: 'ct1',
        contactId: 'contact1',
        assignedToUserId: 'handler1',
        subject: 'Where is my parcel',
        messages: [],
      });
      prisma.customerSupportMessage.create.mockResolvedValue({ id: 'm1' });
      prisma.contact.findUnique.mockResolvedValue({ userId: 'u1', email: 'aisha@x.test', phone: null, name: 'Aisha Khan' });

      await service.replyAsStaff('ct1', 'It shipped yesterday', actor('handler1'));

      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'support.customer_ticket_reply',
          recipient: expect.objectContaining({ userId: 'u1', email: 'aisha@x.test', name: 'Aisha Khan' }),
        }),
      );
    });
  });

  describe('assign', () => {
    it('refuses assigning to someone who does not hold support.tickets.handle', async () => {
      prisma.customerSupportTicket.findUnique.mockResolvedValue({ assignedToUserId: null });
      handlers.holdsPermission.mockResolvedValue(false);
      await expect(service.assign('ct1', 'nobody', 'admin1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('transition', () => {
    it('allows OPEN -> IN_PROGRESS by the assignee', async () => {
      prisma.customerSupportTicket.findUnique.mockResolvedValue({ status: 'OPEN', assignedToUserId: 'handler1', contactId: 'contact1' });
      prisma.customerSupportTicket.update.mockResolvedValue({ status: 'IN_PROGRESS' });

      await service.transition('ct1', 'IN_PROGRESS', actor('handler1'));

      expect(prisma.customerSupportTicket.update).toHaveBeenCalledWith({ where: { id: 'ct1' }, data: { status: 'IN_PROGRESS' } });
    });

    it('allows the assignee to move IN_PROGRESS -> AWAITING_CUSTOMER', async () => {
      prisma.customerSupportTicket.findUnique.mockResolvedValue({ status: 'IN_PROGRESS', assignedToUserId: 'handler1', contactId: 'contact1' });
      prisma.customerSupportTicket.update.mockResolvedValue({ status: 'AWAITING_CUSTOMER' });

      await expect(service.transition('ct1', 'AWAITING_CUSTOMER', actor('handler1'))).resolves.toBeDefined();
    });

    it('refuses a bystander staff member with no relation to the ticket', async () => {
      prisma.customerSupportTicket.findUnique.mockResolvedValue({ status: 'OPEN', assignedToUserId: 'handler1', contactId: 'contact1' });
      await expect(service.transition('ct1', 'IN_PROGRESS', actor('other-staff'))).rejects.toThrow(ForbiddenException);
    });

    it('allows the customer themselves to reopen (RESOLVED -> IN_PROGRESS)', async () => {
      prisma.customerSupportTicket.findUnique.mockResolvedValue({ status: 'RESOLVED', assignedToUserId: 'handler1', contactId: 'contact1' });
      prisma.contact.findUnique.mockResolvedValue({ id: 'contact1' });
      prisma.customerSupportTicket.update.mockResolvedValue({ status: 'IN_PROGRESS' });

      await service.transition('ct1', 'IN_PROGRESS', actor('customer-u1'));

      expect(prisma.customerSupportTicket.update).toHaveBeenCalledWith({ where: { id: 'ct1' }, data: { status: 'IN_PROGRESS', resolvedAt: null } });
    });

    it('refuses a different customer attempting to reopen', async () => {
      prisma.customerSupportTicket.findUnique.mockResolvedValue({ status: 'RESOLVED', assignedToUserId: 'handler1', contactId: 'contact1' });
      prisma.contact.findUnique.mockResolvedValue({ id: 'some-other-contact' });
      await expect(service.transition('ct1', 'IN_PROGRESS', actor('other-customer'))).rejects.toThrow(ForbiddenException);
    });

    it('refuses skipping a stage (OPEN -> RESOLVED)', async () => {
      prisma.customerSupportTicket.findUnique.mockResolvedValue({ status: 'OPEN', assignedToUserId: 'handler1', contactId: 'contact1' });
      await expect(service.transition('ct1', 'RESOLVED', actor('handler1'))).rejects.toThrow(BadRequestException);
    });
  });

  describe('listForStaff / listMine visibility', () => {
    it('scopes the staff list to assignedToUserId without view_all', async () => {
      prisma.customerSupportTicket.findMany.mockResolvedValue([]);
      await service.listForStaff(actor('handler1'));
      const where = prisma.customerSupportTicket.findMany.mock.calls[0][0].where;
      expect(where.assignedToUserId).toBe('handler1');
    });

    it('applies no scoping for a view_all holder', async () => {
      prisma.customerSupportTicket.findMany.mockResolvedValue([]);
      await service.listForStaff(actor('admin1', ['support.tickets.view_all']));
      const where = prisma.customerSupportTicket.findMany.mock.calls[0][0].where;
      expect(where.assignedToUserId).toBeUndefined();
    });

    it('batches the Contact name lookup for every row in one query', async () => {
      prisma.customerSupportTicket.findMany.mockResolvedValue([
        { id: 'ct1', contactId: 'contact1' },
        { id: 'ct2', contactId: 'contact2' },
      ]);
      prisma.contact.findMany.mockResolvedValue([
        { id: 'contact1', name: 'Amina' },
        { id: 'contact2', name: 'Bilal' },
      ]);
      const rows = await service.listForStaff(actor('admin1', ['support.tickets.view_all']));
      expect(prisma.contact.findMany).toHaveBeenCalledTimes(1);
      expect(rows).toEqual([
        { id: 'ct1', contactId: 'contact1', contactName: 'Amina' },
        { id: 'ct2', contactId: 'contact2', contactName: 'Bilal' },
      ]);
    });

    it('listMine returns nothing for a customer with no Contact yet', async () => {
      prisma.contact.findUnique.mockResolvedValue(null);
      await expect(service.listMine('u1')).resolves.toEqual([]);
    });
  });

  describe('getForCustomer', () => {
    it('404s for a ticket outside the caller\'s own Contact, rather than 403ing', async () => {
      prisma.contact.findUnique.mockResolvedValue({ id: 'contact1' });
      prisma.customerSupportTicket.findUnique.mockResolvedValue({ id: 'ct1', contactId: 'someone-elses-contact', messages: [] });
      await expect(service.getForCustomer('ct1', 'u1')).rejects.toThrow(NotFoundException);
    });
  });
});
