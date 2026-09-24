import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { generateHumanCode } from '@newax/shared';
import { PrismaService } from '../../core/prisma/prisma.service';
import { paginated, type PaginatedResult } from '../../core/common/dto/pagination.dto';
import { type PrismaLike } from '../../core/events/event-bus.service';
import { Prisma, type GiftCard, type GiftCardTransaction } from '../../core/prisma/client';
import type { GiftCardQueryDto, IssueGiftCardDto } from './dto/gift-card.dto';

/** Never log or display a full code — WO-5.4's own security note. */
export function maskGiftCardCode(code: string): string {
  return `••••-••••-${code.slice(-4)}`;
}

function generateCode(): string {
  return `${generateHumanCode(4)}-${generateHumanCode(4)}-${generateHumanCode(4)}`;
}

@Injectable()
export class GiftCardsService {
  private readonly logger = new Logger(GiftCardsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async issue(dto: IssueGiftCardDto, actorId: string | null): Promise<GiftCard> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      try {
        return await this.prisma.$transaction(async (tx) => {
          const giftCard = await tx.giftCard.create({
            data: {
              code,
              initialValue: dto.initialValue,
              balance: dto.initialValue,
              recipientName: dto.recipientName ?? null,
              recipientEmail: dto.recipientEmail ?? null,
              recipientPhone: dto.recipientPhone ?? null,
              message: dto.message ?? null,
              expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
            },
          });
          await tx.giftCardTransaction.create({
            data: {
              giftCardId: giftCard.id,
              delta: dto.initialValue,
              balanceAfter: dto.initialValue,
              reason: 'issue',
              actorId,
            },
          });
          return giftCard;
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          continue; // code collision — vanishingly rare at 12 unambiguous chars; retry with a fresh one.
        }
        throw error;
      }
    }
    throw new Error('Could not generate a unique gift card code after 5 attempts.');
  }

  async list(query: GiftCardQueryDto): Promise<PaginatedResult<GiftCard & { maskedCode: string }>> {
    const where: Prisma.GiftCardWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { code: { contains: query.q.toUpperCase() } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.giftCard.findMany({ where, skip: query.skip, take: query.take, orderBy: { createdAt: query.order } }),
      this.prisma.giftCard.count({ where }),
    ]);
    return paginated(rows.map((row) => ({ ...row, maskedCode: maskGiftCardCode(row.code) })), total, query);
  }

  async getById(id: string): Promise<GiftCard & { transactions: GiftCardTransaction[] }> {
    const giftCard = await this.prisma.giftCard.findUnique({
      where: { id },
      include: { transactions: { orderBy: { createdAt: 'desc' } } },
    });
    if (!giftCard) throw new NotFoundException('Gift card not found.');
    return giftCard;
  }

  /** Authenticated + rate-limited at the controller — see giftcards.controller.ts. Balance-check only, never redemption. */
  async lookupBalance(code: string): Promise<{ maskedCode: string; balance: number; status: string; expiresAt: Date | null }> {
    const giftCard = await this.prisma.giftCard.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!giftCard) throw new NotFoundException('No gift card found for that code.');
    return {
      maskedCode: maskGiftCardCode(giftCard.code),
      balance: giftCard.balance,
      status: giftCard.status,
      expiresAt: giftCard.expiresAt,
    };
  }

  async cancel(id: string, actorId: string | null): Promise<GiftCard> {
    return this.prisma.$transaction(async (tx) => {
      const giftCard = await tx.giftCard.findUnique({ where: { id } });
      if (!giftCard) throw new NotFoundException('Gift card not found.');
      if (giftCard.status === 'CANCELLED') throw new BadRequestException('That gift card is already cancelled.');

      if (giftCard.balance > 0) {
        await tx.giftCardTransaction.create({
          data: { giftCardId: id, delta: -giftCard.balance, balanceAfter: 0, reason: 'cancel', actorId },
        });
      }
      return tx.giftCard.update({ where: { id }, data: { status: 'CANCELLED', balance: 0 } });
    });
  }

  /**
   * Validates a code for checkout without redeeming it — the read-only half
   * of the same "validate then commit inside the order's own transaction"
   * split PromotionsService uses (see its resolvePromoCode/redeemInTransaction).
   */
  async resolveForCheckout(code: string, amount: number): Promise<GiftCard> {
    const giftCard = await this.prisma.giftCard.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!giftCard || giftCard.status !== 'ACTIVE') throw new BadRequestException('That gift card is not valid.');
    if (giftCard.expiresAt && giftCard.expiresAt < new Date()) throw new BadRequestException('That gift card has expired.');
    if (giftCard.balance < amount) throw new BadRequestException('That gift card does not have enough balance for this amount.');
    return giftCard;
  }

  /**
   * Debits a gift card inside OrdersService's own order-creation transaction.
   * The conditional `WHERE balance >= amount AND status = 'ACTIVE'` is what
   * makes two simultaneous checkouts against the same card safe — the loser
   * gets `count: 0` and its whole order transaction rolls back (WO-5's exit
   * criterion #3), exactly the same idiom as PromotionsService's promo-code
   * redemption.
   */
  async redeemInTransaction(
    tx: PrismaLike,
    input: { giftCardId: string; amount: number; orderId: string; actorId: string | null },
  ): Promise<void> {
    const updated = await tx.giftCard.updateMany({
      where: { id: input.giftCardId, status: 'ACTIVE', balance: { gte: input.amount } },
      data: { balance: { decrement: input.amount } },
    });
    if (updated.count === 0) {
      throw new BadRequestException('That gift card no longer has enough balance — someone else may have just used it.');
    }
    const giftCard = await tx.giftCard.findUniqueOrThrow({ where: { id: input.giftCardId } });
    if (giftCard.balance === 0) {
      await tx.giftCard.update({ where: { id: input.giftCardId }, data: { status: 'REDEEMED' } });
    }
    await tx.giftCardTransaction.create({
      data: {
        giftCardId: input.giftCardId,
        delta: -input.amount,
        balanceAfter: giftCard.balance,
        reason: 'redeem',
        orderId: input.orderId,
        actorId: input.actorId,
      },
    });
  }
}
