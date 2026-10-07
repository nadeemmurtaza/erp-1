import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AppConfigService } from '../../../core/config/app-config.service';
import { AuditService } from '../../../core/audit/audit.service';
import { DomainEvent } from '../../../core/events/domain-events';
import { EventBusService } from '../../../core/events/event-bus.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { documentNumber } from '../../../core/settings/document-number';
import { documentPrefix } from '../../../core/settings/document-prefix';
import { SettingsService } from '../../../core/settings/settings.service';
import type { Prisma, Shipment, ShipmentStatus } from '../../../core/prisma/client';
import type { CourierProvider } from './courier-provider';
import { ManualCourierProvider } from './providers/manual.provider';
import type { AddToManifestDto, CreateManifestDto, CreateShipmentDto, RecordShipmentStatusDto } from './dto/fulfilment.dto';

const shipmentInclude = {
  events: { orderBy: { occurredAt: 'desc' } },
  method: true,
  order: { select: { id: true, number: true, shippingAddress: true } },
} satisfies Prisma.ShipmentInclude;

async function nextManifestNumber(
  prisma: PrismaService,
  settings: SettingsService,
  config: AppConfigService,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = await documentPrefix(settings, 'manifest');
  const [{ counter }] = await prisma.$queryRaw<Array<{ counter: number }>>`
    INSERT INTO "ManifestNumberCounter" ("year", "counter") VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "counter" = "ManifestNumberCounter"."counter" + 1
    RETURNING "counter"
  `;
  return documentNumber(config, prefix, year, counter);
}

/**
 * WO-6.2/6.4/6.5/6.7 — shipment lifecycle, manifests, tracking automation
 * and RTO. The one writer for a shipment's status (applyStatusChange) is
 * shared by FulfilmentCron's poll and a staff-recorded status update, so a
 * courier integration and "the shop's own manual driver" go through the
 * exact same downstream effects (ShipmentEvent, ShipmentStatusChanged,
 * RTO detection) — never two parallel paths.
 */
@Injectable()
export class FulfilmentService {
  private readonly logger = new Logger(FulfilmentService.name);
  private readonly providers = new Map<string, CourierProvider>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly config: AppConfigService,
    manual: ManualCourierProvider,
  ) {
    for (const provider of [manual]) {
      if (config.isCourierProviderEnabled(provider.key)) {
        this.providers.set(provider.key, provider);
      }
    }
    if (this.providers.size === 0) {
      this.logger.error('No courier providers are enabled — shipments cannot be booked.');
    }
  }

  listCouriers() {
    return [...this.providers.values()].map((provider) => ({
      key: provider.key,
      labelEn: provider.labelEn,
      labelUr: provider.labelUr,
    }));
  }

  /** Public for FulfilmentCron's own poll loop; throws the same way a booking attempt against an unknown key would. */
  getProvider(key: string): CourierProvider {
    const provider = this.providers.get(key);
    if (!provider) {
      throw new BadRequestException(
        `"${key}" is not an available courier. Choose one of: ${[...this.providers.keys()].join(', ')}.`,
      );
    }
    return provider;
  }

  async listShipments(filter?: { status?: ShipmentStatus; manifestId?: string }) {
    return this.prisma.shipment.findMany({
      where: { status: filter?.status, manifestId: filter?.manifestId },
      include: shipmentInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getShipment(id: string) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id }, include: shipmentInclude });
    if (!shipment) throw new NotFoundException('That shipment no longer exists.');
    return shipment;
  }

  async createShipment(dto: CreateShipmentDto, actorId: string): Promise<Shipment> {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: { id: true, number: true, shippingAddress: true },
    });
    if (!order) throw new NotFoundException('That order no longer exists.');

    const providerKey = dto.providerKey ?? 'manual';
    const provider = this.getProvider(providerKey);

    let trackingNumber = dto.trackingNumber ?? null;
    let trackingUrl = dto.trackingUrl ?? null;
    let meta: Record<string, unknown> | undefined;

    if (!trackingNumber) {
      const booked = await provider.createShipment({
        orderId: order.id,
        orderNumber: order.number,
        shippingAddress: (order.shippingAddress as Record<string, unknown>) ?? {},
        weightGrams: dto.weightGrams ?? null,
        packageCount: dto.packageCount ?? 1,
        codAmount: null,
      });
      trackingNumber = booked.trackingNumber;
      trackingUrl = booked.trackingUrl;
      meta = booked.meta;
    }

    const shipment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.shipment.create({
        data: {
          orderId: order.id,
          courier: dto.courier ?? providerKey,
          trackingNumber,
          trackingUrl,
          methodId: dto.methodId,
          weightGrams: dto.weightGrams,
          packageCount: dto.packageCount ?? 1,
          status: 'DISPATCHED',
          dispatchedAt: new Date(),
          lastPolledAt: new Date(),
          meta: meta as Prisma.InputJsonValue | undefined,
          ...(dto.items && dto.items.length > 0
            ? { items: { create: dto.items.map((item) => ({ orderItemId: item.orderItemId, quantity: item.quantity })) } }
            : {}),
        },
      });

      await tx.shipmentEvent.create({
        data: { shipmentId: created.id, status: 'DISPATCHED', rawStatus: null },
      });

      await this.events.publish(
        DomainEvent.ShipmentStatusChanged,
        {
          shipmentId: created.id,
          orderId: order.id,
          orderNumber: order.number,
          fromStatus: 'PENDING',
          toStatus: 'DISPATCHED',
          rawStatus: null,
          isRto: false,
        },
        tx,
      );

      return created;
    });

    await this.audit.record({
      actorId,
      action: 'fulfilment.shipment_created',
      entity: 'Shipment',
      entityId: shipment.id,
      data: { orderId: order.id, courier: shipment.courier, trackingNumber },
    });

    return shipment;
  }

  /**
   * Staff manually recording a status change — the only way a `manual`
   * shipment ever moves, since ManualCourierProvider.track() has nothing to
   * poll (its own doc comment). Goes through the exact same
   * applyStatusChange() a real courier's poll result would.
   */
  async recordStatus(shipmentId: string, dto: RecordShipmentStatusDto, actorId: string): Promise<Shipment> {
    return this.applyStatusChange(shipmentId, { status: dto.status, rawStatus: null }, actorId);
  }

  /**
   * The one writer for a shipment status transition (WO-6.5). Idempotent —
   * re-applying the current status only bumps lastPolledAt, so a retried
   * outbox delivery or a duplicate poll result never double-writes a
   * ShipmentEvent or fires ShipmentStatusChanged twice.
   */
  async applyStatusChange(
    shipmentId: string,
    input: { status: ShipmentStatus; rawStatus?: string | null; meta?: Record<string, unknown> },
    actorId: string | null,
  ): Promise<Shipment> {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { order: { select: { id: true, number: true } } },
    });
    if (!shipment) throw new NotFoundException('That shipment no longer exists.');

    if (shipment.status === input.status) {
      return this.prisma.shipment.update({ where: { id: shipmentId }, data: { lastPolledAt: new Date() } });
    }

    // A courier-initiated RETURNED with no active customer return request is
    // an RTO (WO-6.7) — "active" excludes only REJECTED, so a request still
    // in flight (REQUESTED/APPROVED/...) still counts as "this was asked
    // for", not a surprise RTO.
    const isRto =
      input.status === 'RETURNED' &&
      (await this.prisma.returnRequest.findFirst({
        where: { orderId: shipment.orderId, status: { not: 'REJECTED' } },
        select: { id: true },
      })) === null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.shipment.update({
        where: { id: shipmentId },
        data: {
          status: input.status,
          dispatchedAt: input.status === 'DISPATCHED' ? new Date() : undefined,
          deliveredAt: input.status === 'DELIVERED' ? new Date() : undefined,
          isRto: isRto ? true : undefined,
          rtoAt: isRto ? new Date() : undefined,
          lastPolledAt: new Date(),
          failedAttempts: 0,
        },
      });

      await tx.shipmentEvent.create({
        data: {
          shipmentId,
          status: input.status,
          rawStatus: input.rawStatus ?? null,
          meta: input.meta as Prisma.InputJsonValue | undefined,
        },
      });

      await this.events.publish(
        DomainEvent.ShipmentStatusChanged,
        {
          shipmentId,
          orderId: shipment.orderId,
          orderNumber: shipment.order.number,
          fromStatus: shipment.status,
          toStatus: input.status,
          rawStatus: input.rawStatus ?? null,
          isRto,
        },
        tx,
      );

      if (isRto) {
        await this.events.publish(
          DomainEvent.ShipmentReturnedToOrigin,
          {
            shipmentId,
            orderId: shipment.orderId,
            orderNumber: shipment.order.number,
            courierChargeMinor: (shipment.cost ?? 0) * 2,
            rtoAt: new Date().toISOString(),
          },
          tx,
        );
      }

      return result;
    });

    await this.audit.record({
      actorId,
      action: 'fulfilment.shipment_status_changed',
      entity: 'Shipment',
      entityId: shipmentId,
      data: { fromStatus: shipment.status, toStatus: input.status, isRto },
    });

    return updated;
  }

  // --- Manifests ------------------------------------------------------------

  async listManifests() {
    return this.prisma.manifest.findMany({
      include: { shipments: { select: { id: true, trackingNumber: true, status: true, orderId: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createManifest(dto: CreateManifestDto, actorId: string) {
    const number = await nextManifestNumber(this.prisma, this.settings, this.config);
    const manifest = await this.prisma.manifest.create({
      data: {
        number,
        courierKey: dto.courierKey,
        createdById: actorId,
        ...(dto.shipmentIds && dto.shipmentIds.length > 0
          ? { shipments: { connect: dto.shipmentIds.map((id) => ({ id })) } }
          : {}),
      },
      include: { shipments: true },
    });

    await this.audit.record({
      actorId,
      action: 'fulfilment.manifest_created',
      entity: 'Manifest',
      entityId: manifest.id,
      data: { courierKey: dto.courierKey, shipmentCount: manifest.shipments.length },
    });

    return manifest;
  }

  async addToManifest(manifestId: string, dto: AddToManifestDto, actorId: string) {
    const manifest = await this.prisma.manifest.findUnique({ where: { id: manifestId } });
    if (!manifest) throw new NotFoundException('That manifest no longer exists.');
    if (manifest.status !== 'OPEN') {
      throw new BadRequestException('This manifest has already been dispatched.');
    }

    await this.prisma.shipment.updateMany({
      where: { id: { in: dto.shipmentIds } },
      data: { manifestId },
    });

    await this.audit.record({
      actorId,
      action: 'fulfilment.manifest_shipments_added',
      entity: 'Manifest',
      entityId: manifestId,
      data: { shipmentIds: dto.shipmentIds },
    });

    return this.prisma.manifest.findUniqueOrThrow({ where: { id: manifestId }, include: { shipments: true } });
  }

  /** Dispatches the whole pickup — every PENDING shipment on it moves to DISPATCHED together. */
  async dispatchManifest(manifestId: string, actorId: string) {
    const manifest = await this.prisma.manifest.findUnique({
      where: { id: manifestId },
      include: { shipments: true },
    });
    if (!manifest) throw new NotFoundException('That manifest no longer exists.');
    if (manifest.status === 'DISPATCHED') {
      throw new BadRequestException('This manifest has already been dispatched.');
    }

    for (const shipment of manifest.shipments) {
      if (shipment.status === 'PENDING') {
        await this.applyStatusChange(shipment.id, { status: 'DISPATCHED' }, actorId);
      }
    }

    const dispatched = await this.prisma.manifest.update({
      where: { id: manifestId },
      data: { status: 'DISPATCHED', dispatchedAt: new Date() },
      include: { shipments: true },
    });

    await this.audit.record({
      actorId,
      action: 'fulfilment.manifest_dispatched',
      entity: 'Manifest',
      entityId: manifestId,
      data: { shipmentCount: dispatched.shipments.length },
    });

    return dispatched;
  }

  // --- RTO reporting (WO-6.7) -------------------------------------------------

  /** By city, by product, by order value — the input to the shop's own advance-payment/COD-risk decisions. */
  async rtoStats(from: Date, to: Date) {
    const shipments = await this.prisma.shipment.findMany({
      where: { dispatchedAt: { gte: from, lte: to } },
      select: {
        isRto: true,
        order: {
          select: {
            id: true,
            grandTotal: true,
            shippingAddress: true,
            items: { select: { productId: true, nameEn: true } },
          },
        },
      },
    });

    const byCity = new Map<string, { total: number; rto: number }>();
    const byProduct = new Map<string, { name: string; total: number; rto: number }>();
    const bands = [
      { label: 'Under Rs 1,000', max: 100_000 },
      { label: 'Rs 1,000–3,000', max: 300_000 },
      { label: 'Rs 3,000–5,000', max: 500_000 },
      { label: 'Rs 5,000+', max: Infinity },
    ];
    const byOrderValue = bands.map((band) => ({ label: band.label, total: 0, rto: 0 }));

    for (const shipment of shipments) {
      const city = readCity(shipment.order.shippingAddress) ?? 'Unknown';
      const cityStats = byCity.get(city) ?? { total: 0, rto: 0 };
      cityStats.total += 1;
      if (shipment.isRto) cityStats.rto += 1;
      byCity.set(city, cityStats);

      const bandIndex = bands.findIndex((b) => shipment.order.grandTotal <= b.max);
      const band = byOrderValue[bandIndex === -1 ? byOrderValue.length - 1 : bandIndex];
      band.total += 1;
      if (shipment.isRto) band.rto += 1;

      for (const item of shipment.order.items) {
        const key = item.productId ?? item.nameEn;
        const productStats = byProduct.get(key) ?? { name: item.nameEn, total: 0, rto: 0 };
        productStats.total += 1;
        if (shipment.isRto) productStats.rto += 1;
        byProduct.set(key, productStats);
      }
    }

    const totalShipments = shipments.length;
    const totalRto = shipments.filter((s) => s.isRto).length;

    const toRateRows = <T extends { total: number; rto: number }>(map: Iterable<[string, T]>) =>
      [...map].map(([key, stats]) => ({
        key,
        total: stats.total,
        rto: stats.rto,
        ratePercent: stats.total === 0 ? 0 : Math.round((stats.rto / stats.total) * 1000) / 10,
      }));

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      overallRatePercent: totalShipments === 0 ? 0 : Math.round((totalRto / totalShipments) * 1000) / 10,
      totalShipments,
      totalRto,
      byCity: toRateRows(byCity.entries()).sort((a, b) => b.rto - a.rto),
      byProduct: [...byProduct.entries()]
        .map(([key, stats]) => ({
          key,
          name: stats.name,
          total: stats.total,
          rto: stats.rto,
          ratePercent: stats.total === 0 ? 0 : Math.round((stats.rto / stats.total) * 1000) / 10,
        }))
        .sort((a, b) => b.rto - a.rto),
      byOrderValue: byOrderValue.map((band) => ({
        key: band.label,
        total: band.total,
        rto: band.rto,
        ratePercent: band.total === 0 ? 0 : Math.round((band.rto / band.total) * 1000) / 10,
      })),
    };
  }
}

function readCity(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const city = (value as Record<string, unknown>).city;
  return typeof city === 'string' && city.trim() ? city.trim() : null;
}
