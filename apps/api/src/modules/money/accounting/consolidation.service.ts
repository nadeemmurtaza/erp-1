import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';

export interface IntercompanyPair {
  brandId: string;
  counterpartyBrandId: string;
  /** Net (credit − debit) this brand booked against the counterparty — positive is net revenue recognized toward them, negative is net cost recognized from them. */
  netForwardMinor: number;
  /** The counterparty's own net booked back against this brand — the other half of the same trade. */
  netReverseMinor: number;
  /** min(|forward|, |reverse|) — the portion that actually offsets, removed from the group P&L. */
  eliminatedMinor: number;
  /** |forward| − |reverse| in absolute value — non-zero here is the exception report R17 asks for. */
  unmatchedMinor: number;
}

/**
 * Consolidation at the org tier (RETAIL-ERP.md R17, WO-20.6) — "if brand A
 * transfers goods to brand B at a transfer price, brand A books revenue and
 * brand B books cost. Summing the two brands' P&Ls double-counts — the
 * organization has not sold anything to anyone outside itself."
 *
 * Operates on whatever `JournalLine` rows already exist in THIS node's own
 * database, tagged `isIntercompany`/`counterpartyBrandId` — it does not care
 * whether those rows arrived by ordinary local posting (today's only real
 * case: an `Organization` with several `RetailBrand` rows sharing one
 * database) or, once a chain actually replicates facts up from separate
 * brand databases (WO-20.1/20.2/20.4), by that path instead. Nothing today
 * actually posts an intercompany entry — no inter-brand transfer feature
 * exists yet (RETAIL-ERP.md's own Tranche 5, `22.2`/`22.3`) — so this stays
 * dormant, the same "built before its caller exists" shape as WO-20.1's log.
 *
 * Deliberately narrow: eliminates the matched revenue/cost pair from the
 * group **P&L**, which is the concrete "revenue is a lie" problem R17
 * names. A matching balance-sheet adjustment for unrealized intercompany
 * profit sitting in a buying brand's still-unsold inventory is a real, and
 * materially harder, separate concern — it needs its own costing logic, not
 * a line eliminated wholesale — and is not attempted here.
 */
@Injectable()
export class ConsolidationService {
  constructor(private readonly prisma: PrismaService) {}

  async groupProfitAndLoss(from: Date, to: Date) {
    const [raw, pairs] = await Promise.all([this.rawTotals(from, to), this.intercompanyPairs(from, to)]);
    const eliminatedMinor = pairs.reduce((sum, pair) => sum + pair.eliminatedMinor, 0);

    const totalIncomeMinor = raw.totalIncomeMinor - eliminatedMinor;
    const totalExpenseMinor = raw.totalExpenseMinor - eliminatedMinor;

    return {
      from,
      to,
      totalIncomeMinor,
      totalExpenseMinor,
      netIncomeMinor: totalIncomeMinor - totalExpenseMinor,
      eliminatedMinor,
      intercompanyPairs: pairs,
    };
  }

  /** R17's own exception report — every brand pair whose intercompany volume did not net to zero. */
  async unmatchedIntercompany(from: Date, to: Date): Promise<IntercompanyPair[]> {
    const pairs = await this.intercompanyPairs(from, to);
    return pairs.filter((pair) => pair.unmatchedMinor !== 0);
  }

  /** Every brand's income/expense, summed together, unconsolidated — what a naive SUM across brands would show. */
  private async rawTotals(from: Date, to: Date): Promise<{ totalIncomeMinor: number; totalExpenseMinor: number }> {
    const sums = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { entry: { status: 'POSTED', date: { gte: from, lte: to } } },
      _sum: { debitMinor: true, creditMinor: true },
    });
    if (sums.length === 0) return { totalIncomeMinor: 0, totalExpenseMinor: 0 };

    const accounts = await this.prisma.account.findMany({
      where: { id: { in: sums.map((s) => s.accountId) }, type: { in: ['INCOME', 'EXPENSE'] } },
      select: { id: true, type: true },
    });
    const byId = new Map(accounts.map((a) => [a.id, a.type]));

    let totalIncomeMinor = 0;
    let totalExpenseMinor = 0;
    for (const s of sums) {
      const type = byId.get(s.accountId);
      if (!type) continue;
      const debit = s._sum.debitMinor ?? 0;
      const credit = s._sum.creditMinor ?? 0;
      if (type === 'INCOME') totalIncomeMinor += credit - debit;
      else totalExpenseMinor += debit - credit;
    }
    return { totalIncomeMinor, totalExpenseMinor };
  }

  private async intercompanyPairs(from: Date, to: Date): Promise<IntercompanyPair[]> {
    const lines = await this.prisma.journalLine.findMany({
      where: {
        entry: { status: 'POSTED', date: { gte: from, lte: to } },
        retailBrandId: { not: null },
        counterpartyBrandId: { not: null },
        account: { isIntercompany: true },
      },
      select: { retailBrandId: true, counterpartyBrandId: true, debitMinor: true, creditMinor: true },
    });

    const netByDirectedPair = new Map<string, number>();
    for (const line of lines) {
      const key = `${line.retailBrandId}|${line.counterpartyBrandId}`;
      const net = line.creditMinor - line.debitMinor;
      netByDirectedPair.set(key, (netByDirectedPair.get(key) ?? 0) + net);
    }

    const seenCanonicalPairs = new Set<string>();
    const results: IntercompanyPair[] = [];
    for (const key of netByDirectedPair.keys()) {
      const [brandId, counterpartyBrandId] = key.split('|');
      const canonical = [brandId, counterpartyBrandId].sort().join('|');
      if (seenCanonicalPairs.has(canonical)) continue;
      seenCanonicalPairs.add(canonical);

      const netForwardMinor = netByDirectedPair.get(`${brandId}|${counterpartyBrandId}`) ?? 0;
      const netReverseMinor = netByDirectedPair.get(`${counterpartyBrandId}|${brandId}`) ?? 0;
      const eliminatedMinor = Math.min(Math.abs(netForwardMinor), Math.abs(netReverseMinor));
      const unmatchedMinor = Math.abs(Math.abs(netForwardMinor) - Math.abs(netReverseMinor));

      results.push({ brandId, counterpartyBrandId, netForwardMinor, netReverseMinor, eliminatedMinor, unmatchedMinor });
    }
    return results;
  }
}
