import { ForbiddenException } from '@nestjs/common';
import { assertCanManage } from './ownership.guard';

/**
 * The single reference implementation for every "my rows only" check in the
 * codebase — see MULTI-SECTOR.md B5 / docs/implementation/access-control-identity/16-pbac-row-scoping.md.
 */
describe('assertCanManage', () => {
  const actor = (permissions: string[]) => ({ id: 'user-1', permissions });

  it('allows a manage_all holder regardless of ownership', () => {
    expect(() =>
      assertCanManage(actor(['stitching.jobs.manage_all']), 'stitching.jobs', {
        ownerId: 'someone-else',
      }),
    ).not.toThrow();
  });

  it('allows a manage_own holder when they own the row', () => {
    expect(() =>
      assertCanManage(actor(['stitching.jobs.manage_own']), 'stitching.jobs', {
        ownerId: 'user-1',
      }),
    ).not.toThrow();
  });

  it('rejects a manage_own holder when they do not own the row', () => {
    expect(() =>
      assertCanManage(actor(['stitching.jobs.manage_own']), 'stitching.jobs', {
        ownerId: 'someone-else',
      }),
    ).toThrow(ForbiddenException);
  });

  it('rejects an actor with neither grant', () => {
    expect(() =>
      assertCanManage(actor([]), 'stitching.jobs', { ownerId: 'user-1' }),
    ).toThrow(ForbiddenException);
  });

  it('rejects a manage_own holder against a null owner', () => {
    expect(() =>
      assertCanManage(actor(['stitching.jobs.manage_own']), 'stitching.jobs', {
        ownerId: null,
      }),
    ).toThrow(ForbiddenException);
  });
});
