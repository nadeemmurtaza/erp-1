import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AppConfigService } from '../../../core/config/app-config.service';
import { generateApiKey, hashApiKey } from '../../../core/security/api-token';
import { decryptSecret, encryptSecret } from '@newax/shared/secret-crypto';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { TradingPartner } from '../../../core/prisma/client';
import { CreateTradingPartnerDto, PartyRoleNameDto, UpdateTradingPartnerDto } from './dto/trading-partner.dto';

const INBOUND_KEY_PREFIX = 'tp';
const INVITE_TOKEN_PREFIX = 'tpi';

/**
 * SUPPLIER/MANUFACTURER sell to us; DISTRIBUTOR/RETAILER buy from us. `kind`
 * only ever needs this coarser split — see product-alerts.listener.ts and
 * supplier-digest.listener.ts, both of which route on `kind`, never on
 * `acceptedRole`.
 */
const KIND_BY_ACCEPTED_ROLE: Record<PartyRoleNameDto, 'SUPPLIER' | 'CUSTOMER'> = {
  SUPPLIER: 'SUPPLIER',
  MANUFACTURER: 'SUPPLIER',
  DISTRIBUTOR: 'CUSTOMER',
  RETAILER: 'CUSTOMER',
};

/**
 * `TradingPartner` CRUD, credential issuance (WO-18.1), inbound
 * authentication (WO-18.2) and outbound delivery (WO-18.3) —
 * 18-trading-partner-network.md.
 */
@Injectable()
export class TradingPartnersService {
  private readonly logger = new Logger(TradingPartnersService.name);

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
        acceptedRole: true,
        invitedAt: true,
        acceptedAt: true,
        // Never selected: outboundApiKeyEncrypted, inboundApiKeyHash,
        // inviteTokenHash. A credential is write-only from this service
        // outward — see Definition of Done's "no secrets in logs/responses"
        // discipline elsewhere in this codebase (email-accounts.service.ts's
        // own password handling is the precedent).
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
        contactEmail: dto.contactEmail,
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
        contactEmail: dto.contactEmail,
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

  /**
   * Authenticates an inbound call from a partner's own system (WO-18.2): the
   * raw key they present, hashed and looked up. A SUSPENDED partner's key
   * stops working immediately even though it still hashes correctly — that
   * check happens here, not left to whichever endpoint calls this, so no
   * inbound route can forget it.
   */
  async verifyInboundKey(rawKey: string): Promise<TradingPartner> {
    if (!rawKey.trim()) throw new UnauthorizedException('Missing API key.');

    const partner = await this.prisma.tradingPartner.findUnique({
      where: { inboundApiKeyHash: hashApiKey(rawKey) },
    });
    if (!partner) throw new UnauthorizedException('Invalid API key.');
    if (partner.status !== 'ACTIVE') {
      throw new UnauthorizedException('This trading partner is not active.');
    }
    return partner;
  }

  /**
   * Live stock for the SKUs a connected partner asks about — the read side
   * of "them buying from us" (kind CUSTOMER or BOTH). Scoped to the SKUs
   * they name rather than the whole catalogue: nothing here shares more of
   * the catalogue than a partner already knows to ask for.
   */
  async getLiveStock(partner: TradingPartner, skus: string[]) {
    if (partner.kind === 'SUPPLIER') {
      throw new ForbiddenException('A SUPPLIER-kind trading partner cannot query stock.');
    }
    if (skus.length === 0) return [];

    const variants = await this.prisma.productVariant.findMany({
      where: { sku: { in: skus }, isActive: true },
      select: {
        sku: true,
        stock: true,
        priceOverride: true,
        product: { select: { basePrice: true } },
      },
    });

    const bySku = new Map(variants.map((v) => [v.sku, v]));
    return skus.map((sku) => {
      const variant = bySku.get(sku);
      if (!variant) return { sku, found: false as const };
      return {
        sku,
        found: true as const,
        stock: variant.stock,
        priceMinor: variant.priceOverride ?? variant.product.basePrice,
      };
    });
  }

  /**
   * Delivers one document to a partner's own API (WO-18.3) — "us calling
   * them", the mirror of `verifyInboundKey()`. Never throws: a failed push
   * is logged and swallowed, the same discipline `NotificationsService`
   * uses for a failed email — a partner's endpoint being down must not fail
   * whatever triggered this (a cron run, an admin save), and there is no
   * retry queue for this yet, unlike the in-process domain-event outbox.
   */
  async pushOutbound(partnerId: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
    const partner = await this.prisma.tradingPartner.findUnique({ where: { id: partnerId } });
    if (!partner || partner.status !== 'ACTIVE') return;
    if (!partner.outboundBaseUrl || !partner.outboundApiKeyEncrypted) return;

    try {
      const apiKey = decryptSecret(partner.outboundApiKeyEncrypted, this.encryptionKey());
      const response = await fetch(partner.outboundBaseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ eventType, payload, sentAt: new Date().toISOString() }),
      });
      if (!response.ok) {
        this.logger.warn(`Outbound push to "${partner.name}" (${eventType}) failed: HTTP ${response.status}`);
      }
    } catch (error) {
      this.logger.warn(
        `Outbound push to "${partner.name}" (${eventType}) failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * "Send a request" — the first half of the first-connection handshake
   * (WO-18.1 extension). Issues a single-use token, shown once, the same
   * discipline as `rotateInboundKey`. Only a PENDING partner with no
   * acceptance yet can be (re-)invited — re-inviting an already-ACTIVE
   * partner would silently reopen a relation that already started.
   */
  async inviteConnection(id: string): Promise<{ token: string; acceptUrl: string }> {
    const partner = await this.findSummaryOrThrow(id);
    if (partner.status !== 'PENDING' || partner.acceptedAt) {
      throw new BadRequestException('Only a PENDING partner with no acceptance yet can be invited.');
    }

    const token = generateApiKey(INVITE_TOKEN_PREFIX);
    await this.prisma.tradingPartner.update({
      where: { id },
      data: { inviteTokenHash: hashApiKey(token), invitedAt: new Date() },
    });

    const base = this.config.get('STOREFRONT_URL').replace(/\/+$/, '');
    return { token, acceptUrl: `${base}/partner-invite?token=${encodeURIComponent(token)}` };
  }

  /**
   * "They accept" — starts the relation. Public and token-authenticated,
   * the same shape as `verifyInboundKey`: the raw token, hashed and looked
   * up, is the only credential needed. `kind` is derived from the role they
   * confirm, `status` moves PENDING -> ACTIVE, and the token is consumed
   * (cleared) so the link cannot be replayed.
   */
  async acceptConnection(rawToken: string, role: PartyRoleNameDto): Promise<TradingPartner> {
    if (!rawToken.trim()) throw new UnauthorizedException('Missing invite token.');

    const partner = await this.prisma.tradingPartner.findUnique({
      where: { inviteTokenHash: hashApiKey(rawToken) },
    });
    if (!partner) throw new UnauthorizedException('Invalid or already-used invite token.');

    return this.prisma.tradingPartner.update({
      where: { id: partner.id },
      data: {
        acceptedRole: role,
        acceptedAt: new Date(),
        status: 'ACTIVE',
        kind: KIND_BY_ACCEPTED_ROLE[role],
        inviteTokenHash: null,
      },
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
      acceptedRole: true,
      invitedAt: true,
      acceptedAt: true,
      contactEmail: true,
    } as const;
  }

  private encryptionKey(): string {
    return this.config.get('APP_ENCRYPTION_KEY');
  }
}
