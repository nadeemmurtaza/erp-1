import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { paginated, type PaginatedResult } from '../../../core/common/dto/pagination.dto';
import { AuditService } from '../../../core/audit/audit.service';
import { EventBusService } from '../../../core/events/event-bus.service';
import { DomainEvent } from '../../../core/events/domain-events';
import { IdentityVerificationStatusRegistry } from '../../../core/extension-points/identity-verification-status.registry';
import type { MerchantPayable, MerchantPayableStatus } from '../../../core/prisma/client';

/**
 * doc 155 §3 (WO-155.3) — the exact mirror of doc 145's own AP side
 * (`SupplierBill`): a merchant selling through this platform is, for
 * settlement purposes, a vendor Newax owes money to, never a party whose
 * own money Newax was ever holding. Ships module-off — see wallet.module.ts.
 */
@Injectable()
export class MerchantPayableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventBusService,
    private readonly identityVerification: IdentityVerificationStatusRegistry,
  ) {}

  async findOne(id: string): Promise<MerchantPayable> {
    const payable = await this.prisma.merchantPayable.findUnique({ where: { id } });
    if (!payable) throw new NotFoundException('Merchant payable not found.');
    return payable;
  }

  async findForMerchant(
    organizationId: string,
    query: { skip: number; take: number; order: 'asc' | 'desc'; status?: MerchantPayableStatus },
  ): Promise<PaginatedResult<MerchantPayable>> {
    const where = { organizationId, status: query.status };
    const [rows, total] = await Promise.all([
      this.prisma.merchantPayable.findMany({ where, skip: query.skip, take: query.take, orderBy: { createdAt: query.order } }),
      this.prisma.merchantPayable.count({ where }),
    ]);
    return paginated(rows, total, { page: Math.floor(query.skip / query.take) + 1, pageSize: query.take });
  }

  /**
   * Note: in ordinary use `WalletService.onMerchantConfirmed()` creates the
   * MerchantPayable itself, in the same transaction as the REDEEM entry
   * (§3's own "one transaction" rule) — this method exists for a caller
   * that needs the payable created as a step independent of a wallet
   * redemption (e.g. a non-wallet settlement path), and is idempotent on
   * `orderId` exactly the same way.
   */
  async createMerchantPayable(orderId: string, grossMinor: number, merchantOrganizationId: string, transactionFeeBps: number): Promise<MerchantPayable> {
    const existing = await this.prisma.merchantPayable.findUnique({ where: { orderId } });
    if (existing) return existing;

    const feeMinor = Math.round((grossMinor * transactionFeeBps) / 10_000);
    const payable = await this.prisma.merchantPayable.create({
      data: {
        organizationId: merchantOrganizationId,
        orderId,
        grossMinor,
        platformFeeMinor: feeMinor,
        netPayableMinor: grossMinor - feeMinor,
      },
    });

    await this.events.publish(DomainEvent.MerchantPayableCreated, {
      merchantPayableId: payable.id,
      organizationId: merchantOrganizationId,
      orderId,
      netPayableMinor: payable.netPayableMinor,
    });

    return payable;
  }

  /**
   * Verified: the NEXT payout run (as soon as operationally possible) —
   * every OPEN payable for this merchant is scheduled now. Unverified: held
   * until the customer's own "confirm receipt" signal. This codebase does
   * not yet build doc 07's own confirm-receipt flow as a distinct action
   * (checked directly — no such event/model exists), so this method uses
   * the closest concrete signal it already has: `Order.status ===
   * 'DELIVERED'`, the same status this codebase already treats as the
   * customer having the goods in hand elsewhere in the order lifecycle.
   * Named here rather than silently assumed — replace this proxy with a
   * dedicated confirm-receipt signal the day doc 07 builds one.
   *
   * `merchantOwnerUserId` is supplied by the caller rather than resolved
   * from `organizationId` internally: this schema has no cross-tenant user
   * directory linking a doc-39 merchant tenant id to a `User` row in this
   * deployment's own database (MerchantPayable.organizationId is a plain,
   * unrelated scalar — see wallet.prisma's own comment) — inventing one
   * would be exactly the kind of unrequested resolution logic CLAUDE.md's
   * "no speculative functionality" rules out.
   */
  async schedulePayoutRun(organizationId: string, merchantOwnerUserId: string): Promise<{ scheduledCount: number; scheduledPayoutAt: Date; verified: boolean }> {
    const verified = await this.identityVerification.isApproved(merchantOwnerUserId);
    const scheduledPayoutAt = this.nextPayoutRunDate();

    const eligible = await this.prisma.merchantPayable.findMany({
      where: { organizationId, status: 'OPEN' },
    });
    if (eligible.length === 0) return { scheduledCount: 0, scheduledPayoutAt, verified };

    let toSchedule = eligible;
    if (!verified) {
      const orders = await this.prisma.order.findMany({
        where: { id: { in: eligible.map((p) => p.orderId) } },
        select: { id: true, status: true },
      });
      const delivered = new Set(orders.filter((o) => o.status === 'DELIVERED').map((o) => o.id));
      toSchedule = eligible.filter((p) => delivered.has(p.orderId));
    }
    if (toSchedule.length === 0) return { scheduledCount: 0, scheduledPayoutAt, verified };

    await this.prisma.merchantPayable.updateMany({
      where: { id: { in: toSchedule.map((p) => p.id) }, status: 'OPEN' },
      data: { status: 'SCHEDULED', scheduledPayoutAt },
    });

    return { scheduledCount: toSchedule.length, scheduledPayoutAt, verified };
  }

  /**
   * This codebase's own AP settlement idiom applied across a set of
   * payables rather than one bill at a time —
   * `PurchasingService.recordSupplierBillPayment()`'s own single-record
   * shape, batched: no separate `PaymentRun` entity exists in this
   * codebase today (checked directly), so "the batch payment-run mechanism
   * this repository's own AP side already uses" (§3) concretely means
   * "every SCHEDULED payable is marked PAID in one call," matching how
   * `recordSupplierBillPayment` settles one `SupplierBill`. Idempotent:
   * only SCHEDULED rows are claimed, so a retried call after a partial
   * success pays only what is still SCHEDULED.
   */
  async processPayoutRun(organizationId: string, actorId: string): Promise<{ paidCount: number; totalNetMinor: number }> {
    const due = await this.prisma.merchantPayable.findMany({
      where: { organizationId, status: 'SCHEDULED' },
    });
    if (due.length === 0) return { paidCount: 0, totalNetMinor: 0 };

    const paidAt = new Date();
    const { count } = await this.prisma.merchantPayable.updateMany({
      where: { id: { in: due.map((p) => p.id) }, status: 'SCHEDULED' },
      data: { status: 'PAID', paidAt },
    });

    for (const payable of due) {
      await this.events.publish(DomainEvent.MerchantPayablePaid, {
        merchantPayableId: payable.id,
        organizationId,
        netPayableMinor: payable.netPayableMinor,
        paidAt: paidAt.toISOString(),
      });
    }

    await this.audit.record({
      actorId,
      action: 'wallet.merchant_payout_run_processed',
      entity: 'MerchantPayable',
      data: { organizationId, paidCount: count, totalNetMinor: due.reduce((sum, p) => sum + p.netPayableMinor, 0) },
    });

    return { paidCount: count, totalNetMinor: due.reduce((sum, p) => sum + p.netPayableMinor, 0) };
  }

  /** Pauses a specific payable's own inclusion in the next payout run — never any other payable. */
  async dispute(id: string, disputedByUserId: string, reason: string): Promise<MerchantPayable> {
    if (!reason?.trim()) throw new BadRequestException('A dispute always needs a reason.');
    const payable = await this.findOne(id);
    if (payable.status === 'PAID') {
      throw new BadRequestException('This payable is already paid — dispute the payout instead of the payable.');
    }

    const updated = await this.prisma.merchantPayable.update({
      where: { id },
      data: { status: 'DISPUTED', disputedByUserId, disputeReason: reason },
    });
    await this.audit.record({
      actorId: disputedByUserId,
      action: 'wallet.merchant_payable_disputed',
      entity: 'MerchantPayable',
      entityId: id,
      data: { reason },
    });
    return updated;
  }

  /**
   * The staff member who disputed a payable never resolves it themselves —
   * the identical toxic-pair refusal `StockVarianceService.resolve()`
   * already applies (grep "cannot resolve it themselves" there).
   */
  async resolveDispute(id: string, resolvedByUserId: string, resolution: 'OPEN' | 'SCHEDULED'): Promise<MerchantPayable> {
    const payable = await this.findOne(id);
    if (payable.status !== 'DISPUTED') throw new ConflictException('This payable is not disputed.');
    if (payable.disputedByUserId === resolvedByUserId) {
      throw new ForbiddenException('The staff member who disputed this payable cannot resolve it themselves.');
    }

    const updated = await this.prisma.merchantPayable.update({
      where: { id },
      data: {
        status: resolution,
        resolvedByUserId,
        resolvedAt: new Date(),
        scheduledPayoutAt: resolution === 'SCHEDULED' ? this.nextPayoutRunDate() : null,
      },
    });
    await this.audit.record({
      actorId: resolvedByUserId,
      action: 'wallet.merchant_payable_dispute_resolved',
      entity: 'MerchantPayable',
      entityId: id,
      data: { resolution },
    });
    return updated;
  }

  /**
   * A pure read — "dry run before live": what a payout run would actually
   * pay, to whom, net of fees, with no write. Called before
   * `processPayoutRun()` executes for real.
   */
  async previewPayoutRun(organizationId: string): Promise<{ count: number; totalNetMinor: number; payables: MerchantPayable[] }> {
    const payables = await this.prisma.merchantPayable.findMany({ where: { organizationId, status: 'SCHEDULED' } });
    return { count: payables.length, totalNetMinor: payables.reduce((sum, p) => sum + p.netPayableMinor, 0), payables };
  }

  /** The next operationally-possible payout run — tomorrow, matching "as soon as operationally possible" (§3's own words) for both the verified-fast and dispute-resolved-back-to-SCHEDULED paths. */
  private nextPayoutRunDate(): Date {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 1);
    return date;
  }
}
