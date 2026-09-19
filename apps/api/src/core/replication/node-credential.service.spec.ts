import { UnauthorizedException } from '@nestjs/common';
import { NodeCredentialService } from './node-credential.service';
import { PrismaService } from '../prisma/prisma.service';
import { hashApiKey } from '../security/api-token';

describe('NodeCredentialService — WO-20.2', () => {
  let service: NodeCredentialService;
  let prisma: any;

  beforeEach(() => {
    prisma = { node: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) } };
    service = new NodeCredentialService(prisma as PrismaService);
  });

  it('rejects a blank key without touching the database', async () => {
    await expect(service.verify('  ')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.node.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a key that matches no node', async () => {
    prisma.node.findUnique.mockResolvedValue(null);

    await expect(service.verify('node_bad')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a SUSPENDED node even with a correct key', async () => {
    prisma.node.findUnique.mockResolvedValue({ id: '1', nodeId: 'lhr-01', status: 'SUSPENDED' });

    await expect(service.verify('node_rawkey')).rejects.toThrow(/not active/);
  });

  it('resolves an ACTIVE node by the hash of its raw key', async () => {
    const raw = 'node_rawkey';
    prisma.node.findUnique.mockResolvedValue({ id: '1', nodeId: 'lhr-01', status: 'ACTIVE' });

    const node = await service.verify(raw);

    expect(prisma.node.findUnique).toHaveBeenCalledWith({ where: { inboundApiKeyHash: hashApiKey(raw) } });
    expect(node.nodeId).toBe('lhr-01');
  });

  it('touches lastSeenAt on a successful verify, without failing the call if that update fails', async () => {
    prisma.node.findUnique.mockResolvedValue({ id: '1', nodeId: 'lhr-01', status: 'ACTIVE' });
    prisma.node.update.mockRejectedValue(new Error('db hiccup'));

    await expect(service.verify('node_rawkey')).resolves.toEqual(
      expect.objectContaining({ nodeId: 'lhr-01' }),
    );
  });
});
