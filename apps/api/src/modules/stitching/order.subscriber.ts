import { Injectable, Logger } from '@nestjs/common';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { DomainEvent, type OrderPlacedPayload } from '../../core/events/domain-events';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { StitchingJobsService } from './jobs.service';

/**
 * Turns the stitched lines of a new order into tailor jobs, and tells the
 * customer when their garment reaches a stage worth hearing about.
 *
 * Like the CRM subscriber, this needed no edit to the orders module — the event
 * already named the stitched line ids.
 */
@Injectable()
export class StitchingOrderSubscriber {
  private readonly logger = new Logger(StitchingOrderSubscriber.name);

  constructor(
    private readonly jobs: StitchingJobsService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @OnDomainEvent(DomainEvent.OrderPlaced)
  async onOrderPlaced(payload: OrderPlacedPayload): Promise<void> {
    if (payload.stitchingItemIds.length === 0) return;

    for (const orderItemId of payload.stitchingItemIds) {
      // createForOrderItem is idempotent on the line id, so a redelivered
      // event cannot queue the same garment twice.
      await this.jobs.createForOrderItem(orderItemId);
    }

    this.logger.log(
      `Queued ${payload.stitchingItemIds.length} tailoring job(s) for ${payload.orderNumber}`,
    );
  }

  /**
   * Tells the customer their garment has moved on.
   *
   * Every stage is announced, because the whole point of the mobile app's push
   * notifications is watching a garment being made. Channels that cost money to
   * send — SMS, WhatsApp — can filter on the template and take only
   * `stitching.ready`; nothing here has to change when they do.
   */
  @OnDomainEvent(DomainEvent.StitchingJobStageChanged)
  async onStageChanged(payload: {
    jobId: string;
    jobNumber: string;
    toStage: string;
  }): Promise<void> {
    const job = await this.prisma.stitchingJob.findUnique({
      where: { id: payload.jobId },
      include: {
        garmentType: true,
        orderItem: {
          include: {
            order: {
              select: {
                number: true,
                userId: true,
                guestName: true,
                guestPhone: true,
                guestEmail: true,
              },
            },
          },
        },
        stitchingOrder: {
          select: {
            number: true,
            userId: true,
            guestName: true,
            guestPhone: true,
            guestEmail: true,
          },
        },
      },
    });

    const customer = job?.orderItem?.order ?? job?.stitchingOrder;
    if (!job || !customer) return;

    const reference = job.orderItem?.order.number ?? job.stitchingOrder?.number;
    const ready = payload.toStage === 'READY';

    await this.notifications.send({
      template: ready ? 'stitching.ready' : 'stitching.stage_changed',
      recipient: {
        name: customer.guestName,
        phone: customer.guestPhone,
        email: customer.guestEmail,
        userId: customer.userId,
      },
      subject: ready
        ? `Your ${job.garmentType.labelEn} is ready`
        : `Your ${job.garmentType.labelEn}: ${STAGE_WORDS[payload.toStage] ?? payload.toStage}`,
      body: ready
        ? `Your ${job.garmentType.labelEn} for ${reference} has been stitched and checked. It will be dispatched shortly.`
        : `${reference} — ${STAGE_WORDS[payload.toStage] ?? payload.toStage}.`,
      data: { jobNumber: job.number, stage: payload.toStage, reference },
    });
  }
}

/** What each stage means to a customer, rather than to the workshop. */
const STAGE_WORDS: Record<string, string> = {
  RECEIVED: 'received by the workshop',
  CUTTING: 'being cut',
  STITCHING: 'being stitched',
  QC: 'being checked',
  READY: 'ready',
  DISPATCHED: 'on its way',
};
