import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hashApiKey } from '../../core/security/api-token';
import { PosTerminalsService } from './pos-terminals.service';
import { PrismaService } from '../../core/prisma/prisma.service';

describe('PosTerminalsService — WO-21.1', () => {
  let service: PosTerminalsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      posTerminal: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      location: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PosTerminalsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(PosTerminalsService);
  });

  describe('register', () => {
    it('refuses a location that does not exist', async () => {
      prisma.location.findUnique.mockResolvedValue(null);

      await expect(
        service.register({ code: 'LHR-01-T1', label: 'Till 1', locationId: 'missing' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.posTerminal.create).not.toHaveBeenCalled();
    });

    it('creates a terminal with the summary shape, never a credential column', async () => {
      prisma.location.findUnique.mockResolvedValue({ id: 'loc1' });
      prisma.posTerminal.create.mockResolvedValue({
        id: 't1',
        code: 'LHR-01-T1',
        label: 'Till 1',
        locationId: 'loc1',
        status: 'PENDING',
        lastSeenAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.register({ code: 'LHR-01-T1', label: 'Till 1', locationId: 'loc1' });

      expect(result.code).toBe('LHR-01-T1');
      const call = prisma.posTerminal.create.mock.calls[0][0];
      expect(call.select).not.toHaveProperty('deviceKeyHash');
    });
  });

  describe('findOne / update / suspend — the not-found guard', () => {
    it('404s reading a terminal that does not exist', async () => {
      prisma.posTerminal.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s updating a terminal that does not exist', async () => {
      prisma.posTerminal.findUnique.mockResolvedValue(null);
      await expect(service.update('missing', { label: 'X' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.posTerminal.update).not.toHaveBeenCalled();
    });

    it('404s suspending a terminal that does not exist', async () => {
      prisma.posTerminal.findUnique.mockResolvedValue(null);
      await expect(service.suspend('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('refuses moving a terminal to a location that does not exist', async () => {
      prisma.posTerminal.findUnique.mockResolvedValue({ id: 't1' });
      prisma.location.findUnique.mockResolvedValue(null);

      await expect(service.update('t1', { locationId: 'missing' })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.posTerminal.update).not.toHaveBeenCalled();
    });
  });

  describe('rotateDeviceKey', () => {
    it('404s for a terminal that does not exist', async () => {
      prisma.posTerminal.findUnique.mockResolvedValue(null);
      await expect(service.rotateDeviceKey('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('issues a fresh key and stores only its hash', async () => {
      prisma.posTerminal.findUnique.mockResolvedValue({ id: 't1' });
      prisma.posTerminal.update.mockResolvedValue({});

      const { deviceKey } = await service.rotateDeviceKey('t1');

      expect(deviceKey).toEqual(expect.stringMatching(/^pos_/));
      expect(prisma.posTerminal.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { deviceKeyHash: hashApiKey(deviceKey) },
      });
    });
  });

  describe('verifyDeviceKey', () => {
    it('rejects a blank key without touching the database', async () => {
      await expect(service.verifyDeviceKey('  ')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.posTerminal.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a key that matches no terminal', async () => {
      prisma.posTerminal.findUnique.mockResolvedValue(null);
      await expect(service.verifyDeviceKey('pos_bad')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a SUSPENDED terminal even with a correct key', async () => {
      prisma.posTerminal.findUnique.mockResolvedValue({ id: 't1', status: 'SUSPENDED' });
      await expect(service.verifyDeviceKey('pos_rawkey')).rejects.toThrow(/not active/);
    });

    it('resolves an ACTIVE terminal by the hash of its raw key', async () => {
      const raw = 'pos_rawkey';
      prisma.posTerminal.findUnique.mockResolvedValue({ id: 't1', code: 'LHR-01-T1', status: 'ACTIVE' });
      prisma.posTerminal.update.mockResolvedValue({});

      const terminal = await service.verifyDeviceKey(raw);

      expect(prisma.posTerminal.findUnique).toHaveBeenCalledWith({ where: { deviceKeyHash: hashApiKey(raw) } });
      expect(terminal.code).toBe('LHR-01-T1');
    });

    it('touches lastSeenAt on a successful verify without failing the call if that update fails', async () => {
      prisma.posTerminal.findUnique.mockResolvedValue({ id: 't1', status: 'ACTIVE' });
      prisma.posTerminal.update.mockRejectedValue(new Error('db hiccup'));

      await expect(service.verifyDeviceKey('pos_rawkey')).resolves.toEqual(expect.objectContaining({ id: 't1' }));
    });
  });
});
