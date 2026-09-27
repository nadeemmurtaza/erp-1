import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AudienceService } from './audience.service';

/**
 * tasks-notifications-support/24-internal-notifications-meetings-escalation.md
 * (WO-24.1) — "The sender's reach bounds the audience": resolve() must
 * intersect the requested spec with the sender's own reach, and report
 * what was excluded, never silently widen or silently narrow without
 * saying so.
 */
describe('AudienceService', () => {
  let service: AudienceService;
  let prisma: any;

  const user = (id: string, orgUnitId: string) => ({
    userId: id,
    position: { orgUnitId },
    user: { firstName: 'A', lastName: 'B', email: `${id}@x.test`, phone: null },
  });

  beforeEach(async () => {
    prisma = {
      posting: { findMany: jest.fn() },
      orgUnit: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AudienceService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AudienceService);
  });

  it('an unrestricted sender (no posting) reaches every requested recipient', async () => {
    prisma.posting.findMany
      .mockResolvedValueOnce([]) // reachOf(senderId) — no posting held
      .mockResolvedValueOnce([user('u1', 'north'), user('u2', 'south')]); // requested

    const result = await service.resolve({}, 'admin1');

    expect(result.recipients).toHaveLength(2);
    expect(result.excludedCount).toBe(0);
  });

  it("narrows to the sender's own reach and reports what was excluded", async () => {
    prisma.posting.findMany
      .mockResolvedValueOnce([{ position: { orgUnitId: 'north' } }]) // reachOf: sender only reaches 'north'
      .mockResolvedValueOnce([user('u1', 'north'), user('u2', 'south')]); // requested spans both
    prisma.orgUnit.findMany.mockResolvedValue([{ id: 'north' }, { id: 'south' }]);

    const result = await service.resolve({ orgUnitId: 'org-root' }, 'manager1');

    expect(result.recipients.map((r) => r.userId)).toEqual(['u1']);
    expect(result.requestedCount).toBe(2);
    expect(result.excludedCount).toBe(1);
  });

  it('deduplicates a user holding two postings inside the resolved set', async () => {
    prisma.posting.findMany
      .mockResolvedValueOnce([]) // unrestricted
      .mockResolvedValueOnce([user('u1', 'north'), user('u1', 'south')]);

    const result = await service.resolve({}, 'admin1');

    expect(result.recipients).toHaveLength(1);
    expect(result.requestedCount).toBe(1);
  });

  it('includeDescendants: false requests only the exact unit, never its subtree', async () => {
    prisma.posting.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await service.resolve({ orgUnitId: 'north', includeDescendants: false }, 'admin1');

    expect(prisma.orgUnit.findMany).not.toHaveBeenCalled();
    expect(prisma.posting.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ position: expect.objectContaining({ orgUnitId: { in: ['north'] } }) }),
      }),
    );
  });
});
