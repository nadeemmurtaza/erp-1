import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { normalizePkPhone } from '@newax/shared';
import { AuditService } from '../../core/audit/audit.service';
import { DomainEvent } from '../../core/events/domain-events';
import { EventBusService } from '../../core/events/event-bus.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import type { Prisma, StitchingOrderStatus } from '../../core/prisma/client';
import { addWorkingDays, nextJobNumber } from './jobs.service';

const stitchingOrderInclude = {
  jobs: {
    include: {
      garmentType: true,
            events: { orderBy: { createdAt: 'asc' } },
    },
  },
} satisfies Prisma.StitchingOrderInclude;

export interface BookStitchingInput {
  name: string;
  phone: string;
  email?: string;
  garments: Array<{
    garmentTypeId: string;
    measurementProfileId?: string;
    /** Free-form measurements for a customer with no account. */
    measurements?: Record<string, number>;
    instructions?: string;
  }>;
  pickupAddress?: Record<string, unknown>;
  deliveryAddress?: Record<string, unknown>;
  fabricNotes?: string;
}

/**
 * Tailoring where the customer supplies the cloth.
 *
 * The shop has not been paid and has no fabric yet, so the booking starts at
 * AWAITING_FABRIC and its jobs do not enter the tailor queue until someone
 * confirms the cloth actually arrived.
 */
@Injectable()
export class StitchingOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  async book(userId: string | undefined, input: BookStitchingInput) {
    const phone = normalizePkPhone(input.phone).e164;
    if (!phone) {
      throw new BadRequestException(
        'Enter a valid phone number so we can arrange collection.',
      );
    }
    if (input.garments.length === 0) {
      throw new BadRequestException('Say what you would like stitched.');
    }

    const leadDays = await this.settings.get<number>(SettingKey.StitchingLeadDays);

    // Resolve every garment before writing anything, so a bad one fails the
    // whole booking rather than leaving half of it recorded.
    const garments = await Promise.all(
      input.garments.map(async (garment) => {
        const garmentType = await this.prisma.garmentType.findUnique({
          where: { id: garment.garmentTypeId },
          include: { fields: true },
        });
        if (!garmentType) {
          throw new NotFoundException('One of the garments is not something we stitch.');
        }

        let measurements: unknown = garment.measurements ?? null;

        if (garment.measurementProfileId) {
          const profile = await this.prisma.measurementProfile.findUnique({
            where: { id: garment.measurementProfileId },
            include: { garmentType: true },
          });

          if (!profile) throw new NotFoundException('That measurement profile is gone.');
          if (userId && profile.userId !== userId) {
            throw new ForbiddenException('That profile belongs to another account.');
          }
          if (profile.garmentTypeId !== garmentType.id) {
            throw new BadRequestException(
              `Those measurements are for a ${profile.garmentType.labelEn}, not a ${garmentType.labelEn}.`,
            );
          }

          measurements = { label: profile.label, values: profile.values };
        }

        if (!measurements) {
          throw new BadRequestException(
            `Give measurements for the ${garmentType.labelEn}, or choose a saved profile.`,
          );
        }

        return { garmentType, measurements, instructions: garment.instructions ?? null };
      }),
    );

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.stitchingOrder.create({
        data: {
          number: await nextStitchingOrderNumber(tx),
          userId: userId ?? null,
          status: 'AWAITING_FABRIC',
          guestName: input.name.trim(),
          guestPhone: phone,
          guestEmail: input.email ?? null,
          pickupAddress: (input.pickupAddress ?? undefined) as Prisma.InputJsonValue,
          deliveryAddress: (input.deliveryAddress ?? undefined) as Prisma.InputJsonValue,
          fabricNotes: input.fabricNotes ?? null,
          promisedAt: addWorkingDays(new Date(), leadDays),
          jobs: {
            create: await Promise.all(
              garments.map(async (garment) => ({
                number: await nextJobNumber(tx),
                garmentTypeId: garment.garmentType.id,
                measurementSnapshot: garment.measurements as Prisma.InputJsonValue,
                instructions: garment.instructions,
                stage: 'RECEIVED' as const,
                dueAt: addWorkingDays(new Date(), leadDays),
              })),
            ),
          },
        },
        include: stitchingOrderInclude,
      });

      await this.events.publish(
        DomainEvent.StitchingOrderCreated,
        { stitchingOrderId: created.id, number: created.number },
        tx,
      );

      return created;
    });
  }

  async list(status?: StitchingOrderStatus) {
    return this.prisma.stitchingOrder.findMany({
      where: status ? { status } : {},
      include: stitchingOrderInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async get(id: string) {
    const order = await this.prisma.stitchingOrder.findUnique({
      where: { id },
      include: stitchingOrderInclude,
    });
    if (!order) throw new NotFoundException('That booking no longer exists.');
    return order;
  }

  async findByNumber(number: string, phone: string) {
    const order = await this.prisma.stitchingOrder.findUnique({
      where: { number },
      include: stitchingOrderInclude,
    });

    if (!order) throw new NotFoundException('No booking with that number.');
    if (order.guestPhone !== normalizePkPhone(phone).e164) {
      throw new ForbiddenException('That number does not match this booking.');
    }

    return order;
  }

  /**
   * Records that the customer's cloth arrived, which is what releases the jobs
   * into the workshop.
   */
  async markFabricReceived(actorId: string, id: string, note?: string) {
    const order = await this.get(id);

    if (order.fabricReceivedAt) {
      throw new BadRequestException('The fabric for this booking is already logged in.');
    }

    const updated = await this.prisma.stitchingOrder.update({
      where: { id },
      data: {
        status: 'FABRIC_RECEIVED',
        fabricReceivedAt: new Date(),
        staffNotes: note ?? order.staffNotes,
      },
      include: stitchingOrderInclude,
    });

    await this.audit.record({
      actorId,
      action: 'stitching_order.fabric_received',
      entity: 'StitchingOrder',
      entityId: id,
      data: { number: order.number },
    });

    return updated;
  }

  async quote(actorId: string, id: string, fee: number) {
    const updated = await this.prisma.stitchingOrder.update({
      where: { id },
      data: { quotedFee: fee },
      include: stitchingOrderInclude,
    });

    await this.audit.record({
      actorId,
      action: 'stitching_order.quoted',
      entity: 'StitchingOrder',
      entityId: id,
      data: { fee },
    });

    return updated;
  }

  async changeStatus(actorId: string, id: string, status: StitchingOrderStatus) {
    const updated = await this.prisma.stitchingOrder.update({
      where: { id },
      data: { status },
      include: stitchingOrderInclude,
    });

    await this.audit.record({
      actorId,
      action: 'stitching_order.status_changed',
      entity: 'StitchingOrder',
      entityId: id,
      data: { status },
    });

    return updated;
  }
}

/**
 * STO-2026-0001, sequential within the year. Backed by
 * StitchingOrderNumberCounter's atomic INSERT ... ON CONFLICT DO UPDATE ...
 * RETURNING rather than a MAX(StitchingOrder.number) read — see
 * nextJobNumber() in jobs.service.ts (same fix, same underlying race) and
 * nextOrderNumber() in orders/orders.service.ts (the original bug).
 */
async function nextStitchingOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `STO-${year}-`;

  const [{ counter }] = await tx.$queryRaw<Array<{ counter: number }>>`
    INSERT INTO "StitchingOrderNumberCounter" ("year", "counter") VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "counter" = "StitchingOrderNumberCounter"."counter" + 1
    RETURNING "counter"
  `;

  return `${prefix}${String(counter).padStart(4, '0')}`;
}
