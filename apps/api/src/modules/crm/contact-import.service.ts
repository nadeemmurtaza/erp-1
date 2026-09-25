import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { IMPORT_ROW_CAP, normalizePkPhone, normalizeEmail } from '@newax/shared';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CrmService } from './crm.service';

export interface ImportRowResult {
  row: number;
  key: string;
  action: 'created' | 'updated' | 'skipped';
  message?: string;
}

export interface ImportSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  results: ImportRowResult[];
}

// admin-platform/72-fragmented-tool-consolidation-import.md names the
// column `address`; `Contact` has no such field (only `city`), so this
// is `city` instead — a documented deviation, see DECISIONS.md.
const COLUMNS = ['name', 'phone', 'email', 'city', 'notes', 'tags'] as const;
type Column = (typeof COLUMNS)[number];
type Row = Partial<Record<Column, string>>;

/**
 * CSV onboarding for the customer book
 * (admin-platform/72-fragmented-tool-consolidation-import.md WO-72.1) — the
 * same shape `ProductImportService` already established (`catalog`),
 * extended to `crm`'s own `Contact` model. Never a shared base class: each
 * entity's own columns and upsert key differ enough that inheritance would
 * hide more than it shares — the convention is the reuse, not the code.
 *
 * Upserts through `CrmService.upsertContact()` — the exact phone-then-email
 * dedup rule that service already implements for every other Contact write
 * in this codebase, so a re-imported spreadsheet updates the same row a
 * storefront order or a WhatsApp lead would have matched, never a duplicate.
 */
@Injectable()
export class ContactImportService {
  private readonly logger = new Logger(ContactImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crm: CrmService,
  ) {}

  /** A blank file with the right headers and one example row. */
  template(): string {
    return stringify(
      [
        {
          name: 'Ayesha Khan',
          phone: '03001234567',
          email: 'ayesha@example.com',
          city: 'Lahore',
          notes: 'Prefers WhatsApp',
          tags: 'vip,wholesale',
        },
      ],
      { header: true, columns: [...COLUMNS] },
    );
  }

  /**
   * `options.dryRun` (WO-72.3) runs every row's own validation and reports
   * the `created`/`updated`/`skipped` counts it WOULD produce, without
   * writing.
   */
  async import(actorId: string, csv: Buffer | string, options: { dryRun?: boolean } = {}): Promise<ImportSummary> {
    const dryRun = options.dryRun ?? false;
    const rows = this.parseCsv(csv);
    const summary: ImportSummary = { total: rows.length, created: 0, updated: 0, skipped: 0, results: [] };

    for (const [index, row] of rows.entries()) {
      const lineNumber = index + 2; // header line + 1-indexed
      try {
        const result = await this.importRow(actorId, row, lineNumber, dryRun);
        summary.results.push(result);
        summary[result.action] += 1;
      } catch (error) {
        summary.skipped += 1;
        summary.results.push({
          row: lineNumber,
          key: row.phone ?? row.email ?? '',
          action: 'skipped',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!dryRun) {
      await this.audit.record({
        actorId,
        action: 'contact.imported',
        entity: 'Contact',
        data: { total: summary.total, created: summary.created, updated: summary.updated, skipped: summary.skipped },
      });
    }

    this.logger.log(
      `CSV import${dryRun ? ' (dry run)' : ''}: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped`,
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
    if (!('name' in (rows[0] as Row))) {
      throw new BadRequestException('The column "name" is missing. Download the template for the expected columns.');
    }

    return rows;
  }

  private async importRow(actorId: string, row: Row, lineNumber: number, dryRun: boolean): Promise<ImportRowResult> {
    const name = (row.name ?? '').trim();
    if (!name) throw new Error('name is empty');

    const phone = normalizePkPhone(row.phone).e164;
    const email = normalizeEmail(row.email);
    if (!phone && !email) throw new Error('at least one of phone or email is required');

    const key = phone ?? email ?? '';

    // Same OR-match CrmService.upsertContact() itself uses, run first and
    // read-only, purely to report created vs. updated — upsertContact()
    // does not return which branch it took.
    const existing = await this.prisma.contact.findFirst({
      where: { OR: [...(phone ? [{ phoneE164: phone }] : []), ...(email ? [{ email }] : [])] },
      select: { id: true },
    });

    if (dryRun) {
      return { row: lineNumber, key, action: existing ? 'updated' : 'created' };
    }

    const contact = await this.crm.upsertContact({
      name,
      phone: row.phone,
      email: row.email,
      city: (row.city ?? '').trim() || null,
      source: 'csv_import',
    });

    const notes = (row.notes ?? '').trim();
    if (notes) {
      await this.prisma.contact.update({ where: { id: contact.id }, data: { notes } });
    }

    const tagNames = (row.tags ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    for (const tagName of tagNames) {
      await this.crm.tagContact(contact.id, tagName);
    }

    return { row: lineNumber, key, action: existing ? 'updated' : 'created' };
  }
}
