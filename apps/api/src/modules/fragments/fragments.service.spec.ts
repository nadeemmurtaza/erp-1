import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FragmentsService } from './fragments.service';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    microFrontendFragment: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      ...(overrides.microFrontendFragment as Record<string, unknown> | undefined),
    },
  } as any;
}

function makeJwt() {
  return { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') } as any;
}

function makeConfig() {
  return { get: jest.fn().mockReturnValue('test-secret') } as any;
}

function makeAudit() {
  return { record: jest.fn().mockResolvedValue(undefined) } as any;
}

describe('FragmentsService — WO-143.2/143.3', () => {
  it('lists only ACTIVE fragments by default', async () => {
    const prisma = makePrisma();
    const service = new FragmentsService(prisma, makeJwt(), makeConfig(), makeAudit());

    await service.listFragments(true);

    expect(prisma.microFrontendFragment.findMany).toHaveBeenCalledWith({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
  });

  it('lists every registered fragment, active or suspended, for the management screen', async () => {
    const prisma = makePrisma();
    const service = new FragmentsService(prisma, makeJwt(), makeConfig(), makeAudit());

    await service.listFragments(false);

    expect(prisma.microFrontendFragment.findMany).toHaveBeenCalledWith({ where: undefined, orderBy: { createdAt: 'asc' } });
  });

  it('lists only active fragments registered for one named mount point', async () => {
    const prisma = makePrisma();
    const service = new FragmentsService(prisma, makeJwt(), makeConfig(), makeAudit());

    await service.listForMountPoint('supplier-detail');

    expect(prisma.microFrontendFragment.findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', mountPoints: { has: 'supplier-detail' } },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('registers a fragment with an attestation timestamp and the registering user, then audits it', async () => {
    const prisma = makePrisma();
    prisma.microFrontendFragment.create.mockResolvedValue({ id: 'frag1', key: 'predictive-analytics' });
    const audit = makeAudit();
    const service = new FragmentsService(prisma, makeJwt(), makeConfig(), audit);

    await service.registerFragment(
      { key: 'predictive-analytics', label: 'Predictive analytics', remoteUrl: 'https://vendor.example/widget', mountPoints: ['supplier-detail'], attestationConfirmed: true },
      'user1',
    );

    expect(prisma.microFrontendFragment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        key: 'predictive-analytics',
        label: 'Predictive analytics',
        remoteUrl: 'https://vendor.example/widget',
        mountPoints: ['supplier-detail'],
        attestedByUserId: 'user1',
        attestedAt: expect.any(Date),
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'user1', action: 'fragment.register', entity: 'MicroFrontendFragment' }));
  });

  it('rejects updating a fragment that does not exist', async () => {
    const prisma = makePrisma({ microFrontendFragment: { findUnique: jest.fn().mockResolvedValue(null) } });
    const service = new FragmentsService(prisma, makeJwt(), makeConfig(), makeAudit());

    await expect(service.updateFragment('missing', { label: 'x' }, 'user1')).rejects.toThrow(BadRequestException);
    expect(prisma.microFrontendFragment.update).not.toHaveBeenCalled();
  });

  it('suspending a fragment sets its status to SUSPENDED — the kill switch', async () => {
    const prisma = makePrisma({
      microFrontendFragment: {
        findUnique: jest.fn().mockResolvedValue({ id: 'frag1', status: 'ACTIVE' }),
        update: jest.fn().mockResolvedValue({ id: 'frag1', status: 'SUSPENDED' }),
      },
    });
    const service = new FragmentsService(prisma, makeJwt(), makeConfig(), makeAudit());

    await service.suspendFragment('frag1', 'user1');

    expect(prisma.microFrontendFragment.update).toHaveBeenCalledWith({ where: { id: 'frag1' }, data: { status: 'SUSPENDED' } });
  });

  it('rejects issuing a token for a fragment that is not ACTIVE', async () => {
    const prisma = makePrisma({ microFrontendFragment: { findUnique: jest.fn().mockResolvedValue({ key: 'k', status: 'SUSPENDED', mountPoints: ['x'] }) } });
    const service = new FragmentsService(prisma, makeJwt(), makeConfig(), makeAudit());

    await expect(service.issueFragmentToken({ id: 'user1' } as any, 'k', 'x')).rejects.toThrow(NotFoundException);
  });

  it('rejects issuing a token for a mount point the fragment is not registered for', async () => {
    const prisma = makePrisma({ microFrontendFragment: { findUnique: jest.fn().mockResolvedValue({ key: 'k', status: 'ACTIVE', mountPoints: ['supplier-detail'] }) } });
    const service = new FragmentsService(prisma, makeJwt(), makeConfig(), makeAudit());

    await expect(service.issueFragmentToken({ id: 'user1' } as any, 'k', 'other-screen')).rejects.toThrow(ForbiddenException);
  });

  it('issues a scoped, short-lived token for an active fragment on its own registered mount point', async () => {
    const prisma = makePrisma({ microFrontendFragment: { findUnique: jest.fn().mockResolvedValue({ key: 'k', status: 'ACTIVE', mountPoints: ['supplier-detail'] }) } });
    const jwt = makeJwt();
    const service = new FragmentsService(prisma, jwt, makeConfig(), makeAudit());

    const result = await service.issueFragmentToken({ id: 'user1' } as any, 'k', 'supplier-detail');

    expect(jwt.signAsync).toHaveBeenCalledWith(
      { sub: 'k', userId: 'user1', mountPoint: 'supplier-detail', aud: 'micro-frontend-fragment' },
      expect.objectContaining({ expiresIn: 5 * 60 }),
    );
    expect(result.token).toBe('signed.jwt.token');
  });
});
