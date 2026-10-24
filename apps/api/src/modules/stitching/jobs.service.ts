import { documentPrefix } from '../../core/settings/document-prefix';
import { documentNumber } from '../../core/settings/document-number';
import { AppConfigService } from '../../core/config/app-config.service';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { getPersonFullName, nextStage, previousStage, STITCHING_STAGES } from '@newax/shared';
import { AuditService } from '../../core/audit/audit.service';
import { assertCanManage } from '../../core/auth/ownership.guard';
import { DomainEvent } from '../../core/events/domain-events';
import { EventBusService } from '../../core/events/event-bus.service';
import { EntityEnrichmentRegistry } from '../../core/extension-points/entity-enrichment.registry';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import { StorageService } from '../../core/storage/storage.service';
import type { Prisma, StitchingStage } from '../../core/prisma/client';

/**
 * `orderItem` used to be a Prisma relation include here. StitchingJob (an
 * apparel-pack model) is allowed to reference OrderItem (core) — the
 * violation ran the other way, requiring OrderItem to declare a typed
 * `stitchingJob` field, which made core.prisma unable to compile without
 * the apparel schema present (B7, MULTI-SECTOR.md). `orderItemId` is now a
 * plain scalar column with no Prisma relation; attachOrderContext() below
 * does the join in application code instead.
 */
const jobInclude = {
  garmentType: true,
  events: {
    orderBy: { createdAt: 'asc' }
  },
  stitchingOrder: {
    select: { id: true, number: true, guestName: true, guestPhone: true, status: true },
  },
} satisfies Prisma.StitchingJobInclude;


/**
 * The tailor queue.
 *
 * A job attaches to EITHER an order line (stitching bought with fabric) or a
 * standalone stitching order (the customer sent their own cloth). One model,
 * one queue, two doors — the tailor's screen does not care which door a job
 * came in through.
 */
@Injectable()
export class StitchingJobsService implements OnModuleInit {
  private readonly logger = new Logger(StitchingJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly settings: SettingsService,
    private readonly config: AppConfigService,
    private readonly enrichment: EntityEnrichmentRegistry,
  ) {}

  /**
   * Registers this pack's contribution to the order-detail response — see
   * EntityEnrichmentRegistry. Legal because stitching (a pack) is depending
   * on core's registry, not the other way round.
   */
  onModuleInit(): void {
    this.enrichment.register('orderItem.stitchingJob', {
      enrich: async (orderItemIds) => {
        const jobs = await this.prisma.stitchingJob.findMany({
          where: { orderItemId: { in: orderItemIds } },
          select: {
            orderItemId: true,
            number: true,
            stage: true,
            dueAt: true,
            events: {
              select: { fromStage: true, toStage: true, createdAt: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        });
        return new Map(
          jobs
            .filter((job): job is typeof job & { orderItemId: string } => job.orderItemId !== null)
            .map(({ orderItemId, ...rest }) => [orderItemId, rest] as const),
        );
      },
    });
  }

  /**
   * Batches everything `jobInclude` used to get for free via Prisma
   * relations, before StitchingJob's User relations (assignedTailor, and
   * each event's actor) were dropped in the same pass that removed its
   * OrderItem relation. Unlike orderItemId (core), assignedTailorId/actorId
   * point at User, which is also core — stitching (a pack) depending on it
   * is the legal direction, so this is a plain manual join, not an
   * extension-point registration. One query per lookup regardless of how
   * many jobs.
   */
  private async attachOrderContext<
    T extends {
      orderItemId: string | null;
      assignedTailorId?: string | null;
      events?: ReadonlyArray<{ actorId: string | null }>;
    },
  >(jobOrJobs: T | T[]): Promise<T | T[]> {
    const jobs = Array.isArray(jobOrJobs) ? jobOrJobs : [jobOrJobs];
    const orderItemIds = jobs
      .map((job) => job.orderItemId)
      .filter((id): id is string => id !== null);

    const items =
      orderItemIds.length === 0
        ? []
        : await this.prisma.orderItem.findMany({
            where: { id: { in: orderItemIds } },
            select: {
              id: true,
              orderId: true,
              order: {
                select: {
                  id: true,
                  number: true,
                  guestName: true,
                  guestPhone: true,
                  status: true,
                  placedAt: true,
                },
              },
            },
          });
    const byItemId = new Map(items.map((item) => [item.id, item]));

    const userIds = new Set<string>();
    for (const job of jobs) {
      if (job.assignedTailorId) userIds.add(job.assignedTailorId);
      for (const event of job.events ?? []) {
        if (event.actorId) userIds.add(event.actorId);
      }
    }
    const users =
      userIds.size === 0
        ? []
        : await this.prisma.user.findMany({
            where: { id: { in: [...userIds] } },
            select: { id: true, firstName: true, lastName: true },
          });
    const userById = new Map(users.map((user) => [user.id, user]));

    for (const job of jobs) {
      (job as unknown as { orderItem: unknown }).orderItem =
        job.orderItemId !== null ? (byItemId.get(job.orderItemId) ?? null) : null;
      (job as unknown as { assignedTailor: unknown }).assignedTailor = job.assignedTailorId
        ? (userById.get(job.assignedTailorId) ?? null)
        : null;
      for (const event of job.events ?? []) {
        (event as unknown as { actor: unknown }).actor = event.actorId
          ? (userById.get(event.actorId) ?? null)
          : null;
      }
    }
    return jobOrJobs;
  }

  /**
   * Creates the job for a stitched order line.
   *
   * Idempotent on orderItemId, because it runs from an at-least-once event: a
   * redelivered order.placed must not produce a second job for the same
   * garment.
   */
  async createForOrderItem(orderItemId: string) {
    const existing = await this.prisma.stitchingJob.findUnique({
      where: { orderItemId },
      include: jobInclude,
    });
    if (existing) return this.attachOrderContext(existing);

    const item = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
      include: { order: { select: { number: true } } },
    });

    if (!item) throw new NotFoundException('That order line no longer exists.');
    if (!item.garmentTypeKey) {
      throw new BadRequestException('That order line has no stitching on it.');
    }

    const garmentType = await this.prisma.garmentType.findUniqueOrThrow({
      where: { key: item.garmentTypeKey },
    });

    const leadDays = await this.settings.get<number>(SettingKey.StitchingLeadDays);

    const job = await this.prisma.$transaction(async (tx) => {
      const created = await tx.stitchingJob.create({
        data: {
          number: await nextJobNumber(tx, this.settings, this.config),
          orderItemId,
          garmentTypeId: garmentType.id,
          measurementSnapshot: item.measurementSnapshot as Prisma.InputJsonValue,
          optionsSnapshot: item.optionsSnapshot as Prisma.InputJsonValue,
          instructions: item.stitchingNotes,
          stage: 'RECEIVED',
          dueAt: addWorkingDays(new Date(), leadDays),
          events: { create: { toStage: 'RECEIVED', note: `From order ${item.order.number}` } },
        },
        include: jobInclude,
      });

      await this.events.publish(
        DomainEvent.StitchingJobCreated,
        {
          jobId: created.id,
          jobNumber: created.number,
          fromStage: null,
          toStage: 'RECEIVED',
          assignedTailorId: null,
          orderId: item.orderId,
          stitchingOrderId: null,
          variantId: item.variantId,
          quantity: item.quantity,
        },
        tx,
      );

      return created;
    });

    this.logger.log(`Job ${job.number} queued for ${garmentType.labelEn}`);
    return this.attachOrderContext(job);
  }

  async list(query: {
    stage?: StitchingStage;
    tailorId?: string;
    overdue?: boolean;
  }) {
    const where: Prisma.StitchingJobWhereInput = {};

    if (query.stage) where.stage = query.stage;
    if (query.tailorId) where.assignedTailorId = query.tailorId;
    if (query.overdue) {
      where.dueAt = { lt: new Date() };
      where.stage = { notIn: ['READY', 'DISPATCHED'] };
    }

    const jobs = await this.prisma.stitchingJob.findMany({
      where,
      include: jobInclude,
      // Oldest due date first: the queue is a to-do list, not a log.
      orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });
    return this.attachOrderContext(jobs);
  }

  async get(id: string) {
    const job = await this.prisma.stitchingJob.findUnique({
      where: { id },
      include: jobInclude,
    });
    if (!job) throw new NotFoundException('That job no longer exists.');
    return this.attachOrderContext(job);
  }

  async assign(actorId: string, jobId: string, tailorId: string | null) {
    if (tailorId) {
      const tailor = await this.prisma.user.findUnique({ where: { id: tailorId } });
      if (!tailor || tailor.role !== 'TAILOR') {
        throw new BadRequestException('That person is not a tailor.');
      }
    }

    const job = await this.prisma.stitchingJob.update({
      where: { id: jobId },
      data: { assignedTailorId: tailorId },
      include: jobInclude,
    });

    await this.audit.record({
      actorId,
      action: 'stitching_job.assigned',
      entity: 'StitchingJob',
      entityId: jobId,
      data: { tailorId },
    });

    return this.attachOrderContext(job);
  }

  /**
   * Advances a job one stage, or sends it back one after a failed QC.
   *
   * The stages are a straight line and only neighbours are reachable, so the
   * customer's progress timeline is always a story that makes sense rather than
   * a jumble of whatever staff clicked.
   */
  async changeStage(
    actor: { id: string; permissions: string[] },
    jobId: string,
    toStage: StitchingStage,
    note?: string,
    photo?: { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    const job = await this.prisma.stitchingJob.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new NotFoundException('That job no longer exists.');
    const orderItemForEvent = job.orderItemId
      ? await this.prisma.orderItem.findUnique({
          where: { id: job.orderItemId },
          select: { orderId: true },
        })
      : null;

    // manage_all (staff/admin) may move anything; everyone else needs
    // manage_own AND to be the job's own assigned tailor.
    assertCanManage(actor, 'stitching.jobs', { ownerId: job.assignedTailorId });

    if (job.stage === toStage) return this.get(jobId);

    const forward = nextStage(job.stage);
    const back = previousStage(job.stage);

    if (toStage !== forward && toStage !== back) {
      throw new BadRequestException(
        `A job at ${job.stage.toLowerCase()} can only move to ${[forward, back]
          .filter(Boolean)
          .map((stage) => stage!.toLowerCase())
          .join(' or ')}.`,
      );
    }

    // Sending work backwards is a rework; say why.
    if (toStage === back && !note?.trim()) {
      throw new BadRequestException('Say why the job is going back a stage.');
    }

    let photoUrl: string | null = null;
    if (photo) {
      const stored = await this.storage.putImage({
        folder: 'stitching-jobs',
        filename: photo.originalname,
        contentType: photo.mimetype,
        body: photo.buffer,
      });
      photoUrl = stored.url;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.stitchingJob.update({
        where: { id: jobId },
        data: {
          stage: toStage,
          ...(toStage === 'CUTTING' && !job.startedAt ? { startedAt: new Date() } : {}),
          ...(toStage === 'READY' ? { completedAt: new Date() } : {}),
        },
        include: jobInclude,
      });

      await tx.stitchingJobEvent.create({
        data: {
          jobId,
          fromStage: job.stage,
          toStage,
          note: note?.trim() || null,
          photoUrl,
          actorId: actor.id,
        },
      });

      await this.events.publish(
        DomainEvent.StitchingJobStageChanged,
        {
          jobId,
          jobNumber: job.number,
          fromStage: job.stage,
          toStage,
          assignedTailorId: job.assignedTailorId,
          orderId: orderItemForEvent?.orderId ?? null,
          stitchingOrderId: job.stitchingOrderId,
        },
        tx,
      );

      return result;
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'stitching_job.stage_changed',
      entity: 'StitchingJob',
      entityId: jobId,
      data: { from: job.stage, to: toStage, note },
    });

    return this.attachOrderContext(updated);
  }

  /** How the queue looks at a glance, for the dashboard and the tailor view. */
  async workload() {
    const [byStage, byTailor] = await Promise.all([
      this.prisma.stitchingJob.groupBy({ by: ['stage'], _count: { _all: true } }),
      this.prisma.stitchingJob.groupBy({
        by: ['assignedTailorId'],
        where: { stage: { notIn: ['READY', 'DISPATCHED'] } },
        _count: { _all: true },
      }),
    ]);

    const tailors = await this.prisma.user.findMany({
      where: { role: 'TAILOR', isActive: true },
      select: { id: true, firstName: true, lastName: true },
    });

    /*
     * Fetched separately and joined here, because TailorProfile has a unique
     * userId but no Prisma `@relation` to User — so it cannot be `include`d,
     * and the `(tailor as any).tailorProfile` this replaces was reading a
     * property that never existed on the row. It was always undefined, which
     * the `?? 0` then turned into a capacity of zero for every tailor, and
     * the workload bars on the stitching page divide by that figure. Every
     * bar has been rendering empty regardless of the real workload.
     */
    const profiles = await this.prisma.tailorProfile.findMany({
      where: { userId: { in: tailors.map((tailor) => tailor.id) } },
      select: { userId: true, displayName: true, capacityPerWeek: true },
    });
    const profileByUser = new Map(profiles.map((profile) => [profile.userId, profile]));

    return {
      byStage: STITCHING_STAGES.map((stage) => ({
        stage,
        count: byStage.find((row) => row.stage === stage)?._count._all ?? 0,
      })),
      tailors: tailors.map((tailor) => ({
        id: tailor.id,
        name: profileByUser.get(tailor.id)?.displayName ?? getPersonFullName(tailor),
        capacityPerWeek: profileByUser.get(tailor.id)?.capacityPerWeek ?? 0,
        openJobs:
          byTailor.find((row) => row.assignedTailorId === tailor.id)?._count._all ?? 0,
      })),
      unassigned:
        byTailor.find((row) => row.assignedTailorId === null)?._count._all ?? 0,
    };
  }
}

/**
 * JOB-2026-0001, sequential within the year. Shared by both places a job is
 * born — a checkout stitching item (here) and a bring-your-own-fabric
 * booking (stitching-orders.service.ts) — so it lives here, exported, rather
 * than as two copies that could drift.
 *
 * Backed by StitchingJobNumberCounter's atomic INSERT ... ON CONFLICT DO
 * UPDATE ... RETURNING, not a MAX(StitchingJob.number) read: the latter is a
 * read-then-write race between two concurrent jobs (same story as
 * nextOrderNumber() in orders/orders.service.ts, which had exactly this bug).
 * A booking that creates several jobs at once just calls this once per job —
 * each call is its own atomic step, so sequential calls on the same
 * transaction still hand out distinct, gapless-under-success numbers.
 */
export async function nextJobNumber(
  tx: Prisma.TransactionClient,
  settings: SettingsService,
  config: AppConfigService,
): Promise<string> {
  const year = new Date().getFullYear();
  // The prefix is a Setting, so a shop can match paperwork it already
  // numbers its own way. See core/settings/document-prefix.ts.
  const prefix = await documentPrefix(settings, 'stitchingJob');

  const [{ counter }] = await tx.$queryRaw<Array<{ counter: number }>>`
    INSERT INTO "StitchingJobNumberCounter" ("year", "counter") VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "counter" = "StitchingJobNumberCounter"."counter" + 1
    RETURNING "counter"
  `;

  return documentNumber(config, prefix, year, counter);
}

/** Promised dates skip Sundays, the one day the workshop is shut. */
export function addWorkingDays(from: Date, days: number): Date {
  const date = new Date(from);
  let remaining = days;

  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0) remaining -= 1;
  }

  return date;
}
