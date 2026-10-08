import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../../core/audit/audit.service';
import { paginated } from '../../../core/common/dto/pagination.dto';
import { IdentityVerificationStatusRegistry } from '../../../core/extension-points/identity-verification-status.registry';
import type { Bidder, Prisma } from '../../../core/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SettingKey } from '../../../core/settings/settings.defaults';
import { SettingsService } from '../../../core/settings/settings.service';
import { provisionBidder } from './bidder-provision';
import {
  appealState,
  decideRegistration,
  decisionNeedsReason,
  INELIGIBLE_MESSAGES,
  isReviewDue,
  nextBidderStatus,
  parseRegistrationMode,
  parseTrustPolicy,
  registrationView,
  strikeWindowStart,
  type AppealState,
  type RegistrationView,
  type TrustPolicy,
} from './bidder-trust';
import type { BidderDecisionDto, BidderFilter, BidderListQueryDto, RecordStrikeDto } from './dto/auction.dto';

type Client = PrismaService | Prisma.TransactionClient;

export interface BidderUser {
  id: string;
  permissions: readonly string[];
}

/** What staff may know about a person: the only place a bidder's name, email or phone leave the server (doc 234 §15, "whose columns"). */
export interface BidderPerson {
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface BidderRowView {
  id: string;
  alias: string;
  status: Bidder['status'];
  joinedAt: Date;
  decidedAt: Date | null;
  decisionReason: string | null;
  appeal: { state: AppealState; text: string | null; at: Date | null };
  person: BidderPerson;
  strikes: { inWindow: number; reviewDue: boolean };
  /** True when this bidder is the staff member asking: the screen explains why they cannot decide, and the server refuses it. */
  isSelf: boolean;
}

export interface StrikeView {
  id: string;
  reason: string;
  recordedAt: Date;
  recordedBy: string | null;
  lotId: string | null;
  auction: { id: string; number: string; title: string };
  voided: { at: Date; by: string | null; reason: string } | null;
}

export interface BidderDetailView extends BidderRowView {
  verified: boolean;
  strikeList: StrikeView[];
  policy: { strikesToReview: number; windowDays: number };
}

export interface BidderSummary {
  waiting: number;
  approved: number;
  /** Suspended or declined. */
  stopped: number;
  /** Declined or suspended bidders waiting for an answer to an appeal. */
  appeals: number;
  total: number;
}

const DAY_MS = 86_400_000;

/** The newest strikes a person's sheet lists. A person with more than this has been decided on long since; the count above it is exact. */
const MAX_STRIKES_LISTED = 50;

/**
 * Who may bid, and who has been told they may not (launchpad-apps/234-auction-app.md
 * §8, WO-234.5). A person joins an auction themselves; staff with
 * `auction.bidders.manage` decide on them, hold them to account with strikes,
 * and answer their appeals. Every one of those acts is written with
 * `recordEvidence()` in the same transaction as the change, because each
 * changes what someone may do: a failed audit write fails the act.
 *
 * The rules themselves are the pure functions in `bidder-trust.ts`, which
 * `placeBid()`, `setProxyBid()` and the viewer's own state also call, so this
 * service never decides "may they bid?" on its own.
 */
@Injectable()
export class AuctionBidderService {
  private readonly logger = new Logger(AuctionBidderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly identity: IdentityVerificationStatusRegistry,
  ) {}

  // ── Strikes: the policy and the count ────────────────────────────────────

  async policy(): Promise<TrustPolicy> {
    const [strikesToReview, strikeWindowDays] = await Promise.all([
      this.settings.get<unknown>(SettingKey.AuctionStrikesToReview),
      this.settings.get<unknown>(SettingKey.AuctionStrikeWindowDays),
    ]);
    return parseTrustPolicy({ strikesToReview, strikeWindowDays });
  }

  /** One person's strikes that have not been voided and are inside the window, and whether that is enough to flag them. */
  async strikeState(client: Client, userId: string, now: Date, policy: TrustPolicy): Promise<{ inWindow: number; reviewDue: boolean }> {
    const inWindow = await client.bidderStrike.count({
      where: { userId, voidedAt: null, recordedAt: { gte: strikeWindowStart(now, policy) } },
    });
    return { inWindow, reviewDue: isReviewDue(inWindow, policy) };
  }

  // ── The bidder's own acts ────────────────────────────────────────────────

  /**
   * A signed-in customer joins an auction. Idempotent: joining twice returns
   * the place they already have. What they are first given is one pure
   * decision (`decideRegistration`): approved at once under `OPEN`, or under
   * `VERIFIED` when their identity is verified, and otherwise waiting for staff.
   * Staff who run the auction cannot join it.
   */
  async join(auctionId: string, user: BidderUser): Promise<RegistrationView> {
    const auction = await this.openAuction(auctionId);
    const mode = parseRegistrationMode(auction.registration, 'OPEN');
    if (user.permissions.includes('auction.manage') || auction.createdById === user.id) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'BIDDER_NOT_ELIGIBLE',
        message: INELIGIBLE_MESSAGES.RUNS_AUCTION,
        details: { why: 'RUNS_AUCTION' },
      });
    }

    const existing = await this.prisma.bidder.findUnique({ where: { auctionId_userId: { auctionId, userId: user.id } } });
    if (existing) return registrationView(mode, existing);

    const verified = mode === 'VERIFIED' ? await this.isVerified(user.id) : false;
    const strikes = await this.strikeState(this.prisma, user.id, new Date(), await this.policy());
    const status = decideRegistration({ mode, verified, reviewDue: strikes.reviewDue });

    const { bidder, created } = await this.prisma.$transaction(async (tx) => {
      const made = await provisionBidder(tx, auction.id, user.id, status);
      if (made.created) {
        await this.audit.recordEvidence(tx, {
          actorId: user.id,
          action: 'auction.bidder_joined',
          entity: 'Bidder',
          entityId: made.bidder.id,
          data: { auctionId: auction.id, number: auction.number, alias: made.bidder.alias, mode, status, verified, strikesInWindow: strikes.inWindow },
        });
      }
      return made;
    });
    if (created) this.logger.log(`${bidder.alias} joined ${auction.number} as ${status}`);
    return registrationView(mode, bidder);
  }

  /**
   * A declined or suspended bidder asks for another look, once for each
   * decision. The text stays on the bidder until staff answer; the history of
   * appeals is the audit trail.
   */
  async appeal(auctionId: string, user: BidderUser, rawMessage: string): Promise<RegistrationView> {
    const message = rawMessage.trim();
    if (!message) throw new BadRequestException('Write why the decision should be looked at again.');
    const auction = await this.openAuction(auctionId);
    const mode = parseRegistrationMode(auction.registration, 'OPEN');

    const bidder = await this.prisma.$transaction(async (tx) => {
      const current = await tx.bidder.findUnique({ where: { auctionId_userId: { auctionId, userId: user.id } } });
      if (!current) throw new NotFoundException('You have not joined this auction.');
      if (current.status !== 'DECLINED' && current.status !== 'SUSPENDED') {
        throw new ConflictException({ statusCode: 409, code: 'NOTHING_TO_APPEAL', message: 'There is no decision to appeal.' });
      }
      const state = appealState(current);
      if (state === 'WAITING') {
        throw new ConflictException({ statusCode: 409, code: 'APPEAL_ALREADY_OPEN', message: 'Your appeal is already with the organiser.' });
      }
      if (state === 'KEPT') {
        throw new ConflictException({
          statusCode: 409,
          code: 'APPEAL_ALREADY_ANSWERED',
          message: 'The organiser has already answered your appeal on this decision.',
        });
      }
      // The predicate is what the bidder saw: still this status, still no appeal.
      const written = await tx.bidder.updateMany({
        where: { id: current.id, status: current.status, appealedAt: null },
        data: { appealText: message, appealedAt: new Date() },
      });
      if (written.count === 0) throw this.bidderChanged();
      await this.audit.recordEvidence(tx, {
        actorId: user.id,
        action: 'auction.bidder_appealed',
        entity: 'Bidder',
        entityId: current.id,
        data: { auctionId, number: auction.number, alias: current.alias, status: current.status, appeal: message },
      });
      return tx.bidder.findUniqueOrThrow({ where: { id: current.id } });
    });
    this.logger.log(`${bidder.alias} appealed their ${bidder.status} status in ${auction.number}`);
    return registrationView(mode, bidder);
  }

  // ── Staff: the queue ─────────────────────────────────────────────────────

  async summary(auctionId: string): Promise<BidderSummary> {
    await this.assertAuction(auctionId);
    const [byStatus, appeals] = await Promise.all([
      this.prisma.bidder.groupBy({ by: ['status'], where: { auctionId }, _count: { _all: true } }),
      this.prisma.bidder.count({ where: this.filterWhere(auctionId, 'appeals') }),
    ]);
    const count = (status: Bidder['status']) => byStatus.find((row) => row.status === status)?._count._all ?? 0;
    const waiting = count('PENDING');
    const approved = count('APPROVED');
    const stopped = count('SUSPENDED') + count('DECLINED');
    return { waiting, approved, stopped, appeals, total: waiting + approved + stopped };
  }

  async list(auctionId: string, query: BidderListQueryDto, actor: BidderUser) {
    await this.assertAuction(auctionId);
    const where = this.filterWhere(auctionId, query.filter);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.bidder.findMany({ where, orderBy: [{ createdAt: query.order }, { id: 'asc' }], skip: query.skip, take: query.take }),
      this.prisma.bidder.count({ where }),
    ]);

    // Two reads for the whole page, not two per row.
    const userIds = [...new Set(rows.map((row) => row.userId))];
    const policy = await this.policy();
    const [users, strikeCounts] = await Promise.all([
      this.peopleById(userIds),
      userIds.length === 0
        ? []
        : this.prisma.bidderStrike.groupBy({
            by: ['userId'],
            where: { userId: { in: userIds }, voidedAt: null, recordedAt: { gte: strikeWindowStart(new Date(), policy) } },
            _count: { _all: true },
          }),
    ]);
    const strikesOf = new Map(strikeCounts.map((row) => [row.userId, row._count._all]));
    return paginated(
      rows.map((row) => this.rowView(row, users.get(row.userId), strikesOf.get(row.userId) ?? 0, policy, actor)),
      total,
      query,
    );
  }

  async detail(auctionId: string, bidderId: string, actor: BidderUser): Promise<BidderDetailView> {
    const bidder = await this.findBidder(auctionId, bidderId);
    const policy = await this.policy();
    const now = new Date();
    const [users, strikes, inWindow, verified] = await Promise.all([
      this.peopleById([bidder.userId]),
      this.prisma.bidderStrike.findMany({
        where: { userId: bidder.userId },
        orderBy: { recordedAt: 'desc' },
        take: MAX_STRIKES_LISTED,
        include: { bidder: { select: { auction: { select: { id: true, number: true, title: true } } } } },
      }),
      this.prisma.bidderStrike.count({ where: { userId: bidder.userId, voidedAt: null, recordedAt: { gte: strikeWindowStart(now, policy) } } }),
      this.isVerified(bidder.userId),
    ]);
    const staff = await this.peopleById([...new Set(strikes.flatMap((s) => [...(s.recordedById ? [s.recordedById] : []), ...(s.voidedById ? [s.voidedById] : [])]))]);
    const nameOf = (id: string | null) => (id ? (staff.get(id)?.name ?? staff.get(id)?.email ?? null) : null);

    return {
      ...this.rowView(bidder, users.get(bidder.userId), inWindow, policy, actor),
      verified,
      policy: { strikesToReview: policy.strikesToReview, windowDays: Math.round(policy.strikeWindowMs / DAY_MS) },
      strikeList: strikes.map((strike) => ({
        id: strike.id,
        reason: strike.reason,
        recordedAt: strike.recordedAt,
        recordedBy: nameOf(strike.recordedById),
        lotId: strike.lotId,
        auction: strike.bidder.auction,
        voided: strike.voidedAt ? { at: strike.voidedAt, by: nameOf(strike.voidedById), reason: strike.voidReason ?? '' } : null,
      })),
    };
  }

  // ── Staff: decisions, strikes ────────────────────────────────────────────

  /**
   * Decides on a bidder. The write is guarded by the status the staff member
   * was looking at (`expectedStatus`), so two people acting on one registration
   * cannot both succeed and a stale screen cannot land a decision on a state
   * nobody chose it for: the second gets 409 and the fresh status.
   */
  async decide(auctionId: string, bidderId: string, actor: BidderUser, dto: BidderDecisionDto): Promise<BidderDetailView> {
    const reason = dto.reason?.trim() || null;
    if (decisionNeedsReason(dto.decision) && !reason) {
      throw new BadRequestException('Write the reason. The bidder will read it.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.bidder.findFirst({ where: { id: bidderId, auctionId }, include: { auction: { select: { number: true } } } });
      if (!current) throw new NotFoundException('Bidder not found.');
      this.assertNotSelf(current.userId, actor);
      if (current.status !== dto.expectedStatus) throw this.bidderChanged(current.status);

      const transition = nextBidderStatus(current.status, dto.decision, appealState(current) === 'WAITING');
      if (!transition.ok) throw new ConflictException({ statusCode: 409, code: 'DECISION_NOT_ALLOWED', message: transition.message });

      // Any new decision clears the appeal so the next one can be appealed afresh;
      // keeping a decision empties the text and leaves the instant, which is
      // what makes the answer final (`appealState`).
      const keeping = dto.decision === 'UPHOLD';
      const written = await tx.bidder.updateMany({
        where: { id: current.id, status: current.status },
        data: {
          status: transition.status,
          decidedById: actor.id,
          decidedAt: new Date(),
          decisionReason: reason,
          appealText: null,
          ...(keeping ? {} : { appealedAt: null }),
        },
      });
      if (written.count === 0) throw this.bidderChanged();

      await this.audit.recordEvidence(tx, {
        actorId: actor.id,
        action: 'auction.bidder_decided',
        entity: 'Bidder',
        entityId: current.id,
        data: {
          auctionId,
          number: current.auction.number,
          alias: current.alias,
          decision: dto.decision,
          from: current.status,
          to: transition.status,
          reason,
          ...(current.appealText ? { answeredAppeal: current.appealText } : {}),
        },
      });
      return { alias: current.alias, number: current.auction.number, from: current.status, to: transition.status };
    });
    // Alias and states only: the reason is the bidder's to read and the audit row's to keep, not a log line.
    this.logger.log(`${result.alias} in ${result.number}: ${dto.decision} (${result.from} to ${result.to}) by ${actor.id}`);
    return this.detail(auctionId, bidderId, actor);
  }

  /** Records a strike against the person behind a bidder. Allowed whatever the bidder's status; flags at the policy's threshold and never suspends. */
  async recordStrike(auctionId: string, bidderId: string, actor: BidderUser, dto: RecordStrikeDto): Promise<BidderDetailView> {
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('Write what happened.');

    const policy = await this.policy(); // before the transaction: a Setting that is not cached is read on a second connection
    const outcome = await this.prisma.$transaction(async (tx) => {
      const bidder = await tx.bidder.findFirst({ where: { id: bidderId, auctionId }, include: { auction: { select: { number: true } } } });
      if (!bidder) throw new NotFoundException('Bidder not found.');
      this.assertNotSelf(bidder.userId, actor);
      if (dto.lotId) {
        const lot = await tx.auctionLot.findFirst({ where: { id: dto.lotId, auctionId }, select: { id: true } });
        if (!lot) throw new BadRequestException('That lot is not part of this auction.');
      }
      const strike = await tx.bidderStrike.create({
        data: { userId: bidder.userId, bidderId: bidder.id, lotId: dto.lotId ?? null, reason, recordedById: actor.id },
      });
      const state = await this.strikeState(tx, bidder.userId, new Date(), policy);
      await this.audit.recordEvidence(tx, {
        actorId: actor.id,
        action: 'auction.strike_recorded',
        entity: 'Bidder',
        entityId: bidder.id,
        data: { auctionId, number: bidder.auction.number, alias: bidder.alias, strikeId: strike.id, lotId: dto.lotId ?? null, reason, strikesInWindow: state.inWindow },
      });
      return { alias: bidder.alias, number: bidder.auction.number, ...state };
    });
    this.logger.log(`Strike recorded against ${outcome.alias} in ${outcome.number} by ${actor.id}: ${outcome.inWindow} in the window${outcome.reviewDue ? ', review due' : ''}`);
    return this.detail(auctionId, bidderId, actor);
  }

  /**
   * Records the strike for a win left unpaid (WO-234.6), on the settlement's
   * own transaction so the strike and the expiry commit together or not at all.
   * It has no staff author, and `settlementId` is unique, so a retried sweep
   * finds the strike already there and writes nothing. Returns whether it wrote
   * one. Like a staff strike it only counts toward the review flag: it never
   * suspends anyone (§8).
   */
  async recordUnpaidWinStrike(
    tx: Prisma.TransactionClient,
    input: { settlementId: string; bidderId: string; userId: string; lotId: string; alias: string; auctionId: string; auctionNumber: string; reason: string },
  ): Promise<boolean> {
    const already = await tx.bidderStrike.findUnique({ where: { settlementId: input.settlementId }, select: { id: true } });
    if (already) return false;
    const strike = await tx.bidderStrike.create({
      data: { userId: input.userId, bidderId: input.bidderId, lotId: input.lotId, reason: input.reason, recordedById: null, settlementId: input.settlementId },
    });
    await this.audit.recordEvidence(tx, {
      actorId: null,
      action: 'auction.strike_recorded',
      entity: 'Bidder',
      entityId: input.bidderId,
      data: { auctionId: input.auctionId, number: input.auctionNumber, alias: input.alias, strikeId: strike.id, lotId: input.lotId, reason: input.reason, settlementId: input.settlementId, source: 'unpaid_win' },
    });
    return true;
  }

  /** Voids a strike with a reason. The strike stays on record, marked void, and stops counting. */
  async voidStrike(auctionId: string, bidderId: string, strikeId: string, actor: BidderUser, rawReason: string): Promise<BidderDetailView> {
    const reason = rawReason.trim();
    if (!reason) throw new BadRequestException('Write why the strike was a mistake.');

    await this.prisma.$transaction(async (tx) => {
      const strike = await tx.bidderStrike.findFirst({
        where: { id: strikeId, bidderId, bidder: { auctionId } },
        include: { bidder: { select: { alias: true, auction: { select: { number: true } } } } },
      });
      if (!strike) throw new NotFoundException('Strike not found.');
      this.assertNotSelf(strike.userId, actor);
      if (strike.voidedAt) {
        throw new ConflictException({ statusCode: 409, code: 'STRIKE_ALREADY_VOID', message: 'This strike is already void.' });
      }
      const written = await tx.bidderStrike.updateMany({
        where: { id: strike.id, voidedAt: null },
        data: { voidedAt: new Date(), voidedById: actor.id, voidReason: reason },
      });
      if (written.count === 0) {
        throw new ConflictException({ statusCode: 409, code: 'STRIKE_ALREADY_VOID', message: 'This strike is already void.' });
      }
      await this.audit.recordEvidence(tx, {
        actorId: actor.id,
        action: 'auction.strike_voided',
        entity: 'Bidder',
        entityId: strike.bidderId,
        data: { auctionId, number: strike.bidder.auction.number, alias: strike.bidder.alias, strikeId: strike.id, originalReason: strike.reason, reason },
      });
    });
    this.logger.log(`Strike ${strikeId} voided by ${actor.id}`);
    return this.detail(auctionId, bidderId, actor);
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /** An auction that is taking bidders: not a draft or a cancelled one (invisible, as to the public), and not one that has ended. */
  private async openAuction(auctionId: string) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      select: { id: true, number: true, status: true, registration: true, createdById: true },
    });
    if (!auction || auction.status === 'DRAFT' || auction.status === 'CANCELLED') throw new NotFoundException('Auction not found.');
    if (auction.status !== 'SCHEDULED' && auction.status !== 'OPEN') {
      throw new ConflictException({
        statusCode: 409,
        code: 'REGISTRATION_CLOSED',
        message: 'This auction has ended, so it is not taking new bidders.',
      });
    }
    return auction;
  }

  private async assertAuction(auctionId: string): Promise<void> {
    const found = await this.prisma.auction.findUnique({ where: { id: auctionId }, select: { id: true } });
    if (!found) throw new NotFoundException('Auction not found.');
  }

  private async findBidder(auctionId: string, bidderId: string): Promise<Bidder> {
    const bidder = await this.prisma.bidder.findFirst({ where: { id: bidderId, auctionId } });
    if (!bidder) throw new NotFoundException('Bidder not found.');
    return bidder;
  }

  private filterWhere(auctionId: string, filter: BidderFilter | undefined): Prisma.BidderWhereInput {
    switch (filter) {
      case 'waiting':
        return { auctionId, status: 'PENDING' };
      case 'approved':
        return { auctionId, status: 'APPROVED' };
      case 'stopped':
        return { auctionId, status: { in: ['SUSPENDED', 'DECLINED'] } };
      case 'appeals':
        return { auctionId, status: { in: ['SUSPENDED', 'DECLINED'] }, appealText: { not: null } };
      default:
        return { auctionId };
    }
  }

  /** A staff member never decides on their own registration or strikes: the same person can hold the permission and a customer account. */
  private assertNotSelf(userId: string, actor: BidderUser): void {
    if (userId === actor.id) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'CANNOT_DECIDE_OWN',
        message: 'You cannot decide on your own registration. Ask another holder of the permission to manage bidders.',
      });
    }
  }

  private bidderChanged(currentStatus?: Bidder['status']): ConflictException {
    return new ConflictException({
      statusCode: 409,
      code: 'BIDDER_CHANGED',
      message: 'Someone else has just decided on this bidder. Look at their new status and decide again if you still need to.',
      ...(currentStatus ? { details: { status: currentStatus } } : {}),
    });
  }

  /** The identity module being off, slow or failing is "not verified": the person waits for staff, and is never approved by a guess. */
  private async isVerified(userId: string): Promise<boolean> {
    try {
      return await this.identity.isApproved(userId);
    } catch (error) {
      this.logger.warn(`Identity lookup failed, treating the person as not verified: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private async peopleById(ids: readonly string[]): Promise<Map<string, BidderPerson>> {
    if (ids.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    });
    return new Map(
      users.map((user) => [
        user.id,
        { name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null, email: user.email, phone: user.phone },
      ]),
    );
  }

  private rowView(row: Bidder, person: BidderPerson | undefined, strikesInWindow: number, policy: TrustPolicy, actor: BidderUser): BidderRowView {
    const stopped = row.status === 'DECLINED' || row.status === 'SUSPENDED';
    return {
      id: row.id,
      alias: row.alias,
      status: row.status,
      joinedAt: row.createdAt,
      decidedAt: row.decidedAt,
      decisionReason: row.decisionReason,
      appeal: { state: stopped ? appealState(row) : 'NONE', text: row.appealText, at: row.appealedAt },
      person: person ?? { name: null, email: null, phone: null },
      strikes: { inWindow: strikesInWindow, reviewDue: isReviewDue(strikesInWindow, policy) },
      isSelf: row.userId === actor.id,
    };
  }
}

