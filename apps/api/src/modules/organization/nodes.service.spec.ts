import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NodesService } from './nodes.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { hashApiKey } from '../../core/security/api-token';

describe('NodesService', () => {
  let prisma: any;

  const build = async (nodeRole: string) => {
    prisma = {
      node: { upsert: jest.fn(), findMany: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    };
    const config = { nodeRole };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NodesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppConfigService, useValue: config },
      ],
    }).compile();

    return module.get<NodesService>(NodesService);
  };

  it('registers a BRANCH child when this deployment is a BRAND', async () => {
    const service = await build('BRAND');
    prisma.node.upsert.mockResolvedValue({ id: '1', nodeId: 'lhr-01', role: 'BRANCH' });

    await service.register({ nodeId: 'lhr-01', label: 'Lahore — Gulberg', url: 'https://lhr-01.example' });

    expect(prisma.node.upsert).toHaveBeenCalledWith({
      where: { nodeId: 'lhr-01' },
      create: { nodeId: 'lhr-01', role: 'BRANCH', label: 'Lahore — Gulberg', url: 'https://lhr-01.example' },
      update: { label: 'Lahore — Gulberg', url: 'https://lhr-01.example', status: 'ACTIVE' },
    });
  });

  it('registers a BRANCH child with the brand it belongs to (WO-23.3c/e)', async () => {
    const service = await build('BRAND');
    prisma.node.upsert.mockResolvedValue({ id: '1', nodeId: 'lhr-01', role: 'BRANCH', retailBrandId: 'b1' });

    await service.register({
      nodeId: 'lhr-01',
      label: 'Lahore — Gulberg',
      url: 'https://lhr-01.example',
      retailBrandId: 'b1',
    });

    expect(prisma.node.upsert).toHaveBeenCalledWith({
      where: { nodeId: 'lhr-01' },
      create: { nodeId: 'lhr-01', role: 'BRANCH', label: 'Lahore — Gulberg', url: 'https://lhr-01.example', retailBrandId: 'b1' },
      update: { label: 'Lahore — Gulberg', url: 'https://lhr-01.example', status: 'ACTIVE', retailBrandId: 'b1' },
    });
  });

  it('registers a BRAND child when this deployment is an ORG', async () => {
    const service = await build('ORG');
    prisma.node.upsert.mockResolvedValue({ id: '1', nodeId: 'brand1', role: 'BRAND' });

    await service.register({ nodeId: 'brand1', label: 'Khaadi', url: 'https://brand1.example' });

    expect(prisma.node.upsert.mock.calls[0][0].create.role).toBe('BRAND');
  });

  it('refuses to register a child when this deployment is STANDALONE', async () => {
    const service = await build('STANDALONE');

    await expect(
      service.register({ nodeId: 'x', label: 'x', url: 'https://x' }),
    ).rejects.toThrow(/does not take child nodes/);
    expect(prisma.node.upsert).not.toHaveBeenCalled();
  });

  it('refuses to register a child when this deployment is a BRANCH — the bottom of the topology', async () => {
    const service = await build('BRANCH');

    await expect(
      service.register({ nodeId: 'x', label: 'x', url: 'https://x' }),
    ).rejects.toThrow(/does not take child nodes/);
  });

  it('lists registered nodes ordered by label', async () => {
    const service = await build('BRAND');
    prisma.node.findMany.mockResolvedValue([{ nodeId: 'lhr-01', label: 'Lahore — Gulberg' }]);

    const nodes = await service.list();

    expect(prisma.node.findMany).toHaveBeenCalledWith({ orderBy: { label: 'asc' } });
    expect(nodes).toHaveLength(1);
  });

  it('suspends a node without deleting it', async () => {
    const service = await build('BRAND');
    prisma.node.update.mockResolvedValue({ nodeId: 'lhr-01', status: 'SUSPENDED' });

    await service.suspend('lhr-01');

    expect(prisma.node.update).toHaveBeenCalledWith({
      where: { nodeId: 'lhr-01' },
      data: { status: 'SUSPENDED' },
    });
  });

  describe('rotateInboundKey', () => {
    it('404s for a node that does not exist', async () => {
      const service = await build('BRAND');
      prisma.node.findUnique.mockResolvedValue(null);

      await expect(service.rotateInboundKey('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.node.update).not.toHaveBeenCalled();
    });

    it('issues a fresh key and stores only its hash', async () => {
      const service = await build('BRAND');
      prisma.node.findUnique.mockResolvedValue({ id: '1' });
      prisma.node.update.mockResolvedValue({});

      const { apiKey } = await service.rotateInboundKey('lhr-01');

      expect(apiKey).toEqual(expect.stringMatching(/^node_/));
      expect(prisma.node.update).toHaveBeenCalledWith({
        where: { nodeId: 'lhr-01' },
        data: { inboundApiKeyHash: hashApiKey(apiKey) },
      });
    });
  });
});
