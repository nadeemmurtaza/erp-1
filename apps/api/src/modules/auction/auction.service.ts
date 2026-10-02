import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BRAND } from '@newax/shared';
import { AppConfigService } from '../../core/config/app-config.service';
import { AuditService } from '../../core/audit/audit.service';
import { paginated } from '../../core/common/dto/pagination.dto';
import { Prisma } from '../../core/prisma/client';
import type { Auction, AuctionLot, AuctionStatus } from '../../core/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { documentNumber, documentNumberPrefix } from '../../core/settings/document-number';
import { documentPrefix } from '../../core/settings/document-prefix';
import { SettingsService } from '../../core/settings/settings.service';
import type {
  AuctionListQueryDto,
  CreateAuctionDto,
  CreateAuctionLotDto,
  UpdateAuctionDto,
  UpdateAuctionLotDto,
} from './dto/auction.dto';

const AUCTION_NUMBER_LOCK_NAMESPACE = 8_241_170;

/** A lot as the caller may see it: the hidden reserve is present only for a holder of `auction.manage`. */
export type AuctionLotView = Omit<AuctionLot, 'reservePriceMinor'> & { reservePriceMinor?: number | null };
export type AuctionDetail = Auction & { lots: AuctionLotView[] };

async function nextAuctionNumber(
  tx: Prisma.TransactionClient,
  settings: SettingsService,
  config: AppConfigService,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = await documentPrefix(settings, 'auction');
  const like = documentNumberPrefix(config, prefix, year);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUCTION_NUMBER_LOCK_NAMESPACE}::int, ${year}::int)`;
  const [{ max }] = await tx.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(CAST(split_part("number", '-', -1) AS INTEGER)) AS max
    FROM "Auction"
    WHERE "number" LIKE ${`${like}%`}
  `;
  return documentNumber(config, prefix, year, (max ?? 0) + 1);
}

/**
 * The Auction app's admin foundation (launchpad-apps/234-auction-app.md,
 * WO-234.1): drafting an auction and its lots, scheduling it, and calling it
 * off before it opens. Nothing here accepts a bid — that is `placeBid()` in
 * WO-234.2, the one writer of a lot's current price.
 *
 * One writer per invariant: every change to an auction or its lots runs in a
 * transaction that first takes the auction's row lock (`lockAuction`) and
 * checks the status it read under that lock. That is what stops a lot being
 * withdrawn while the auction is being scheduled, and what will stop the open
 * job of WO-234.3 and an edit from both winning. A repeat of the same
 * transition is a no-op, never an error and never a second audit row.
 */
@Injectable()
export class AuctionService {
  private readonly logger = new Logger(AuctionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AuctionListQueryDto) {
    const search = query.q?.trim();
    const where: Prisma.AuctionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      // Contains-match on title or number: an auction table is hundreds of
      // rows per organisation, not millions, so a scan here is cheaper than an
      // index nobody would hit with a leading-wildcard pattern.
      ...(search
        ? { OR: [{ title: { contains: search, mode: 'insensitive' } }, { number: { contains: search, mode: 'insensitive' } }] }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auction.findMany({
        where,
        include: { _count: { select: { lots: { where: { status: { not: 'WITHDRAWN' } } } } } },
        orderBy: [{ startsAt: query.order }, { id: query.order }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.auction.count({ where }),
    ]);
    return paginated(
      rows.map(({ _count, ...auction }) => ({ ...auction, lotCount: _count.lots })),
      total,
      query,
    );
  }

  async get(id: string, canSeeReserve: boolean): Promise<AuctionDetail> {
    const auction = await this.prisma.auction.findUnique({
      where: { id },
      include: { lots: { orderBy: { lotNo: 'asc' } } },
    });
    if (!auction) throw new NotFoundException('Auction not found.');
    return { ...auction, lots: auction.lots.map((lot) => this.viewLot(lot, canSeeReserve)) };
  }

  async create(dto: CreateAuctionDto, actorId: string): Promise<Auction> {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    this.assertWindow(startsAt, endsAt);
    if (dto.outletLocationId) await this.assertLocation(dto.outletLocationId);

    const auction = await this.prisma.$transaction(async (tx) => {
      const number = await nextAuctionNumber(tx, this.settings, this.config);
      return tx.auction.create({
        data: {
          number,
          type: dto.type ?? 'ENGLISH',
          title: dto.title.trim(),
          startsAt,
          endsAt,
          currency: BRAND.locale.currency,
          terms: dto.terms?.trim() || null,
          outletLocationId: dto.outletLocationId ?? null,
          createdById: actorId,
        },
      });
    });

    await this.audit.record({
      actorId,
      action: 'auction.created',
      entity: 'Auction',
      entityId: auction.id,
      data: { number: auction.number, title: auction.title },
    });
    this.logger.log(`Auction ${auction.number} drafted by ${actorId}`);
    return auction;
  }

  async update(id: string, dto: UpdateAuctionDto, actorId: string): Promise<Auction> {
    if (dto.outletLocationId) await this.assertLocation(dto.outletLocationId);

    const { before, after } = await this.prisma.$transaction(async (tx) => {
      const status = await this.lockAuction(tx, id);
      if (status !== 'DRAFT') {
        throw new ConflictException('Only a draft auction can be edited. Unschedule it first.');
      }
      const current = await tx.auction.findUniqueOrThrow({ where: { id } });
      const startsAt = dto.startsAt ? new Date(dto.startsAt) : current.startsAt;
      const endsAt = dto.endsAt ? new Date(dto.endsAt) : current.endsAt;
      this.assertWindow(startsAt, endsAt);

      const updated = await tx.auction.update({
        where: { id },
        data: {
          title: dto.title?.trim(),
          startsAt,
          endsAt,
          terms: dto.terms === undefined ? undefined : dto.terms.trim() || null,
          outletLocationId: dto.outletLocationId,
        },
      });
      return { before: current, after: updated };
    });

    await this.audit.record({
      actorId,
      action: 'auction.updated',
      entity: 'Auction',
      entityId: id,
      data: {
        before: { title: before.title, startsAt: before.startsAt, endsAt: before.endsAt, outletLocationId: before.outletLocationId },
        after: { title: after.title, startsAt: after.startsAt, endsAt: after.endsAt, outletLocationId: after.outletLocationId },
      },
    });
    return after;
  }

  async addLot(auctionId: string, dto: CreateAuctionLotDto, actorId: string): Promise<AuctionLot> {
    this.assertReserve(dto.startPriceMinor, dto.reservePriceMinor);

    const lot = await this.prisma.$transaction(async (tx) => {
      await this.lockDraft(tx, auctionId, 'Lots can only be added to a draft auction. Unschedule it first.');
      const { _max } = await tx.auctionLot.aggregate({ where: { auctionId }, _max: { lotNo: true } });
      return tx.auctionLot.create({
        data: {
          auctionId,
          lotNo: (_max.lotNo ?? 0) + 1,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          quantity: dto.quantity ?? 1,
          startPriceMinor: dto.startPriceMinor,
          reservePriceMinor: dto.reservePriceMinor ?? null,
        },
      });
    });

    await this.audit.record({
      actorId,
      action: 'auction.lot_added',
      entity: 'AuctionLot',
      entityId: lot.id,
      data: { auctionId, lotNo: lot.lotNo, startPriceMinor: lot.startPriceMinor },
    });
    return lot;
  }

  async updateLot(auctionId: string, lotId: string, dto: UpdateAuctionLotDto, actorId: string): Promise<AuctionLot> {
    const { before, after } = await this.prisma.$transaction(async (tx) => {
      await this.lockDraft(tx, auctionId, 'Lots can only be edited on a draft auction. Unschedule it first.');
      const current = await tx.auctionLot.findFirst({ where: { id: lotId, auctionId } });
      if (!current) throw new NotFoundException('Lot not found.');
      if (current.status === 'WITHDRAWN') throw new ConflictException('A withdrawn lot cannot be edited.');

      const startPriceMinor = dto.startPriceMinor ?? current.startPriceMinor;
      const reservePriceMinor = dto.reservePriceMinor === undefined ? current.reservePriceMinor : dto.reservePriceMinor;
      this.assertReserve(startPriceMinor, reservePriceMinor ?? undefined);

      const updated = await tx.auctionLot.update({
        where: { id: lotId },
        data: {
          title: dto.title?.trim(),
          description: dto.description === undefined ? undefined : dto.description.trim() || null,
          quantity: dto.quantity,
          startPriceMinor,
          reservePriceMinor,
        },
      });
      return { before: current, after: updated };
    });

    await this.audit.record({
      actorId,
      action: 'auction.lot_updated',
      entity: 'AuctionLot',
      entityId: lotId,
      data: {
        before: { startPriceMinor: before.startPriceMinor, reservePriceMinor: before.reservePriceMinor, quantity: before.quantity },
        after: { startPriceMinor: after.startPriceMinor, reservePriceMinor: after.reservePriceMinor, quantity: after.quantity },
      },
    });
    return after;
  }

  /** A lot is withdrawn, never deleted: its number stays taken and the audit row keeps pointing at it. */
  async withdrawLot(auctionId: string, lotId: string, actorId: string): Promise<AuctionLot> {
    const { lot, changed } = await this.prisma.$transaction(async (tx) => {
      await this.lockDraft(tx, auctionId, 'Lots can only be withdrawn from a draft auction. Unschedule it first.');
      const current = await tx.auctionLot.findFirst({ where: { id: lotId, auctionId } });
      if (!current) throw new NotFoundException('Lot not found.');
      if (current.status === 'WITHDRAWN') return { lot: current, changed: false };
      const updated = await tx.auctionLot.update({ where: { id: lotId }, data: { status: 'WITHDRAWN' } });
      return { lot: updated, changed: true };
    });

    if (changed) {
      await this.audit.record({
        actorId,
        action: 'auction.lot_withdrawn',
        entity: 'AuctionLot',
        entityId: lotId,
        data: { auctionId, lotNo: lot.lotNo },
      });
    }
    return lot;
  }

  /**
   * Draft → scheduled. Refused unless the start is in the future and at least
   * one lot is still on sale; every lot was validated when it was saved, so the
   * lock above is what makes "at least one" true at the moment of the flip.
   */
  async schedule(id: string, actorId: string): Promise<Auction> {
    const { auction, changed } = await this.prisma.$transaction(async (tx) => {
      const status = await this.lockAuction(tx, id);
      const current = await tx.auction.findUniqueOrThrow({ where: { id } });
      if (status === 'SCHEDULED') return { auction: current, changed: false };
      if (status !== 'DRAFT') throw new ConflictException(`A ${status.toLowerCase()} auction cannot be scheduled.`);
      if (current.startsAt.getTime() <= Date.now()) {
        throw new BadRequestException('The start time is in the past. Move it to a future time before scheduling.');
      }
      const onSale = await tx.auctionLot.count({ where: { auctionId: id, status: { not: 'WITHDRAWN' } } });
      if (onSale === 0) throw new BadRequestException('Add at least one lot before scheduling.');
      const updated = await tx.auction.update({ where: { id }, data: { status: 'SCHEDULED' } });
      return { auction: updated, changed: true };
    });

    if (changed) await this.recordTransition(actorId, 'auction.scheduled', auction);
    return auction;
  }

  /** Scheduled → draft, the undo of `schedule`. Refused once the auction has opened, because by then bids may exist. */
  async unschedule(id: string, actorId: string): Promise<Auction> {
    const { auction, changed } = await this.prisma.$transaction(async (tx) => {
      const status = await this.lockAuction(tx, id);
      const current = await tx.auction.findUniqueOrThrow({ where: { id } });
      if (status === 'DRAFT') return { auction: current, changed: false };
      if (status !== 'SCHEDULED') {
        throw new ConflictException(`A ${status.toLowerCase()} auction cannot be returned to draft.`);
      }
      const updated = await tx.auction.update({ where: { id }, data: { status: 'DRAFT' } });
      return { auction: updated, changed: true };
    });

    if (changed) await this.recordTransition(actorId, 'auction.unscheduled', auction);
    return auction;
  }

  /** Draft or scheduled → cancelled, with a reason in the audit trail. Lots still on sale are withdrawn with it. */
  async cancel(id: string, reason: string, actorId: string): Promise<Auction> {
    const { auction, changed } = await this.prisma.$transaction(async (tx) => {
      const status = await this.lockAuction(tx, id);
      const current = await tx.auction.findUniqueOrThrow({ where: { id } });
      if (status === 'CANCELLED') return { auction: current, changed: false };
      if (status !== 'DRAFT' && status !== 'SCHEDULED') {
        throw new ConflictException(`A ${status.toLowerCase()} auction can no longer be cancelled here.`);
      }
      await tx.auctionLot.updateMany({ where: { auctionId: id, status: { not: 'WITHDRAWN' } }, data: { status: 'WITHDRAWN' } });
      const updated = await tx.auction.update({ where: { id }, data: { status: 'CANCELLED' } });
      return { auction: updated, changed: true };
    });

    if (changed) await this.recordTransition(actorId, 'auction.cancelled', auction, { reason });
    return auction;
  }

  private viewLot(lot: AuctionLot, canSeeReserve: boolean): AuctionLotView {
    if (canSeeReserve) return lot;
    const { reservePriceMinor: _hidden, ...visible } = lot;
    return visible;
  }

  /** The row lock every mutation takes first; returns the status read under it. */
  private async lockAuction(tx: Prisma.TransactionClient, id: string): Promise<AuctionStatus> {
    const rows = await tx.$queryRaw<Array<{ status: AuctionStatus }>>`
      SELECT "status" FROM "Auction" WHERE "id" = ${id} FOR UPDATE
    `;
    if (rows.length === 0) throw new NotFoundException('Auction not found.');
    return rows[0].status;
  }

  private async lockDraft(tx: Prisma.TransactionClient, id: string, message: string): Promise<void> {
    const status = await this.lockAuction(tx, id);
    if (status !== 'DRAFT') throw new ConflictException(message);
  }

  private assertWindow(startsAt: Date, endsAt: Date): void {
    if (endsAt.getTime() <= startsAt.getTime()) throw new BadRequestException('endsAt must be after startsAt.');
  }

  private assertReserve(startPriceMinor: number, reservePriceMinor: number | undefined): void {
    if (reservePriceMinor !== undefined && reservePriceMinor < startPriceMinor) {
      throw new BadRequestException('The reserve cannot be below the opening price.');
    }
  }

  private async assertLocation(locationId: string): Promise<void> {
    const location = await this.prisma.location.findUnique({ where: { id: locationId }, select: { isActive: true } });
    if (!location || !location.isActive) throw new BadRequestException('The selling location was not found or is inactive.');
  }

  private async recordTransition(actorId: string, action: string, auction: Auction, extra: Record<string, unknown> = {}): Promise<void> {
    await this.audit.record({
      actorId,
      action,
      entity: 'Auction',
      entityId: auction.id,
      data: { number: auction.number, status: auction.status, ...extra },
    });
    this.logger.log(`${action} ${auction.number} by ${actorId}`);
  }
}
