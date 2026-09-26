import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hashApiKey } from '../../core/security/api-token';
import { AttendanceDeviceService } from './attendance-device.service';
import { PrismaService } from '../../core/prisma/prisma.service';

/** attendance-workforce/22-attendance-shifts-leave.md WO-22.4 — the same shape as PosTerminalsService. */
describe('AttendanceDeviceService', () => {
  let service: AttendanceDeviceService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      attendanceDevice: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      orgUnit: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AttendanceDeviceService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AttendanceDeviceService);
  });

  describe('register', () => {
    it('refuses an org unit that does not exist', async () => {
      prisma.orgUnit.findUnique.mockResolvedValue(null);

      await expect(service.register({ code: 'HQ-KIOSK-1', label: 'Lobby kiosk', orgUnitId: 'missing' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.attendanceDevice.create).not.toHaveBeenCalled();
    });

    it('creates a device with the summary shape, never a credential column', async () => {
      prisma.orgUnit.findUnique.mockResolvedValue({ id: 'north' });
      prisma.attendanceDevice.create.mockResolvedValue({
        id: 'd1',
        code: 'HQ-KIOSK-1',
        label: 'Lobby kiosk',
        orgUnitId: 'north',
        status: 'PENDING',
        lastSeenAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.register({ code: 'HQ-KIOSK-1', label: 'Lobby kiosk', orgUnitId: 'north' });

      expect(result.code).toBe('HQ-KIOSK-1');
      const call = prisma.attendanceDevice.create.mock.calls[0][0];
      expect(call.select).not.toHaveProperty('deviceKeyHash');
    });
  });

  describe('findOne / update / suspend — the not-found guard', () => {
    it('404s reading a device that does not exist', async () => {
      prisma.attendanceDevice.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s updating a device that does not exist', async () => {
      prisma.attendanceDevice.findUnique.mockResolvedValue(null);
      await expect(service.update('missing', { label: 'X' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.attendanceDevice.update).not.toHaveBeenCalled();
    });

    it('404s suspending a device that does not exist', async () => {
      prisma.attendanceDevice.findUnique.mockResolvedValue(null);
      await expect(service.suspend('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('refuses moving a device to an org unit that does not exist', async () => {
      prisma.attendanceDevice.findUnique.mockResolvedValue({ id: 'd1' });
      prisma.orgUnit.findUnique.mockResolvedValue(null);

      await expect(service.update('d1', { orgUnitId: 'missing' })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.attendanceDevice.update).not.toHaveBeenCalled();
    });
  });

  describe('rotateDeviceKey', () => {
    it('404s for a device that does not exist', async () => {
      prisma.attendanceDevice.findUnique.mockResolvedValue(null);
      await expect(service.rotateDeviceKey('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('issues a fresh key, stores only its hash, and activates the device', async () => {
      prisma.attendanceDevice.findUnique.mockResolvedValue({ id: 'd1' });
      prisma.attendanceDevice.update.mockResolvedValue({});

      const { deviceKey } = await service.rotateDeviceKey('d1');

      expect(deviceKey).toEqual(expect.stringMatching(/^att_/));
      expect(prisma.attendanceDevice.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { deviceKeyHash: hashApiKey(deviceKey), status: 'ACTIVE' },
      });
    });
  });

  describe('verifyDeviceKey', () => {
    it('rejects a blank key without touching the database', async () => {
      await expect(service.verifyDeviceKey('  ')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.attendanceDevice.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a key that matches no device', async () => {
      prisma.attendanceDevice.findUnique.mockResolvedValue(null);
      await expect(service.verifyDeviceKey('att_bad')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a SUSPENDED device even with a correct key', async () => {
      prisma.attendanceDevice.findUnique.mockResolvedValue({ id: 'd1', status: 'SUSPENDED' });
      await expect(service.verifyDeviceKey('att_rawkey')).rejects.toThrow(/not active/);
    });

    it('resolves an ACTIVE device by the hash of its raw key', async () => {
      const raw = 'att_rawkey';
      prisma.attendanceDevice.findUnique.mockResolvedValue({ id: 'd1', code: 'HQ-KIOSK-1', status: 'ACTIVE' });
      prisma.attendanceDevice.update.mockResolvedValue({});

      const device = await service.verifyDeviceKey(raw);

      expect(prisma.attendanceDevice.findUnique).toHaveBeenCalledWith({ where: { deviceKeyHash: hashApiKey(raw) } });
      expect(device.code).toBe('HQ-KIOSK-1');
    });

    it('touches lastSeenAt on a successful verify without failing the call if that update fails', async () => {
      prisma.attendanceDevice.findUnique.mockResolvedValue({ id: 'd1', status: 'ACTIVE' });
      prisma.attendanceDevice.update.mockRejectedValue(new Error('db hiccup'));

      await expect(service.verifyDeviceKey('att_rawkey')).resolves.toEqual(expect.objectContaining({ id: 'd1' }));
    });
  });
});
