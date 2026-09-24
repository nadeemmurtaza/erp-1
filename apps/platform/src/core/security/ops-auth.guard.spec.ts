import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OpsAuthGuard } from './ops-auth.guard';
import { hashOpsKey } from './ops-key';

function contextWith(header?: string, required?: string[]) {
  const request: any = { headers: { authorization: header } };
  return {
    request,
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any,
    reflector: { getAllAndOverride: () => required } as unknown as Reflector,
  };
}

describe('OpsAuthGuard', () => {
  const pepper = 'test-pepper-at-least-32-characters-long';
  let prisma: any;
  let config: any;

  beforeEach(() => {
    prisma = { platformOpsClient: { findUnique: jest.fn(), update: jest.fn() } };
    config = { get: () => pepper };
  });

  it('rejects a request with no bearer header', async () => {
    const { context, reflector } = contextWith(undefined, []);
    const guard = new OpsAuthGuard(reflector, prisma, config);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unknown key', async () => {
    prisma.platformOpsClient.findUnique.mockResolvedValue(null);
    const { context, reflector } = contextWith('Bearer pfops_bogus', []);
    const guard = new OpsAuthGuard(reflector, prisma, config);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a revoked key even if the hash still matches', async () => {
    prisma.platformOpsClient.findUnique.mockResolvedValue({ id: 'c1', status: 'REVOKED', scopes: [] });
    const { context, reflector } = contextWith('Bearer pfops_x', []);
    const guard = new OpsAuthGuard(reflector, prisma, config);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when the required scope is missing', async () => {
    prisma.platformOpsClient.findUnique.mockResolvedValue({ id: 'c1', status: 'ACTIVE', scopes: ['platform.billing.manage'] });
    const { context, reflector } = contextWith('Bearer pfops_x', ['platform.tenants.manage']);
    const guard = new OpsAuthGuard(reflector, prisma, config);

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('allows and attaches the client when the scope matches', async () => {
    const client = { id: 'c1', status: 'ACTIVE', scopes: ['platform.tenants.manage'] };
    prisma.platformOpsClient.findUnique.mockResolvedValue(client);
    prisma.platformOpsClient.update.mockResolvedValue(client);
    const { context, request, reflector } = contextWith('Bearer pfops_x', ['platform.tenants.manage']);
    const guard = new OpsAuthGuard(reflector, prisma, config);

    const allowed = await guard.canActivate(context);

    expect(allowed).toBe(true);
    expect(request.opsClient).toBe(client);
  });

  it('looks the client up by the hash of the presented key, never the raw key', async () => {
    prisma.platformOpsClient.findUnique.mockResolvedValue(null);
    const rawKey = 'pfops_realkey';
    const { context, reflector } = contextWith(`Bearer ${rawKey}`, []);
    const guard = new OpsAuthGuard(reflector, prisma, config);

    await guard.canActivate(context).catch(() => undefined);

    expect(prisma.platformOpsClient.findUnique).toHaveBeenCalledWith({
      where: { keyHash: hashOpsKey(rawKey, pepper) },
    });
  });
});
