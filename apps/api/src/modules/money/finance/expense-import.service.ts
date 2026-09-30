import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { IMPORT_ROW_CAP, toMinor } from '@newax/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { FinanceService } from './finance.service';

export interface ImportRowResult {
  row: number;
  key: string;
  action: 'created' | 'skipped';
  message?: string;
}

export interface ImportSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  results: ImportRowResult[];
}

const COLUMNS = ['date', 'category', 'amount', 'description', 'vendor'] as const;
type Column = (typeof COLUMNS)[number];
type Row = Partial<Record<Column, string>>;

/**
 * CSV onboarding for a paper expense log
 * (admin-platform/72-fragmented-tool-consolidation-import.md WO-72.2) — the
 * same shape `ProductImportService` established, routed through
 * `FinanceService.createExpense()`'s own existing create path so every
 * imported row posts through `finance`'s own category/GL rules unchanged,
 * never a bypass of what a manual entry would face.
 *
 * `updated` never appears in this summary's counts: an expense has no
 * natural business key to upsert against (unlike a product's SKU or a
 * contact's phone/email), so re-importing the same file always creates a
 * second row — `Deviation` documented in `DECISIONS.md`, and the UI must
 * say so before a commit.
 *
 * Deliberately does NOT refuse a row dated into a CLOSED `FiscalPeriod`,
 * a documented deviation from admin-platform/72's own acceptance
 * criterion — see `DECISIONS.md`. Two independent reasons: (1) that
 * model belongs to the `accounting` module, and `finance.service.ts`'s
 * own header states the invariant this file preserves — "finance never
 * imports AccountingService... works identically whether or not
 * `accounting` is in MODULES" (R15); (2) no write path in this codebase
 * refuses one today — `AccountingService.resolveOpenPeriod()`, the only
 * place a `FiscalPeriod` is ever consulted before posting, silently
 * re-dates the *journal entry* into whichever period is open rather than
 * rejecting the source record, for a manually entered expense exactly as
 * for an imported one. Adding a reject-on-import rule would make a CSV
 * row stricter than typing the same expense by hand — inconsistent, not
 * safer.
 */
@Injectable()
export class ExpenseImportService {
  private readonly logger = new Logger(ExpenseImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
  ) {}

  /** A blank file with the right headers and one example row. */
  template(): string {
    return stringify(
      [{ date: '2026-08-01', category: 'rent', amount: '50000', description: 'August rent', vendor: 'Landlord' }],
      { header: true, columns: [...COLUMNS] },
    );
  }

  /**
   * `options.dryRun` (WO-72.3) validates every row without writing.
   */
  async import(actorId: string, csv: Buffer | string, options: { dryRun?: boolean } = {}): Promise<ImportSummary> {
    const dryRun = options.dryRun ?? false;
    const rows = this.parseCsv(csv);
    const summary: ImportSummary = { total: rows.length, created: 0, updated: 0, skipped: 0, results: [] };

    const categories = await this.prisma.expenseCategory.findMany({ select: { id: true, key: true } });
    const categoryByKey = new Map(categories.map((row) => [row.key.toLowerCase(), row.id]));

    for (const [index, row] of rows.entries()) {
      const lineNumber = index + 2; // header line + 1-indexed
      try {
        const result = await this.importRow(actorId, row, lineNumber, categoryByKey, dryRun);
        summary.results.push(result);
        summary[result.action] += 1;
      } catch (error) {
        summary.skipped += 1;
        summary.results.push({
          row: lineNumber,
          key: row.description ?? '',
          action: 'skipped',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.log(
      `CSV import${dryRun ? ' (dry run)' : ''}: ${summary.created} created, ${summary.skipped} skipped`,
    );
    return summary;
  }

  private parseCsv(csv: Buffer | string): Row[] {
    let rows: Row[];
    try {
      rows = parse(csv, {
        columns: (header: string[]) => header.map((name) => name.trim().toLowerCase()),
        skip_empty_lines: true,
        trim: true,
        bom: true,
      }) as Row[];
    } catch (error) {
      throw new BadRequestException(
        `That file could not be read as CSV: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (rows.length === 0) {
      throw new BadRequestException('The file has no data rows.');
    }
    if (rows.length > IMPORT_ROW_CAP) {
      throw new BadRequestException(`Import at most ${IMPORT_ROW_CAP} rows at a time.`);
    }
    for (const required of ['date', 'category', 'amount', 'description'] as const) {
      if (!(required in (rows[0] as Row))) {
        throw new BadRequestException(`The column "${required}" is missing. Download the template for the expected columns.`);
      }
    }

    return rows;
  }

  private async importRow(
    actorId: string,
    row: Row,
    lineNumber: number,
    categoryByKey: Map<string, string>,
    dryRun: boolean,
  ): Promise<ImportRowResult> {
    const description = (row.description ?? '').trim();
    if (!description) throw new Error('description is empty');

    const categoryKey = (row.category ?? '').trim().toLowerCase();
    const categoryId = categoryByKey.get(categoryKey);
    if (!categoryId) throw new Error(`unknown category "${row.category ?? ''}"`);

    const amountRupees = Number((row.amount ?? '').replace(/[,\s]/g, ''));
    if (!row.amount || Number.isNaN(amountRupees) || amountRupees <= 0) {
      throw new Error(`amount "${row.amount ?? ''}" is not a valid positive amount`);
    }

    const incurredAt = (row.date ?? '').trim();
    if (!incurredAt || Number.isNaN(Date.parse(incurredAt))) {
      throw new Error(`date "${row.date ?? ''}" is not a valid date`);
    }

    if (dryRun) {
      return { row: lineNumber, key: description, action: 'created' };
    }

    await this.finance.createExpense(
      {
        categoryId,
        amount: toMinor(amountRupees),
        description,
        incurredAt: new Date(incurredAt).toISOString(),
        payee: (row.vendor ?? '').trim() || undefined,
      },
      actorId,
    );

    return { row: lineNumber, key: description, action: 'created' };
  }
}
