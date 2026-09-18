import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { generateApiKey, hashApiKey } from '../../core/security/api-token';
import type { PosTerminal } from '../../core/prisma/client';
import { RegisterPosTerminalDto, UpdatePosTerminalDto } from './dto/pos-terminal.dto';

const DEVICE_KEY_PREFIX = 'pos';

/**
 * `PosTerminal` registration and device auth (RETAIL-ERP.md R7/R11,
 * WO-21.1) — same shape as `TradingPartnersService`/`NodesService`: CRUD
 * plus a credential issued once and verified by its hash. `locationId` is a
 * bare scalar (see pos.prisma's own comment), so this checks it exists
 * itself rather than leaning on a DB-level FK.
 */
@Injectable()
export class PosTerminalsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Omit<PosTerminal, 'deviceKeyHash'>[]> {
    return this.prisma.posTerminal.findMany({
      orderBy: { code: 'asc' },
      select: this.summarySelect(),
    });
  }

  async findOne(id: string): Promise<Omit<PosTerminal, 'deviceKeyHash'>> {
    const terminal = await this.prisma.posTerminal.findUnique({ where: { id }, select: this.summarySelect() });
    if (!terminal) throw new NotFoundException('Terminal not found');
    return terminal;
  }

  async register(dto: RegisterPosTerminalDto): Promise<Omit<PosTerminal, 'deviceKeyHash'>> {
    const location = await this.prisma.location.findUnique({ where: { id: dto.locationId }, select: { id: true } });
    if (!location) throw new BadRequestException('That location does not exist.');

    return this.prisma.posTerminal.create({
      data: { code: dto.code, label: dto.label, locationId: dto.locationId },
      select: this.summarySelect(),
    });
  }

  async update(id: string, dto: UpdatePosTerminalDto): Promise<Omit<PosTerminal, 'deviceKeyHash'>> {
    await this.assertExists(id);
    if (dto.locationId) {
      const location = await this.prisma.location.findUnique({ where: { id: dto.locationId }, select: { id: true } });
      if (!location) throw new BadRequestException('That location does not exist.');
    }

    return this.prisma.posTerminal.update({
      where: { id },
      data: { code: dto.code, label: dto.label, locationId: dto.locationId, status: dto.status },
      select: this.summarySelect(),
    });
  }

  /** Marks a terminal inactive without deleting it — its receipt/shift history (WO-21.2+) stays put. */
  async suspend(id: string): Promise<Omit<PosTerminal, 'deviceKeyHash'>> {
    await this.assertExists(id);
    return this.prisma.posTerminal.update({ where: { id }, data: { status: 'SUSPENDED' }, select: this.summarySelect() });
  }

  /**
   * Issues a fresh device credential and returns it once, raw — only its
   * SHA-256 is kept. Rotating invalidates whatever key was issued before,
   * since the hash column is overwritten, not appended to.
   */
  async rotateDeviceKey(id: string): Promise<{ deviceKey: string }> {
    await this.assertExists(id);
    const deviceKey = generateApiKey(DEVICE_KEY_PREFIX);
    await this.prisma.posTerminal.update({ where: { id }, data: { deviceKeyHash: hashApiKey(deviceKey) } });
    return { deviceKey };
  }

  /**
   * Authenticates an inbound call from a till (WO-21.2+ — nothing calls
   * this yet): the raw key it presents, hashed and looked up. A SUSPENDED
   * terminal's key stops working immediately even though it still hashes
   * correctly, the same discipline `TradingPartnersService
   * .verifyInboundKey()` already uses.
   */
  async verifyDeviceKey(rawKey: string): Promise<PosTerminal> {
    if (!rawKey.trim()) throw new UnauthorizedException('Missing device key.');

    const terminal = await this.prisma.posTerminal.findUnique({ where: { deviceKeyHash: hashApiKey(rawKey) } });
    if (!terminal) throw new UnauthorizedException('Invalid device key.');
    if (terminal.status !== 'ACTIVE') {
      throw new UnauthorizedException('This terminal is not active.');
    }

    void this.prisma.posTerminal.update({ where: { id: terminal.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);

    return terminal;
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.posTerminal.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Terminal not found');
  }

  private summarySelect() {
    return {
      id: true,
      code: true,
      label: true,
      locationId: true,
      status: true,
      lastSeenAt: true,
      createdAt: true,
      updatedAt: true,
      // Never selected: deviceKeyHash — write-only from this service
      // outward, the same discipline TradingPartner/Node credentials use.
    } as const;
  }
}
