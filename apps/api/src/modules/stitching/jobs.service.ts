import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { nextStage, previousStage, STITCHING_STAGES } from '@yaseen/shared';
import { AuditService } from '../../core/audit/audit.service';
import { DomainEvent } from '../../core/events/domain-events';
import { EventBusService } from '../../core/events/event-bus.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import { StorageService } from '../../core/storage/storage.service';
import type { Prisma, StitchingStage } from '../../core/prisma/client';

const jobInclude = {
  garmentType: true,
  assignedTailor: { select: { id: true, firstName: true, lastName: true } },
  events: {
    orderBy: { createdAt: 'asc' },
    include: { actor: { select: { id: true, firstName: true } } },
  },
  orderItem: {
    include: {
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
export class StitchingJobsService {
  private readonly logger = new Logger(StitchingJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly settings: SettingsService,
  ) {}

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
    if (existing) return existing;

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
          number: await nextJobNumber(tx),
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
        },
        tx,
      );

      return created;
    });

    this.logger.log(`Job ${job.number} queued for ${garmentType.labelEn}`);
    return job;
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

    return this.prisma.stitchingJob.findMany({
      where,
      include: jobInclude,
      // Oldest due date first: the queue is a to-do list, not a log.
      orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });
  }

  async get(id: string) {
    const job = await this.prisma.stitchingJob.findUnique({
      where: { id },
      include: jobInclude,
    });
    if (!job) throw new NotFoundException('That job no longer exists.');
    return job;
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

    return job;
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
      include: { orderItem: { select: { orderId: true } } },
    });
    if (!job) throw new NotFoundException('That job no longer exists.');

    // manage_all (staff/admin) may move anything; everyone else needs
    // manage_own AND to be the job's own assigned tailor.
    const canManageAll = actor.permissions.includes('stitching.jobs.manage_all');
    const canManageOwn = actor.permissions.includes('stitching.jobs.manage_own');
    if (!canManageAll && (!canManageOwn || job.assignedTailorId !== actor.id)) {
      throw new ForbiddenException('That job is assigned to another tailor.');
    }

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
          orderId: job.orderItem?.orderId ?? null,
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

    return updated;
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
      select: { id: true, firstName: true, lastName: true, tailorProfile: true },
    });

    return {
      byStage: STITCHING_STAGES.map((stage) => ({
        stage,
        count: byStage.find((row) => row.stage === stage)?._count._all ?? 0,
      })),
      tailors: tailors.map((tailor) => ({
        id: tailor.id,
        name:
          tailor.tailorProfile?.displayName ??
          [tailor.firstName, tailor.lastName].filter(Boolean).join(' '),
        capacityPerWeek: tailor.tailorProfile?.capacityPerWeek ?? 0,
        openJobs:
          byTailor.find((row) => row.assignedTailorId === tailor.id)?._count._all ?? 0,
      })),
      unassigned:
        byTailor.find((row) => row.assignedTailorId === null)?._count._all ?? 0,
    };
  }
}

/** JOB-2026-0001, sequential within the year. */
async function nextJobNumber(tx: Prisma.TransactionClient): Promise<string> {
  const prefix = `JOB-${new Date().getFullYear()}-`;

  const latest = await tx.stitchingJob.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });

  const sequence = latest ? Number.parseInt(latest.number.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(sequence).padStart(4, '0')}`;
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
