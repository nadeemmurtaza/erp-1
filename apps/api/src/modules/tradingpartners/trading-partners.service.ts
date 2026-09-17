import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AppConfigService } from '../../core/config/app-config.service';
import { generateApiKey, hashApiKey } from '../../core/security/api-token';
import { encryptSecret } from '../../core/security/secret-crypto';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateTradingPartnerDto, UpdateTradingPartnerDto } from './dto/trading-partner.dto';

const INBOUND_KEY_PREFIX = 'tp';

/**
 * `TradingPartner` CRUD and credential issuance
 * (18-trading-partner-network.md, WO-18.1). Authenticating an inbound
 * document (WO-18.2) and delivering an outbound one (WO-18.3) are separate,
 * later work orders — this is only what it takes to register a partner and
 * hand out the two keys the rest of the feature needs.
 */
@Injectable()
export class TradingPartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async findAll() {
    return this.prisma.tradingPartner.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        kind: true,
        outboundBaseUrl: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        // Never selected: outboundApiKeyEncrypted, inboundApiKeyHash. A
        // credential is write-only from this service outward — see
        // Definition of Done's "no secrets in logs/responses" discipline
        // elsewhere in this codebase (email-accounts.service.ts's own
        // password handling is the precedent).
        _count: { select: { suppliers: true } },
      },
    });
  }

  async findOne(id: string) {
    const partner = await this.findSummaryOrThrow(id);
    return partner;
  }

  async create(dto: CreateTradingPartnerDto) {
    return this.prisma.tradingPartner.create({
      data: {
        name: dto.name,
        kind: dto.kind,
        outboundBaseUrl: dto.outboundBaseUrl,
      },
      select: this.summarySelect(),
    });
  }

  async update(id: string, dto: UpdateTradingPartnerDto) {
    await this.assertExists(id);
    return this.prisma.tradingPartner.update({
      where: { id },
      data: {
        name: dto.name,
        kind: dto.kind,
        outboundBaseUrl: dto.outboundBaseUrl,
        status: dto.status,
      },
      select: this.summarySelect(),
    });
  }

  async remove(id: string) {
    await this.assertExists(id);
    // onDelete: SetNull on Supplier.tradingPartner — unlinking every
    // supplier that pointed here is the database's job, not this method's.
    await this.prisma.tradingPartner.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Issues a fresh inbound key and returns it once, raw — only its SHA-256
   * is kept. Rotating invalidates whatever key was issued before, since the
   * hash column is overwritten, not appended to.
   */
  async rotateInboundKey(id: string): Promise<{ apiKey: string }> {
    await this.assertExists(id);
    const apiKey = generateApiKey(INBOUND_KEY_PREFIX);
    await this.prisma.tradingPartner.update({
      where: { id },
      data: { inboundApiKeyHash: hashApiKey(apiKey) },
    });
    return { apiKey };
  }

  /** Stores the credential THEY gave us, encrypted — never echoed back out. */
  async setOutboundApiKey(id: string, apiKey: string): Promise<void> {
    await this.assertExists(id);
    if (!apiKey.trim()) {
      throw new BadRequestException('API key must not be blank.');
    }
    await this.prisma.tradingPartner.update({
      where: { id },
      data: { outboundApiKeyEncrypted: encryptSecret(apiKey, this.encryptionKey()) },
    });
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.tradingPartner.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Trading partner not found');
  }

  private async findSummaryOrThrow(id: string) {
    const partner = await this.prisma.tradingPartner.findUnique({
      where: { id },
      select: { ...this.summarySelect(), _count: { select: { suppliers: true } } },
    });
    if (!partner) throw new NotFoundException('Trading partner not found');
    return partner;
  }

  private summarySelect() {
    return {
      id: true,
      name: true,
      kind: true,
      outboundBaseUrl: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  private encryptionKey(): string {
    return this.config.get('APP_ENCRYPTION_KEY');
  }
}
