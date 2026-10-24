import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { AuditService } from '../../../core/audit/audit.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SupportHandlersService } from './support-handlers.service';
import { SupportTicketsService } from './support-tickets.service';

/**
 * tasks-notifications-support/64-help-desk-support-ticketing.md (WO-64.2)
 * — covers the doc's own Acceptance criteria directly: visibility, the
 * forward-only state machine with its one allowed backward move, and
 * per-instance transition authority.
 */
describe('SupportTicketsService', () => {
  let service: SupportTicketsService;
  let prisma: any;
  let handlers: any;
  let audit: any;

  const actor = (id: string, permissions: string[] = []): AuthenticatedUser =>
    ({ id, roles: [], permissions, email: null, phone: null } as AuthenticatedUser);

  beforeEach(async () => {
    prisma = {
      supportTicket: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      ticketMessage: { create: jest.fn() },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    handlers = { holdsPermission: jest.fn(), notifyHandlers: jest.fn() };
    audit = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportTicketsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SupportHandlersService, useValue: handlers },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(SupportTicketsService);
  });

  describe('create', () => {
    it('refuses an empty subject or category', async () => {
      await expect(service.create({ raisedByUserId: 'u1', subject: '', category: 'IT' })).rejects.toThrow(BadRequestException);
      await expect(service.create({ raisedByUserId: 'u1', subject: 'Broken laptop', category: '' })).rejects.toThrow(BadRequestException);
    });

    it('audits the raise and delegates handler notification to SupportHandlersService', async () => {
      prisma.supportTicket.create.mockResolvedValue({ id: 't1', subject: 'Broken laptop', priority: 'NORMAL' });

      await service.create({ raisedByUserId: 'u1', subject: 'Broken laptop', category: 'IT' });

      expect(handlers.notifyHandlers).toHaveBeenCalledWith({
        ticketId: 't1',
        subject: 'Broken laptop',
        priorityLabel: 'normal',
        template: 'support.ticket_raised',
      });
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'support.ticket.raised', entityId: 't1' }));
    });
  });

  describe('get/list visibility', () => {
    const ticket = { id: 't1', raisedByUserId: 'raiser1', assignedToUserId: 'handler1', messages: [] };

    it('is visible to the raiser, enriched with resolved names', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue(ticket);
      prisma.user.findMany.mockResolvedValue([
        { id: 'raiser1', firstName: 'R', lastName: 'One', email: 'r@x.test' },
        { id: 'handler1', firstName: 'H', lastName: 'One', email: 'h@x.test' },
      ]);

      const result = await service.get('t1', actor('raiser1'));

      expect(result.raisedByName).toBe('R One');
      expect(result.assignedToName).toBe('H One');
    });

    it('is visible to the assignee', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue(ticket);
      prisma.user.findMany.mockResolvedValue([]);
      await expect(service.get('t1', actor('handler1'))).resolves.toMatchObject({ id: 't1' });
    });

    it('is visible to a support.tickets.view_all holder', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue(ticket);
      prisma.user.findMany.mockResolvedValue([]);
      await expect(service.get('t1', actor('someone-else', ['support.tickets.view_all']))).resolves.toMatchObject({ id: 't1' });
    });

    it('404s for anyone else, rather than 403ing', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue(ticket);
      await expect(service.get('t1', actor('bystander'))).rejects.toThrow(NotFoundException);
    });

    it('list scopes to own/assigned tickets without view_all', async () => {
      prisma.supportTicket.findMany.mockResolvedValue([]);
      await service.list(actor('u1'));
      const where = prisma.supportTicket.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([{ raisedByUserId: 'u1' }, { assignedToUserId: 'u1' }]);
    });

    it('list applies no OR scoping for a view_all holder', async () => {
      prisma.supportTicket.findMany.mockResolvedValue([]);
      await service.list(actor('u1', ['support.tickets.view_all']));
      const where = prisma.supportTicket.findMany.mock.calls[0][0].where;
      expect(where.OR).toBeUndefined();
    });
  });

  describe('reply', () => {
    it('refuses an empty body', async () => {
      await expect(service.reply('t1', '', actor('u1'))).rejects.toThrow(BadRequestException);
    });

    it('refuses replying on a ticket outside the caller\'s own visibility', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({ id: 't1', raisedByUserId: 'raiser1', assignedToUserId: null, messages: [] });
      await expect(service.reply('t1', 'hello', actor('bystander'))).rejects.toThrow(NotFoundException);
    });

    it('creates a message when visible', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({ id: 't1', raisedByUserId: 'raiser1', assignedToUserId: null, messages: [] });
      prisma.ticketMessage.create.mockResolvedValue({ id: 'm1' });

      await service.reply('t1', 'hello', actor('raiser1'));

      expect(prisma.ticketMessage.create).toHaveBeenCalledWith({ data: { ticketId: 't1', authorId: 'raiser1', body: 'hello' } });
    });
  });

  describe('assign', () => {
    it('refuses assigning to someone who does not hold support.tickets.handle', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({ assignedToUserId: null });
      handlers.holdsPermission.mockResolvedValue(false);

      await expect(service.assign('t1', 'nobody', 'admin1')).rejects.toThrow(BadRequestException);
    });

    it('assigns and audits old/new value', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({ assignedToUserId: 'old-handler' });
      handlers.holdsPermission.mockResolvedValue(true);
      prisma.supportTicket.update.mockResolvedValue({ id: 't1', assignedToUserId: 'new-handler' });

      await service.assign('t1', 'new-handler', 'admin1');

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'support.ticket.assigned', data: { from: 'old-handler', to: 'new-handler' } }),
      );
    });
  });

  describe('transition', () => {
    it('allows OPEN -> IN_PROGRESS by the assignee', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({ status: 'OPEN', assignedToUserId: 'handler1', raisedByUserId: 'raiser1' });
      prisma.supportTicket.update.mockResolvedValue({ status: 'IN_PROGRESS' });

      await service.transition('t1', 'IN_PROGRESS', actor('handler1'));

      expect(prisma.supportTicket.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'IN_PROGRESS' } });
    });

    it('refuses a bystander with no relation to the ticket', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({ status: 'OPEN', assignedToUserId: 'handler1', raisedByUserId: 'raiser1' });
      await expect(service.transition('t1', 'IN_PROGRESS', actor('bystander'))).rejects.toThrow(ForbiddenException);
    });

    it('refuses skipping a stage (OPEN -> RESOLVED)', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({ status: 'OPEN', assignedToUserId: 'handler1', raisedByUserId: 'raiser1' });
      await expect(service.transition('t1', 'RESOLVED', actor('handler1'))).rejects.toThrow(BadRequestException);
    });

    it('sets resolvedAt on IN_PROGRESS -> RESOLVED', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({ status: 'IN_PROGRESS', assignedToUserId: 'handler1', raisedByUserId: 'raiser1' });
      prisma.supportTicket.update.mockResolvedValue({ status: 'RESOLVED' });

      await service.transition('t1', 'RESOLVED', actor('handler1'));

      expect(prisma.supportTicket.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'RESOLVED', resolvedAt: expect.any(Date) } });
    });

    it('refuses CLOSED -> anything', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({ status: 'CLOSED', assignedToUserId: 'handler1', raisedByUserId: 'raiser1' });
      await expect(service.transition('t1', 'IN_PROGRESS', actor('handler1'))).rejects.toThrow(BadRequestException);
    });

    it('allows the requester to reopen (RESOLVED -> IN_PROGRESS), clearing resolvedAt', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({ status: 'RESOLVED', assignedToUserId: 'handler1', raisedByUserId: 'raiser1' });
      prisma.supportTicket.update.mockResolvedValue({ status: 'IN_PROGRESS' });

      await service.transition('t1', 'IN_PROGRESS', actor('raiser1'));

      expect(prisma.supportTicket.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'IN_PROGRESS', resolvedAt: null } });
    });

    it('refuses the requester reopening on any OTHER backward move', async () => {
      // RESOLVED -> OPEN is not even a legal transition at all
      prisma.supportTicket.findUnique.mockResolvedValue({ status: 'RESOLVED', assignedToUserId: 'handler1', raisedByUserId: 'raiser1' });
      await expect(service.transition('t1', 'OPEN', actor('raiser1'))).rejects.toThrow(BadRequestException);
    });

    it('a support.tickets.reassign holder may act on any ticket', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({ status: 'OPEN', assignedToUserId: 'handler1', raisedByUserId: 'raiser1' });
      prisma.supportTicket.update.mockResolvedValue({ status: 'IN_PROGRESS' });

      await expect(service.transition('t1', 'IN_PROGRESS', actor('admin1', ['support.tickets.reassign']))).resolves.toBeDefined();
    });
  });
});
