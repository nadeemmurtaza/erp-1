import { LeaveRequestActionSource } from './leave-request-action.source';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import type { ActionHubRegistryService } from '../../core/action-hub/action-hub-registry.service';

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return { id: 'u1', roles: [], permissions: [], email: null, phone: null, ...overrides };
}

function makeRegistry() {
  return { register: jest.fn() } as unknown as ActionHubRegistryService;
}

describe('LeaveRequestActionSource', () => {
  it('registers itself in onModuleInit', () => {
    const registry = makeRegistry();
    const source = new LeaveRequestActionSource({} as any, registry);
    source.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(source);
  });

  it('never returns items to a caller without payroll.manage — the same gate the real screen enforces', async () => {
    const findMany = jest.fn();
    const source = new LeaveRequestActionSource({ leaveRequest: { findMany } } as any, makeRegistry());

    const result = await source.fetchFor(makeUser({ permissions: [] }));

    expect(findMany).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('maps a PENDING leave request into an ActionItem pointing at the real approval screen', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'req1',
        days: 3,
        startDate: new Date('2026-08-10'),
        user: { firstName: 'Ahmed', lastName: 'Raza', email: 'ahmed@example.com' },
      },
    ]);
    const source = new LeaveRequestActionSource({ leaveRequest: { findMany } } as any, makeRegistry());

    const result = await source.fetchFor(makeUser({ permissions: ['payroll.manage'] }));

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PENDING' } }),
    );
    expect(result).toEqual([
      {
        id: 'leave:req1',
        kind: 'LEAVE_REQUEST',
        subjectEmployeeName: 'Ahmed Raza',
        summary: 'Leave request, 3 days, Ahmed Raza',
        dueBy: new Date('2026-08-10'),
        href: '/admin/payroll/leave',
        permission: 'payroll.manage',
      },
    ]);
  });

  it('falls back to the email, then "Unknown", when a name is missing', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'req2', days: 1, startDate: new Date('2026-08-11'), user: { firstName: null, lastName: null, email: 'a@b.com' } },
      { id: 'req3', days: 1, startDate: new Date('2026-08-12'), user: { firstName: null, lastName: null, email: null } },
    ]);
    const source = new LeaveRequestActionSource({ leaveRequest: { findMany } } as any, makeRegistry());

    const result = await source.fetchFor(makeUser({ permissions: ['payroll.manage'] }));

    expect(result[0]!.subjectEmployeeName).toBe('a@b.com');
    expect(result[1]!.subjectEmployeeName).toBe('Unknown');
  });

  it('singularizes "day" for a one-day request', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'req4', days: 1, startDate: new Date('2026-08-13'), user: { firstName: 'A', lastName: 'B', email: null } },
    ]);
    const source = new LeaveRequestActionSource({ leaveRequest: { findMany } } as any, makeRegistry());

    const result = await source.fetchFor(makeUser({ permissions: ['payroll.manage'] }));

    expect(result[0]!.summary).toBe('Leave request, 1 day, A B');
  });
});
