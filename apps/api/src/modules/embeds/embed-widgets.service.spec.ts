import { NotFoundException } from '@nestjs/common';
import { EmbedWidgetsService } from './embed-widgets.service';

function makeUser(overrides: Partial<{ id: string; roles: string[]; permissions: string[]; email: string | null; phone: string | null }> = {}) {
  return { id: 'u1', roles: [], permissions: [], email: null, phone: null, ...overrides } as any;
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    embeddedWidget: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    ...overrides,
  } as any;
}

function makeJwt(overrides: Record<string, unknown> = {}) {
  return { signAsync: jest.fn().mockResolvedValue('signed-token'), ...overrides } as any;
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  return { get: jest.fn().mockReturnValue('test-secret'), ...overrides } as any;
}

describe('EmbedWidgetsService — WO-113.1', () => {
  it('lists only active widgets when asked', async () => {
    const prisma = makePrisma();
    const service = new EmbedWidgetsService(prisma, makeJwt(), makeConfig());

    await service.listWidgets(true);

    expect(prisma.embeddedWidget.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
  });

  it('lists every widget, active or not, when asked', async () => {
    const prisma = makePrisma();
    const service = new EmbedWidgetsService(prisma, makeJwt(), makeConfig());

    await service.listWidgets(false);

    expect(prisma.embeddedWidget.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
  });

  it('records who created a widget', async () => {
    const prisma = makePrisma();
    prisma.embeddedWidget.create.mockResolvedValue({ id: 'w1' });
    const service = new EmbedWidgetsService(prisma, makeJwt(), makeConfig());

    await service.createWidget({ key: 'predictive-analytics', label: 'Predictive analytics', targetUrl: 'https://vendor.example/embed' }, 'u1');

    expect(prisma.embeddedWidget.create).toHaveBeenCalledWith({
      data: { key: 'predictive-analytics', label: 'Predictive analytics', targetUrl: 'https://vendor.example/embed', createdByUserId: 'u1' },
    });
  });

  it('refuses to issue a token for a widget key that does not exist', async () => {
    const prisma = makePrisma({ embeddedWidget: { findUnique: jest.fn().mockResolvedValue(null) } });
    const service = new EmbedWidgetsService(prisma, makeJwt(), makeConfig());

    await expect(service.issueEmbedToken(makeUser(), 'unknown-widget')).rejects.toThrow(NotFoundException);
  });

  it('refuses to issue a token for a deactivated widget', async () => {
    const prisma = makePrisma({
      embeddedWidget: { findUnique: jest.fn().mockResolvedValue({ key: 'w1', isActive: false }) },
    });
    const service = new EmbedWidgetsService(prisma, makeJwt(), makeConfig());

    await expect(service.issueEmbedToken(makeUser(), 'w1')).rejects.toThrow(NotFoundException);
  });

  it('issues a short-lived token scoped to the caller\'s own userId, never a raw session token', async () => {
    const prisma = makePrisma({
      embeddedWidget: { findUnique: jest.fn().mockResolvedValue({ key: 'predictive-analytics', isActive: true }) },
    });
    const jwt = makeJwt();
    const config = makeConfig();
    const service = new EmbedWidgetsService(prisma, jwt, config);

    const result = await service.issueEmbedToken(makeUser({ id: 'staff-1' }), 'predictive-analytics');

    expect(jwt.signAsync).toHaveBeenCalledWith(
      { sub: 'predictive-analytics', userId: 'staff-1', aud: 'embed-widget' },
      expect.objectContaining({ secret: 'test-secret', expiresIn: 300 }),
    );
    expect(result.token).toBe('signed-token');
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects updating a widget id that does not exist', async () => {
    const prisma = makePrisma({ embeddedWidget: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() } });
    const service = new EmbedWidgetsService(prisma, makeJwt(), makeConfig());

    await expect(service.updateWidget('missing', { isActive: false })).rejects.toThrow(NotFoundException);
    expect(prisma.embeddedWidget.update).not.toHaveBeenCalled();
  });

  it('rejects deleting a widget id that does not exist', async () => {
    const prisma = makePrisma({ embeddedWidget: { findUnique: jest.fn().mockResolvedValue(null), delete: jest.fn() } });
    const service = new EmbedWidgetsService(prisma, makeJwt(), makeConfig());

    await expect(service.deleteWidget('missing')).rejects.toThrow(NotFoundException);
    expect(prisma.embeddedWidget.delete).not.toHaveBeenCalled();
  });
});
