import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { PRODUCT_KINDS, slugifyWithFallback, toMinor, uniqueSlug } from '@yaseen/shared';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { StockIntakeRegistry } from '../../core/extension-points/stock-intake.registry';
import type { ProductKind, ProductStatus } from '../../core/prisma/client';

export interface ImportRowResult {
  row: number;
  sku: string;
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

const COLUMNS = [
  'sku',
  'kind',
  'status',
  'name_en',
  'name_ur',
  'description_en',
  'description_ur',
  'price_pkr',
  'compare_at_pkr',
  'category_slug',
  'brand',
  'fabric',
  'season',
  'piece_count',
  'fabric_meters',
  'stitching_available',
  'garment_type_key',
  'size',
  'color',
  'stock',
  'tags',
] as const;

type Column = (typeof COLUMNS)[number];
type Row = Partial<Record<Column, string>>;

/**
 * Bulk load of an existing catalogue from a spreadsheet.
 *
 * One CSV row is one VARIANT. Rows sharing a name and category are folded into
 * a single product with several variants, which is how a real stock list is
 * written ("Blue / M", "Blue / L", "Pink / M" …).
 *
 * Prices are in RUPEES in the file — nobody types paisa into a spreadsheet —
 * and converted on the way in.
 */
@Injectable()
export class ProductImportService {
  private readonly logger = new Logger(ProductImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stockIntake: StockIntakeRegistry,
  ) {}

  /** A blank file with the right headers and one example row. */
  template(): string {
    return stringify(
      [
        {
          sku: 'LWN-3PC-BLU-M',
          kind: 'UNSTITCHED',
          status: 'DRAFT',
          name_en: '3-Piece Embroidered Lawn Suit',
          name_ur: 'تھری پیس کڑھائی والا لان سوٹ',
          description_en: 'Embroidered front, printed back and sleeves, chiffon dupatta.',
          description_ur: 'کڑھائی والا فرنٹ، پرنٹڈ بیک اور آستین، شیفون دوپٹہ۔',
          price_pkr: '4500',
          compare_at_pkr: '5500',
          category_slug: 'unstitched',
          brand: 'Yaseen',
          fabric: 'lawn',
          season: 'summer',
          piece_count: '3',
          fabric_meters: '9.5',
          stitching_available: 'yes',
          garment_type_key: '',
          size: 'Free size',
          color: 'Ferozi',
          stock: '25',
          tags: 'embroidered,summer',
        },
      ],
      { header: true, columns: [...COLUMNS] },
    );
  }

  async import(actorId: string, csv: Buffer | string): Promise<ImportSummary> {
    const rows = this.parseCsv(csv);
    const summary: ImportSummary = {
      total: rows.length,
      created: 0,
      updated: 0,
      skipped: 0,
      results: [],
    };

    // Resolve lookups once rather than per row.
    const categories = await this.prisma.category.findMany({ select: { id: true, slug: true } });
    const categoryBySlug = new Map(categories.map((row) => [row.slug, row.id]));
    const garments = await this.prisma.garmentType.findMany({ select: { id: true, key: true } });
    const garmentByKey = new Map(garments.map((row) => [row.key, row.id]));
    const locationId = await this.stockIntake.defaultLocationId();

    for (const [index, row] of rows.entries()) {
      // +2: one for the header line, one because humans count from 1.
      const lineNumber = index + 2;
      try {
        const result = await this.importRow(actorId, row, lineNumber, categoryBySlug, garmentByKey, locationId);
        summary.results.push(result);
        summary[result.action === 'skipped' ? 'skipped' : result.action] += 1;
      } catch (error) {
        summary.skipped += 1;
        summary.results.push({
          row: lineNumber,
          sku: row.sku ?? '',
          action: 'skipped',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await this.audit.record({
      actorId,
      action: 'product.imported',
      entity: 'Product',
      data: {
        total: summary.total,
        created: summary.created,
        updated: summary.updated,
        skipped: summary.skipped,
      },
    });

    this.logger.log(
      `CSV import: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped`,
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
        `That file could not be read as CSV: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (rows.length === 0) {
      throw new BadRequestException('The file has no data rows.');
    }
    if (rows.length > 5000) {
      throw new BadRequestException('Import at most 5000 rows at a time.');
    }

    const first = rows[0] as Row;
    for (const required of ['sku', 'name_en', 'price_pkr'] as const) {
      if (!(required in first)) {
        throw new BadRequestException(
          `The column "${required}" is missing. Download the template for the expected columns.`,
        );
      }
    }

    return rows;
  }

  private async importRow(
    actorId: string,
    row: Row,
    lineNumber: number,
    categoryBySlug: Map<string, string>,
    garmentByKey: Map<string, string>,
    locationId: string | null,
  ): Promise<ImportRowResult> {
    const sku = (row.sku ?? '').trim().toUpperCase();
    if (!sku) throw new Error('sku is empty');

    const nameEn = (row.name_en ?? '').trim();
    if (!nameEn) throw new Error('name_en is empty');

    const price = parseRupees(row.price_pkr, 'price_pkr');
    const kind = parseKind(row.kind);
    const status = parseStatus(row.status);

    const categorySlug = (row.category_slug ?? '').trim();
    const categoryId = categorySlug ? categoryBySlug.get(categorySlug) : undefined;
    if (categorySlug && !categoryId) {
      throw new Error(`unknown category_slug "${categorySlug}"`);
    }

    const garmentKey = (row.garment_type_key ?? '').trim();
    const garmentTypeId = garmentKey ? garmentByKey.get(garmentKey) : undefined;
    if (garmentKey && !garmentTypeId) {
      throw new Error(`unknown garment_type_key "${garmentKey}"`);
    }
    if (kind === 'STITCHING_SERVICE' && !garmentTypeId) {
      throw new Error('a STITCHING_SERVICE row needs garment_type_key');
    }

    const requestedStock = parseInteger(row.stock) ?? 0;

    // An existing SKU updates its variant in place; that makes the import
    // re-runnable, which matters when a stock file is uploaded weekly.
    const existingVariant = await this.prisma.productVariant.findUnique({
      where: { sku },
      select: { id: true, productId: true, stock: true },
    });

    if (existingVariant) {
      await this.prisma.productVariant.updateMany({
        where: { id: existingVariant.id },
        data: {
          size: (row.size ?? '').trim() || null,
          color: (row.color ?? '').trim() || null,
        },
      });
      await this.prisma.product.update({
        where: { id: existingVariant.productId },
        data: { basePrice: price, status },
      });
      if (requestedStock !== existingVariant.stock && locationId) {
        await this.stockIntake.recordIntake({
          variantId: existingVariant.id,
          locationId,
          delta: requestedStock - existingVariant.stock,
          reason: 'ADJUSTMENT',
          actorId,
          note: 'CSV Import update',
        });
      }
      return { row: lineNumber, sku, action: 'updated' };
    }

    // Group variants of the same garment under one product.
    const sibling = await this.prisma.product.findFirst({
      where: {
        kind,
        categoryId: categoryId ?? null,
        translations: { some: { locale: 'en', name: nameEn } },
      },
      select: { id: true },
    });

    if (sibling) {
      const created = await this.prisma.productVariant.create({
        data: {
          productId: sibling.id,
          sku,
          size: (row.size ?? '').trim() || null,
          color: (row.color ?? '').trim() || null,
          stock: 0,
        },
      });
      if (requestedStock !== 0 && locationId) {
        await this.stockIntake.recordIntake({
          variantId: created.id,
          locationId,
          delta: requestedStock,
          reason: 'ADJUSTMENT',
          actorId,
          note: 'CSV Import sibling added',
        });
      }
      return { row: lineNumber, sku, action: 'updated', message: 'variant added' };
    }

    const slug = await this.freeSlug(nameEn);
    const nameUr = (row.name_ur ?? '').trim();

    const product = await this.prisma.product.create({
      data: {
        slug,
        kind,
        status,
        categoryId: categoryId ?? null,
        basePrice: price,
        compareAtPrice: row.compare_at_pkr
          ? parseRupees(row.compare_at_pkr, 'compare_at_pkr')
          : null,
        brand: (row.brand ?? '').trim() || null,
        fabric: (row.fabric ?? '').trim().toLowerCase() || null,
        season: (row.season ?? '').trim().toLowerCase() || null,
        tags: (row.tags ?? '')
          .split(',')
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean),
        pieceCount: kind === 'UNSTITCHED' ? parseInteger(row.piece_count) : null,
        fabricMeters: kind === 'UNSTITCHED' ? parseDecimal(row.fabric_meters) : null,
        stitchingAvailable: kind === 'UNSTITCHED' && parseBoolean(row.stitching_available),
        garmentTypeId: kind === 'STITCHING_SERVICE' ? (garmentTypeId ?? null) : null,
        publishedAt: status === 'ACTIVE' ? new Date() : null,
        translations: {
          create: [
            {
              locale: 'en',
              name: nameEn,
              description: (row.description_en ?? '').trim() || null,
            },
            ...(nameUr
              ? [
                  {
                    locale: 'ur',
                    name: nameUr,
                    description: (row.description_ur ?? '').trim() || null,
                  },
                ]
              : []),
          ],
        },
        variants: {
          create: {
            sku,
            size: (row.size ?? '').trim() || null,
            color: (row.color ?? '').trim() || null,
            stock: 0,
          },
        },
        ...(kind === 'UNSTITCHED' && garmentTypeId
          ? { garmentTypes: { create: { garmentTypeId } } }
          : {}),
      },
      include: { variants: true },
    });

    if (requestedStock !== 0 && locationId) {
      const createdVariant = product.variants[0];
      await this.stockIntake.recordIntake({
        variantId: createdVariant.id,
        locationId,
        delta: requestedStock,
        reason: 'ADJUSTMENT',
        actorId,
        note: 'CSV Import created',
      });
    }

    return { row: lineNumber, sku, action: 'created' };
  }

  private async freeSlug(name: string): Promise<string> {
    const base = slugifyWithFallback(name, 'product');
    const clashes = await this.prisma.product.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    });
    return uniqueSlug(
      base,
      clashes.map((row) => row.slug),
    );
  }
}

function parseRupees(value: string | undefined, column: string): number {
  const cleaned = (value ?? '').replace(/[,\s]/g, '');
  const amount = Number(cleaned);

  if (!cleaned || Number.isNaN(amount) || amount < 0) {
    throw new Error(`${column} "${value ?? ''}" is not a valid amount`);
  }
  return toMinor(amount);
}

function parseInteger(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseDecimal(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value: string | undefined): boolean {
  return ['yes', 'true', '1', 'y'].includes((value ?? '').trim().toLowerCase());
}

function parseKind(value: string | undefined): ProductKind {
  const kind = (value ?? 'UNSTITCHED').trim().toUpperCase();
  if (!(PRODUCT_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`kind "${value}" must be one of ${PRODUCT_KINDS.join(', ')}`);
  }
  return kind as ProductKind;
}

function parseStatus(value: string | undefined): ProductStatus {
  const status = (value ?? 'DRAFT').trim().toUpperCase();
  if (!['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(status)) {
    throw new Error(`status "${value}" must be DRAFT, ACTIVE or ARCHIVED`);
  }
  return status as ProductStatus;
}
