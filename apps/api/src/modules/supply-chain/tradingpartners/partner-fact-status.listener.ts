import { Injectable, Logger } from "@nestjs/common";
import { OnDomainEvent } from "../../../core/events/on-domain-event.decorator";
import {
  DomainEvent,
  type PartnerFactAppliedPayload,
  type PartnerFactNeedsReviewPayload,
} from "../../../core/events/domain-events";
import { PrismaService } from "../../../core/prisma/prisma.service";

/** The reason is shown to an operator; bound it so a chatty subscriber cannot store an essay. */
const MAX_REASON_LENGTH = 500;

/**
 * Keeps `PartnerFactInbox.status` in step with what the subscriber that owns a
 * fact's effect decided (WO-213.1). The inbox belongs to this module, and
 * `purchasing` (or any future subscriber) must not write to it, so the answer
 * comes back as an event.
 *
 * Delivery is at-least-once, so every write carries a status predicate and is
 * a no-op when the row has already moved on: a repeated "applied" changes
 * nothing, and a late "needs review" can never pull an APPLIED fact backwards.
 */
@Injectable()
export class PartnerFactStatusListener {
  private readonly logger = new Logger(PartnerFactStatusListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnDomainEvent(DomainEvent.PartnerFactApplied)
  async onApplied(payload: PartnerFactAppliedPayload): Promise<void> {
    const { count } = await this.prisma.partnerFactInbox.updateMany({
      where: {
        id: payload.inboxId,
        status: { in: ["RECEIVED", "NEEDS_REVIEW"] },
      },
      data: {
        status: "APPLIED",
        statusReason: null,
        appliedPurchaseOrderId: payload.purchaseOrderId ?? null,
      },
    });
    this.logger.log(
      count === 1
        ? `partner fact applied: inbox=${payload.inboxId} factId=${payload.factId}`
        : `partner fact already settled, ignored: inbox=${payload.inboxId}`,
    );
  }

  @OnDomainEvent(DomainEvent.PartnerFactNeedsReview)
  async onNeedsReview(payload: PartnerFactNeedsReviewPayload): Promise<void> {
    const { count } = await this.prisma.partnerFactInbox.updateMany({
      where: { id: payload.inboxId, status: "RECEIVED" },
      data: {
        status: "NEEDS_REVIEW",
        statusReason: payload.reason.slice(0, MAX_REASON_LENGTH),
      },
    });
    this.logger.log(
      count === 1
        ? `partner fact needs review: inbox=${payload.inboxId} factId=${payload.factId}`
        : `partner fact already settled, ignored: inbox=${payload.inboxId}`,
    );
  }
}
