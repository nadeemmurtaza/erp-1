import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { paginated, type PaginatedResult } from '../../core/common/dto/pagination.dto';
import { type PrismaLike } from '../../core/events/event-bus.service';
import type { StoreCreditTransaction } from '../../core/prisma/client';
import type { IssueStoreCreditDto } from './dto/store-credit.dto';

/**
 * Store credit: the same ledger shape as GiftCard, attached to a User rather
 * than a code (WO-5.5). `User.storeCreditBalance` is a cache of
 * SUM(StoreCreditTransaction.delta) — kept only so a checkout redemption can
 * use the identical atomic conditional-update idiom GiftCard.balance uses;
 * this service is the only writer of that column, and `reconcile()` below is
 * the nightly check the doc's own "if you cache it, add a reconciliation
 * check" note asks for.
 */
@Injectable()
export class StoreCreditService {
  private readonly logger = new Logger(StoreCreditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async balance(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { storeCreditBalance: true } });
    if (!user) throw new NotFoundException('Customer not found.');
    return user.storeCreditBalance;
  }

  async ledger(userId: string, query: { skip: number; take: number; order: 'asc' | 'desc' }): Promise<PaginatedResult<StoreCreditTransaction>> {
    const where = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.storeCreditTransaction.findMany({ where, skip: query.skip, take: query.take, orderBy: { createdAt: query.order } }),
      this.prisma.storeCreditTransaction.count({ where }),
    ]);
    return paginated(rows, total, { page: Math.floor(query.skip / query.take) + 1, pageSize: query.take });
  }

  /** Staff-issued goodwill/adjustment. Always allowed — issuing credit never needs a balance check. */
  async issue(userId: string, dto: IssueStoreCreditDto, actorId: string | null): Promise<StoreCreditTransaction> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { storeCreditBalance: { increment: dto.amount } },
      });
      return tx.storeCreditTransaction.create({
        data: {
          userId,
          delta: dto.amount,
          balanceAfter: user.storeCreditBalance,
          reason: dto.reason,
          actorId,
          note: dto.note ?? null,
        },
      });
    });
  }

  /**
   * Issues store credit as a refund/RTO-goodwill result — same write as
   * issue() above but with an orderId, called from a return/refund flow
   * (Phase 6) or directly by staff against a specific order.
   */
  async issueForOrder(
    tx: PrismaLike,
    input: { userId: string; amount: number; orderId: string; reason: 'refund' | 'goodwill'; actorId: string | null; note?: string },
  ): Promise<void> {
    const user = await tx.user.update({
      where: { id: input.userId },
      data: { storeCreditBalance: { increment: input.amount } },
    });
    await tx.storeCreditTransaction.create({
      data: {
        userId: input.userId,
        delta: input.amount,
        balanceAfter: user.storeCreditBalance,
        reason: input.reason,
        orderId: input.orderId,
        actorId: input.actorId,
        note: input.note ?? null,
      },
    });
  }

  /**
   * Debits store credit inside OrdersService's own order-creation
   * transaction. The conditional `WHERE storeCreditBalance >= amount` is the
   * same race-proof idiom as GiftCardsService.redeemInTransaction — a lost
   * race rolls back the whole order.
   */
  async redeemInTransaction(tx: PrismaLike, input: { userId: string; amount: number; orderId: string; actorId: string | null }): Promise<void> {
    const updated = await tx.user.updateMany({
      where: { id: input.userId, storeCreditBalance: { gte: input.amount } },
      data: { storeCreditBalance: { decrement: input.amount } },
    });
    if (updated.count === 0) {
      throw new BadRequestException('Not enough store credit for this amount.');
    }
    const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId }, select: { storeCreditBalance: true } });
    await tx.storeCreditTransaction.create({
      data: {
        userId: input.userId,
        delta: -input.amount,
        balanceAfter: user.storeCreditBalance,
        reason: 'redeem',
        orderId: input.orderId,
        actorId: input.actorId,
      },
    });
  }

  /**
   * Nightly reconciliation: SUM(delta) per user must equal the cached
   * column. Logs a discrepancy loudly rather than silently correcting it —
   * a cache drifting from its own ledger is a bug to find, not paper over.
   * Corrects the cache back to the ledger's own sum either way, since the
   * ledger is the source of truth.
   */
  async reconcile(): Promise<{ checked: number; corrected: number }> {
    const sums = await this.prisma.storeCreditTransaction.groupBy({ by: ['userId'], _sum: { delta: true } });
    let corrected = 0;
    for (const row of sums) {
      const trueBalance = row._sum.delta ?? 0;
      const user = await this.prisma.user.findUnique({ where: { id: row.userId }, select: { storeCreditBalance: true } });
      if (user && user.storeCreditBalance !== trueBalance) {
        this.logger.warn(`storeCreditBalance drift for user ${row.userId}: cached ${user.storeCreditBalance}, ledger sum ${trueBalance}`);
        await this.prisma.user.update({ where: { id: row.userId }, data: { storeCreditBalance: trueBalance } });
        corrected += 1;
      }
    }
    return { checked: sums.length, corrected };
  }
}
