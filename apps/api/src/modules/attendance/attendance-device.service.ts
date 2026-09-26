import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { generateApiKey, hashApiKey } from '../../core/security/api-token';
import type { AttendanceDevice } from '../../core/prisma/client';

const DEVICE_KEY_PREFIX = 'att';

/**
 * `AttendanceDevice` enrolment and device auth (attendance-workforce/
 * 22-attendance-shifts-leave.md WO-22.4) — the same shape as
 * `PosTerminalsService`: CRUD plus a credential issued once and verified by
 * its hash. Not a `User` and holds no permission key (this document's own
 * "principal with no permission key" scope lens) — a device authenticates
 * only enough to write punches for its own unit, and reads nothing.
 */
@Injectable()
export class AttendanceDeviceService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Omit<AttendanceDevice, 'deviceKeyHash'>[]> {
    return this.prisma.attendanceDevice.findMany({ orderBy: { code: 'asc' }, select: this.summarySelect() });
  }

  async findOne(id: string): Promise<Omit<AttendanceDevice, 'deviceKeyHash'>> {
    const device = await this.prisma.attendanceDevice.findUnique({ where: { id }, select: this.summarySelect() });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  async register(dto: { code: string; label: string; orgUnitId: string }): Promise<Omit<AttendanceDevice, 'deviceKeyHash'>> {
    const orgUnit = await this.prisma.orgUnit.findUnique({ where: { id: dto.orgUnitId }, select: { id: true } });
    if (!orgUnit) throw new BadRequestException('That org unit does not exist.');

    return this.prisma.attendanceDevice.create({
      data: { code: dto.code, label: dto.label, orgUnitId: dto.orgUnitId },
      select: this.summarySelect(),
    });
  }

  async update(id: string, dto: { code?: string; label?: string; orgUnitId?: string }): Promise<Omit<AttendanceDevice, 'deviceKeyHash'>> {
    await this.assertExists(id);
    if (dto.orgUnitId) {
      const orgUnit = await this.prisma.orgUnit.findUnique({ where: { id: dto.orgUnitId }, select: { id: true } });
      if (!orgUnit) throw new BadRequestException('That org unit does not exist.');
    }

    return this.prisma.attendanceDevice.update({
      where: { id },
      data: { code: dto.code, label: dto.label, orgUnitId: dto.orgUnitId },
      select: this.summarySelect(),
    });
  }

  /** Marks a device inactive without deleting it — its punch history stays put. */
  async suspend(id: string): Promise<Omit<AttendanceDevice, 'deviceKeyHash'>> {
    await this.assertExists(id);
    return this.prisma.attendanceDevice.update({ where: { id }, data: { status: 'SUSPENDED' }, select: this.summarySelect() });
  }

  /**
   * Issues a fresh device credential and returns it once, raw — only its
   * SHA-256 is kept. Rotating invalidates whatever key was issued before,
   * and also moves a PENDING device to ACTIVE — enrolment's own last step.
   */
  async rotateDeviceKey(id: string): Promise<{ deviceKey: string }> {
    await this.assertExists(id);
    const deviceKey = generateApiKey(DEVICE_KEY_PREFIX);
    await this.prisma.attendanceDevice.update({
      where: { id },
      data: { deviceKeyHash: hashApiKey(deviceKey), status: 'ACTIVE' },
    });
    return { deviceKey };
  }

  /**
   * Authenticates an inbound punch from a device: the raw key it presents,
   * hashed and looked up. A SUSPENDED device's key stops working
   * immediately even though it still hashes correctly, the same discipline
   * `PosTerminalsService.verifyDeviceKey()` already uses.
   */
  async verifyDeviceKey(rawKey: string): Promise<AttendanceDevice> {
    if (!rawKey.trim()) throw new UnauthorizedException('Missing device key.');

    const device = await this.prisma.attendanceDevice.findUnique({ where: { deviceKeyHash: hashApiKey(rawKey) } });
    if (!device) throw new UnauthorizedException('Invalid device key.');
    if (device.status !== 'ACTIVE') {
      throw new UnauthorizedException('This device is not active.');
    }

    void this.prisma.attendanceDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);

    return device;
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.attendanceDevice.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Device not found');
  }

  private summarySelect() {
    return {
      id: true,
      code: true,
      label: true,
      orgUnitId: true,
      status: true,
      lastSeenAt: true,
      createdAt: true,
      updatedAt: true,
      // Never selected: deviceKeyHash — write-only from this service
      // outward, the same discipline PosTerminal/TradingPartner/Node
      // credentials use.
    } as const;
  }
}
