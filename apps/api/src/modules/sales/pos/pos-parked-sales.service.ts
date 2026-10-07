import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Prisma, type PosOrderType, type PosParkedSale } from '../../../core/prisma/client';

/**
 * pos-hardware/31 §3 (WO-31.3) — park/retrieve for `TAB`/`TABLE` sales.
 * Reuses `pos-core`'s own basket maths unchanged: `basketSnapshot` is stored
 * and returned opaquely, never interpreted server-side. A `COUNTER` sale
 * never parks — retail and bakery counters tender immediately, the same
 * flow as today (doc 31 §3's own words).
 */
@Injectable()
export class PosParkedSalesService {
  constructor(private readonly prisma: PrismaService) {}

  async park(shiftId: string, orderType: PosOrderType, label: string, basketSnapshot: unknown): Promise<PosParkedSale> {
    if (orderType === 'COUNTER') {
      throw new BadRequestException('A COUNTER sale never parks — tender it directly.');
    }

    const shift = await this.prisma.posShift.findUnique({ where: { id: shiftId } });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.status !== 'OPEN') {
      throw new BadRequestException('This shift is closed — a sale cannot be parked against it.');
    }

    return this.prisma.posParkedSale.create({
      data: { shiftId, orderType, label, basketSnapshot: basketSnapshot as Prisma.InputJsonValue },
    });
  }

  /**
   * Idempotent — a conditional `updateMany` (predicate-on-write, House Rule
   * 10's own pattern) rather than a read-then-write race, so retrieving an
   * already-retrieved parked sale is refused, not double-materialized. The
   * caller's identity is not recorded on the row today — `pos.operate` is
   * shared across a shift's cashiers, the same trust boundary `sell()`
   * already uses.
   */
  async retrieve(id: string): Promise<PosParkedSale> {
    const result = await this.prisma.posParkedSale.updateMany({
      where: { id, retrievedAt: null },
      data: { retrievedAt: new Date() },
    });
    if (result.count === 0) {
      const existing = await this.prisma.posParkedSale.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Parked sale not found');
      throw new ConflictException('This sale has already been retrieved.');
    }
    return this.prisma.posParkedSale.findUniqueOrThrow({ where: { id } });
  }

  /** Open tabs/tables for a shift — shown on the till and on the shift-close screen. */
  async listOpen(shiftId: string): Promise<PosParkedSale[]> {
    return this.prisma.posParkedSale.findMany({
      where: { shiftId, retrievedAt: null },
      orderBy: { parkedAt: 'asc' },
    });
  }

  /** For the shift-close warning — "N sales left parked" (doc 31's own "reversal document" lens). */
  async countOpen(shiftId: string): Promise<number> {
    return this.prisma.posParkedSale.count({ where: { shiftId, retrievedAt: null } });
  }
}
