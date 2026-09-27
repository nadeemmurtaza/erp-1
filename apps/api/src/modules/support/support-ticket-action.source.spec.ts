import { Test, TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { ActionHubRegistryService } from '../../core/action-hub/action-hub-registry.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SupportTicketActionSource } from './support-ticket-action.source';

/**
 * tasks-notifications-support/64-help-desk-support-ticketing.md (WO-64.4)
 * — covers the "grant that ends itself" acceptance criterion: a
 * deactivated (or role-changed) handler's open ticket surfaces for
 * reassignment, proven by a spec simulating exactly that.
 */
describe('SupportTicketActionSource', () => {
  let source: SupportTicketActionSource;
  let prisma: any;
  let settings: any;

  const actor = (permissions: string[]): AuthenticatedUser =>
    ({ id: 'caller1', roles: [], permissions, email: null, phone: null } as AuthenticatedUser);

  beforeEach(async () => {
    prisma = {
      supportTicket: { findMany: jest.fn() },
      user: { findMany: jest.fn() },
    };
    settings = { get: jest.fn().mockResolvedValue(240) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportTicketActionSource,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settings },
        { provide: ActionHubRegistryService, useValue: { register: jest.fn() } },
      ],
    }).compile();

    source = module.get(SupportTicketActionSource);
  });

  it('returns nothing for someone holding neither permission', async () => {
    const items = await source.fetchFor(actor([]));
    expect(items).toEqual([]);
  });

  it('surfaces an unassigned ticket to a support.tickets.handle holder', async () => {
    prisma.supportTicket.findMany.mockResolvedValueOnce([
      { id: 't1', subject: 'Broken laptop', createdAt: new Date(), raisedByUserId: 'raiser1', assignedToUserId: null },
    ]);
    prisma.user.findMany.mockResolvedValueOnce([{ id: 'raiser1', firstName: 'R', lastName: 'One', email: 'r@x.test' }]);

    const items = await source.fetchFor(actor(['support.tickets.handle']));

    expect(items).toHaveLength(1);
    expect(items[0].summary).toContain('Unassigned');
  });

  it('surfaces a ticket assigned to a handler who has since lost support.tickets.handle, only to a reassign holder', async () => {
    prisma.supportTicket.findMany.mockResolvedValueOnce([
      { id: 't2', subject: 'VPN access', createdAt: new Date(), raisedByUserId: 'raiser2', assignedToUserId: 'deactivated1' },
    ]);
    prisma.user.findMany
      .mockResolvedValueOnce([]) // stillHandlers — 'deactivated1' no longer holds support.tickets.handle
      .mockResolvedValueOnce([{ id: 'raiser2', firstName: 'R', lastName: 'Two', email: 'r2@x.test' }]);

    const items = await source.fetchFor(actor(['support.tickets.reassign']));

    expect(items).toHaveLength(1);
    expect(items[0].summary).toContain('Needs reassignment');
    expect(items[0].permission).toBe('support.tickets.reassign');
  });

  it('does not surface a ticket whose assignee still holds support.tickets.handle', async () => {
    prisma.supportTicket.findMany.mockResolvedValueOnce([
      { id: 't3', subject: 'Still fine', createdAt: new Date(), raisedByUserId: 'raiser3', assignedToUserId: 'active1' },
    ]);
    prisma.user.findMany.mockResolvedValueOnce([{ id: 'active1' }]); // still a handler

    const items = await source.fetchFor(actor(['support.tickets.reassign']));

    expect(items).toEqual([]);
  });
});
