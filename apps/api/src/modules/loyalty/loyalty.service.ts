import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { generateHumanCode } from '@newax/shared';
import { PrismaService } from '../../core/prisma/prisma.service';
import { paginated, type PaginatedResult } from '../../core/common/dto/pagination.dto';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import { StoreCreditService } from '../giftcards/store-credit.service';
import type { LoyaltyTier, LoyaltyTransaction, Referral } from '../../core/prisma/client';
import type { AdjustLoyaltyPointsDto, UpsertLoyaltyTierDto } from './dto/loyalty.dto';

const REFERRAL_CODE_LENGTH = 8;
const REFERRAL_CODE_MAX_ATTEMPTS = 5;

/**
 * WO-7.7 (docs/implementation/customer-portal-loyalty/07-customer-portal.md).
 * Points are a ledger (LoyaltyTransaction), User.loyaltyPoints a cache —
 * the same shape WO-5.5's StoreCreditService already proved. Redemption
 * converts points straight into that same store-credit ledger rather than
 * inventing a second balance (`loyalty -> giftcards`,
 * KNOWN_MODULE_COUPLINGS).
 */
@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly storeCredit: StoreCreditService,
  ) {}

  async balance(userId: string): Promise<{ points: number; tier: LoyaltyTier | null; trailing12MonthSpend: number }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { loyaltyPoints: true } });
    if (!user) throw new NotFoundException('Customer not found.');

    const spend = await this.trailing12MonthSpend(userId);
    const tier = await this.tierFor(spend);
    return { points: user.loyaltyPoints, tier, trailing12MonthSpend: spend };
  }

  private async trailing12MonthSpend(userId: string): Promise<number> {
    const since = new Date();
    since.setFullYear(since.getFullYear() - 1);
    const agg = await this.prisma.order.aggregate({
      where: { userId, status: 'DELIVERED', deliveredAt: { gte: since } },
      _sum: { grandTotal: true },
    });
    return agg._sum.grandTotal ?? 0;
  }

  private async tierFor(spend: number): Promise<LoyaltyTier | null> {
    const tiers = await this.prisma.loyaltyTier.findMany({ orderBy: { minSpend: 'desc' } });
    return tiers.find((t) => spend >= t.minSpend) ?? null;
  }

  async ledger(userId: string, query: { skip: number; take: number; order: 'asc' | 'desc' }): Promise<PaginatedResult<LoyaltyTransaction>> {
    const where = { userId };
    const [data, total] = await Promise.all([
      this.prisma.loyaltyTransaction.findMany({ where, orderBy: { createdAt: query.order }, skip: query.skip, take: query.take }),
      this.prisma.loyaltyTransaction.count({ where }),
    ]);
    return paginated(data, total, { page: Math.floor(query.skip / query.take) + 1, pageSize: query.take });
  }

  async listTiers(): Promise<LoyaltyTier[]> {
    return this.prisma.loyaltyTier.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async upsertTier(id: string | null, dto: UpsertLoyaltyTierDto): Promise<LoyaltyTier> {
    if (id) {
      return this.prisma.loyaltyTier.update({ where: { id }, data: dto });
    }
    return this.prisma.loyaltyTier.create({ data: dto });
  }

  /**
   * Credited on DELIVERED, never on placement (the brief's own words — a COD
   * cancellation must not mint free points). `@@unique([orderId, type])` is
   * the actual idempotency guard: a redelivered OrderStatusChanged event (the
   * outbox's at-least-once delivery) hits this constraint and no-ops rather
   * than double-crediting.
   */
  async earnForOrder(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { userId: true, grandTotal: true } });
    if (!order?.userId) return;

    // grandTotal is paisa. bps/10000 is the earn rate as a fraction of rupees
    // spent (100 bps = 1% = 1 point per Rs. 100) — dividing by 100 first
    // converts paisa to rupees, so the combined divisor is 1,000,000.
    const bps = await this.settings.get<number>(SettingKey.LoyaltyPointsPerRupeeBps);
    const points = Math.floor((order.grandTotal * bps) / 1_000_000);

    if (points <= 0) return;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.loyaltyTransaction.create({
          data: { userId: order.userId!, orderId, type: 'EARNED', points, note: 'Earned on delivery' },
        });
        await tx.user.update({ where: { id: order.userId! }, data: { loyaltyPoints: { increment: points } } });
      });
    } catch (error) {
      // Unique constraint violation = already earned for this order — an
      // idempotent no-op, not an error worth propagating.
      if (!(error instanceof Error && error.message.includes('Unique constraint'))) throw error;
    }
  }

  /** DELIVERED -> RETURNED reverses whatever was earned, if anything was. */
  async reverseForOrder(orderId: string): Promise<void> {
    const earned = await this.prisma.loyaltyTransaction.findUnique({ where: { orderId_type: { orderId, type: 'EARNED' } } });
    if (!earned) return;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.loyaltyTransaction.create({
          data: { userId: earned.userId, orderId, type: 'REVERSED', points: -earned.points, note: 'Order returned' },
        });
        await tx.user.update({ where: { id: earned.userId }, data: { loyaltyPoints: { decrement: earned.points } } });
      });
    } catch (error) {
      if (!(error instanceof Error && error.message.includes('Unique constraint'))) throw error;
    }
  }

  async adjust(userId: string, dto: AdjustLoyaltyPointsDto): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.loyaltyTransaction.create({
        data: { userId, type: 'ADJUSTED', points: dto.points, note: dto.note },
      });
      await tx.user.update({ where: { id: userId }, data: { loyaltyPoints: { increment: dto.points } } });
    });
  }

  /** Converts points to store credit at the configured rate — never a second balance. */
  async redeem(userId: string, points: number): Promise<{ storeCreditAdded: number }> {
    const pointsPerRupee = await this.settings.get<number>(SettingKey.LoyaltyRedemptionPointsPerRupee);
    if (points % pointsPerRupee !== 0) {
      throw new BadRequestException(`Points must be redeemed in multiples of ${pointsPerRupee}.`);
    }
    const amountPaisa = Math.floor((points / pointsPerRupee) * 100);

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.updateMany({
        where: { id: userId, loyaltyPoints: { gte: points } },
        data: { loyaltyPoints: { decrement: points } },
      });
      if (user.count === 0) throw new BadRequestException('Not enough points.');

      await tx.loyaltyTransaction.create({
        data: { userId, type: 'REDEEMED', points: -points, note: `Redeemed for Rs. ${amountPaisa / 100} store credit` },
      });
      await this.storeCredit.creditInTransaction(tx, {
        userId,
        amount: amountPaisa,
        reason: 'redeem',
        actorId: null,
        note: `${points} loyalty points redeemed`,
      });
    });

    return { storeCreditAdded: amountPaisa };
  }

  async myReferralCode(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
    if (!user) throw new NotFoundException('Customer not found.');
    if (user.referralCode) return user.referralCode;

    for (let attempt = 0; attempt < REFERRAL_CODE_MAX_ATTEMPTS; attempt++) {
      const code = generateHumanCode(REFERRAL_CODE_LENGTH);
      try {
        await this.prisma.user.update({ where: { id: userId }, data: { referralCode: code } });
        return code;
      } catch (error) {
        if (!(error instanceof Error && error.message.includes('Unique constraint'))) throw error;
      }
    }
    throw new Error('Could not generate a unique referral code.');
  }

  /**
   * Refuses a referral where the referrer and referee share a phone number
   * or a saved address — the two signals this codebase can actually check.
   * Device fingerprinting (the brief's third signal) has no vendor here and
   * is named honestly as unbuilt rather than faked.
   */
  async applyReferralCode(refereeId: string, code: string): Promise<Referral> {
    const referrer = await this.prisma.user.findUnique({
      where: { referralCode: code },
      include: { addresses: true },
    });
    if (!referrer) throw new NotFoundException('That referral code is not valid.');
    if (referrer.id === refereeId) throw new BadRequestException('You cannot refer yourself.');

    const existing = await this.prisma.referral.findUnique({ where: { refereeId } });
    if (existing) throw new BadRequestException('A referral code has already been applied to this account.');

    const referee = await this.prisma.user.findUnique({ where: { id: refereeId }, include: { addresses: true } });
    if (!referee) throw new NotFoundException('Customer not found.');

    if (referrer.phone && referee.phone && referrer.phone === referee.phone) {
      throw new ForbiddenException('This referral cannot be applied.');
    }
    const referrerAddressKeys = new Set(referrer.addresses.map((a) => `${a.phone}|${a.line1.toLowerCase()}`));
    const shareAddress = referee.addresses.some((a) => referrerAddressKeys.has(`${a.phone}|${a.line1.toLowerCase()}`));
    if (shareAddress) throw new ForbiddenException('This referral cannot be applied.');

    return this.prisma.referral.create({ data: { referrerId: referrer.id, refereeId, code } });
  }

  async myReferrals(userId: string): Promise<Referral[]> {
    return this.prisma.referral.findMany({ where: { referrerId: userId }, orderBy: { createdAt: 'desc' } });
  }

  /**
   * Called on a DELIVERED order — rewards both sides exactly once, only on
   * the REFEREE's genuinely first delivered order (`rewardedAt` is the
   * idempotency guard, checked and set together so a redelivered event
   * cannot pay out twice).
   */
  async rewardReferralIfEligible(refereeId: string): Promise<void> {
    const referral = await this.prisma.referral.findUnique({ where: { refereeId } });
    if (!referral || referral.rewardedAt) return;

    const deliveredOrders = await this.prisma.order.count({ where: { userId: refereeId, status: 'DELIVERED' } });
    if (deliveredOrders !== 1) return; // not their first, or somehow zero

    const rewardAmount = await this.settings.get<number>(SettingKey.LoyaltyReferralRewardAmount);

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.referral.updateMany({
        where: { id: referral.id, rewardedAt: null },
        data: { rewardedAt: new Date() },
      });
      if (updated.count === 0) return; // lost the race — another event already rewarded this

      await this.storeCredit.creditInTransaction(tx, {
        userId: referral.referrerId,
        amount: rewardAmount,
        reason: 'referral',
        actorId: null,
        note: `Referral reward — ${refereeId} placed their first order`,
      });
      await this.storeCredit.creditInTransaction(tx, {
        userId: referral.refereeId,
        amount: rewardAmount,
        reason: 'referral',
        actorId: null,
        note: 'Referral reward — your first order',
      });
    });
  }
}
