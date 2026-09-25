import { Injectable, Logger } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { AiService } from '../../core/ai/ai.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AiFeature } from '../../core/prisma/client';
import { COLUMNS, type Column, type Row } from './product-import.service';

/** Only these three free-text columns get value-normalization suggestions — the rest are either enums, numbers, or already-structured (sku, category_slug). */
const NORMALIZABLE_COLUMNS = ['color', 'fabric', 'season'] as const;
type NormalizableColumn = (typeof NORMALIZABLE_COLUMNS)[number];

/** Bounds how many rows-needing-help go into one AI call — a 5000-row file (IMPORT_ROW_CAP) must never become a single giant prompt. The rest are simply not suggested; nothing stops importing them by hand. */
const MAX_SUGGESTIONS_PER_KIND = 100;

/** Word-token Jaccard similarity at or above this flags two distinct product names in the same category as a likely typo of each other, not two real products. */
const DUPLICATE_SIMILARITY_THRESHOLD = 0.7;

export interface ColumnMappingSuggestion {
  header: string;
  column: Column | null;
}

export interface ValueNormalizationSuggestion {
  column: NormalizableColumn;
  raw: string;
  suggested: string;
}

export interface DuplicateFlag {
  rows: number[];
  nameEn: string[];
  reason: string;
}

export interface CategorySuggestion {
  row: number;
  suggestedCategorySlug: string;
}

export interface TranslationSuggestion {
  row: number;
  field: 'name_ur' | 'description_ur';
  suggestedText: string;
}

export interface ImportAssistanceResult {
  /** True when every uploaded header already matches a canonical column — no mapping AI call was needed or made. */
  headersAlreadyMatch: boolean;
  columnMapping: ColumnMappingSuggestion[];
  valueSuggestions: ValueNormalizationSuggestion[];
  duplicateFlags: DuplicateFlag[];
  categorySuggestions: CategorySuggestion[];
  translationSuggestions: TranslationSuggestion[];
}

const COLUMN_MEANINGS: Record<Column, string> = {
  sku: 'unique product/variant code',
  kind: 'product kind (GOODS, SERVICE, DIGITAL, STITCHED, UNSTITCHED, STITCHING_SERVICE)',
  status: 'publish status (DRAFT, ACTIVE, ARCHIVED)',
  name_en: 'product name, English',
  name_ur: 'product name, Urdu',
  description_en: 'product description, English',
  description_ur: 'product description, Urdu',
  price_pkr: 'selling price in rupees',
  compare_at_pkr: 'strikethrough/original price in rupees',
  category_slug: "the shop's own existing category slug",
  brand: 'brand name',
  fabric: 'fabric material',
  season: 'season',
  piece_count: 'number of pieces in the set',
  fabric_meters: 'fabric length in meters',
  stitching_available: 'whether stitching can be added (yes/no)',
  garment_type_key: 'garment type key, for stitching services',
  size: 'variant size',
  color: 'variant color',
  stock: 'quantity on hand',
  tags: 'comma-separated tags',
};

const MAPPING_SYSTEM_PROMPT = [
  'You map a merchant\'s own spreadsheet column headers onto a fixed set of canonical import columns.',
  'You may only answer with one of the canonical column names given to you, or null. Never invent a column name that was not given.',
  'Reply with a single JSON array, one entry per header, in the same order as given, of exactly this shape and nothing else:',
  '[{"header": string, "column": string | null}]',
].join('\n');

const VALUE_NORMALIZATION_SYSTEM_PROMPT = [
  'You clean up a spreadsheet column of free-text values so the same real thing is not stored under several different spellings.',
  'Only group values that are clearly the SAME thing written differently — a case difference, extra spacing, or an unambiguous synonym. Never merge two values that could genuinely be different.',
  'For every value that should be relabeled, pick the clearest, most complete existing value among the group as the canonical one — never invent a value that was not given.',
  'Omit any value that is already fine as it is.',
  'Reply with a single JSON array of exactly this shape and nothing else: [{"raw": string, "suggested": string}]',
].join('\n');

const CATEGORY_SYSTEM_PROMPT = [
  "You assign a product to the best-matching category from a shop's own existing list.",
  'You may only answer with one of the exact category slugs given to you, or null if none genuinely fit. Never invent a category slug.',
  'Reply with a single JSON array of exactly this shape and nothing else: [{"row": number, "suggestedCategorySlug": string | null}]',
].join('\n');

const TRANSLATION_SYSTEM_PROMPT = [
  'You translate retail product copy from English to Urdu for a Pakistani apparel store, faithfully — never add a claim, a material, or a measurement that the English text does not already say.',
  'Reply with a single JSON array of exactly this shape and nothing else: [{"row": number, "field": string, "suggestedText": string}]',
].join('\n');

/**
 * WO-9.10 (09-ai-layer.md) — "add AI assistance to the mapping step" of the
 * already-idempotent, already-preview-capable catalogue import
 * (ProductImportService). Every suggestion here is exactly that — a
 * suggestion the admin screen shows and a person accepts or rejects before
 * anything is rewritten; this service never touches the database itself.
 * Duplicate flagging is deliberately plain arithmetic (word-token
 * similarity), not an AI call — "no model where arithmetic already answers
 * the question" (WO-9.2/9.3/9.4/9.8's own idiom throughout this phase).
 */
@Injectable()
export class ImportAssistantService {
  private readonly logger = new Logger(ImportAssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async assist(csv: Buffer | string): Promise<ImportAssistanceResult> {
    const { headers, rawRows } = this.parseRaw(csv);
    const headersAlreadyMatch = headers.every((header) => (COLUMNS as readonly string[]).includes(header));

    const columnMapping = headersAlreadyMatch
      ? headers.map((header) => ({ header, column: header as Column }))
      : await this.suggestColumnMapping(headers);

    const mappingByHeader = new Map(columnMapping.map((entry) => [entry.header, entry.column]));
    const rows: Row[] = rawRows.map((rawRow) => {
      const row: Row = {};
      headers.forEach((header, index) => {
        const column = mappingByHeader.get(header);
        if (column && rawRow[index]?.trim()) row[column] = rawRow[index].trim();
      });
      return row;
    });

    const [valueSuggestions, categorySuggestions, translationSuggestions] = await Promise.all([
      this.suggestValueNormalizations(rows),
      this.suggestCategories(rows),
      this.suggestTranslations(rows),
    ]);

    return {
      headersAlreadyMatch,
      columnMapping,
      valueSuggestions,
      duplicateFlags: this.flagDuplicates(rows),
      categorySuggestions,
      translationSuggestions,
    };
  }

  private parseRaw(csv: Buffer | string): { headers: string[]; rawRows: string[][] } {
    const table = parse(csv, { columns: false, skip_empty_lines: true, trim: true, bom: true }) as string[][];
    const [headerRow, ...rest] = table;
    const headers = (headerRow ?? []).map((name) => name.trim().toLowerCase());
    return { headers, rawRows: rest };
  }

  private async suggestColumnMapping(headers: string[]): Promise<ColumnMappingSuggestion[]> {
    if (!this.ai.isAvailable('complete')) return headers.map((header) => ({ header, column: null }));

    const columnList = COLUMNS.map((column) => `${column}: ${COLUMN_MEANINGS[column]}`).join('\n');
    const result = await this.ai.complete(AiFeature.IMPORT_CLEANUP, {
      system: MAPPING_SYSTEM_PROMPT,
      prompt: `Canonical columns:\n${columnList}\n\nSpreadsheet headers to map, in order:\n${headers.map((h, i) => `${i + 1}. "${h}"`).join('\n')}`,
      jsonMode: true,
      maxTokens: 800,
      temperature: 0,
    });
    if (!result) return headers.map((header) => ({ header, column: null }));

    const parsed = parseJsonArray(result.text);
    const byHeader = new Map<string, unknown>();
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).header === 'string') {
          byHeader.set((entry as Record<string, unknown>).header as string, (entry as Record<string, unknown>).column);
        }
      }
    }

    return headers.map((header) => {
      const candidate = byHeader.get(header);
      const column = typeof candidate === 'string' && (COLUMNS as readonly string[]).includes(candidate) ? (candidate as Column) : null;
      return { header, column };
    });
  }

  private async suggestValueNormalizations(rows: Row[]): Promise<ValueNormalizationSuggestion[]> {
    if (!this.ai.isAvailable('complete')) return [];

    const results = await Promise.all(
      NORMALIZABLE_COLUMNS.map((column) => this.suggestValueNormalizationForColumn(column, rows)),
    );
    return results.flat();
  }

  private async suggestValueNormalizationForColumn(column: NormalizableColumn, rows: Row[]): Promise<ValueNormalizationSuggestion[]> {
    const distinctValues = [...new Set(rows.map((row) => row[column]?.trim()).filter((v): v is string => Boolean(v)))];
    if (distinctValues.length < 2) return [];

    const result = await this.ai.complete(AiFeature.IMPORT_CLEANUP, {
      system: VALUE_NORMALIZATION_SYSTEM_PROMPT,
      prompt: `Column: ${column}\nDistinct values as they appear in the file:\n${distinctValues.map((v) => `"${v}"`).join('\n')}`,
      jsonMode: true,
      maxTokens: 600,
      temperature: 0,
    });
    if (!result) return [];

    const parsed = parseJsonArray(result.text);
    if (!Array.isArray(parsed)) return [];

    const validRaw = new Set(distinctValues);
    return parsed
      .filter(
        (entry): entry is { raw: string; suggested: string } =>
          Boolean(entry) &&
          typeof entry === 'object' &&
          typeof (entry as Record<string, unknown>).raw === 'string' &&
          typeof (entry as Record<string, unknown>).suggested === 'string' &&
          validRaw.has((entry as Record<string, unknown>).raw as string),
      )
      .map((entry) => ({ column, raw: entry.raw, suggested: entry.suggested.trim() }))
      .filter((entry) => entry.suggested && entry.suggested !== entry.raw);
  }

  private async suggestCategories(rows: Row[]): Promise<CategorySuggestion[]> {
    const needingCategory = rows
      .map((row, index) => ({ row: index + 2, nameEn: row.name_en?.trim(), categorySlug: row.category_slug?.trim() }))
      .filter((entry): entry is { row: number; nameEn: string; categorySlug: string | undefined } => Boolean(entry.nameEn) && !entry.categorySlug)
      .slice(0, MAX_SUGGESTIONS_PER_KIND);
    if (needingCategory.length === 0 || !this.ai.isAvailable('complete')) return [];

    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      select: { slug: true, translations: { where: { locale: 'en' }, take: 1, select: { name: true } } },
    });
    if (categories.length === 0) return [];
    const validSlugs = new Set(categories.map((c) => c.slug));

    const categoryList = categories.map((c) => `${c.slug} — ${c.translations[0]?.name ?? c.slug}`).join('\n');
    const productList = needingCategory.map((entry) => `${entry.row}: "${entry.nameEn}"`).join('\n');

    const result = await this.ai.complete(AiFeature.IMPORT_CLEANUP, {
      system: CATEGORY_SYSTEM_PROMPT,
      prompt: `Existing categories:\n${categoryList}\n\nProducts needing a category (row: name):\n${productList}`,
      jsonMode: true,
      maxTokens: 1000,
      temperature: 0,
    });
    if (!result) return [];

    const parsed = parseJsonArray(result.text);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (entry): entry is { row: number; suggestedCategorySlug: string } =>
          Boolean(entry) &&
          typeof entry === 'object' &&
          typeof (entry as Record<string, unknown>).row === 'number' &&
          typeof (entry as Record<string, unknown>).suggestedCategorySlug === 'string' &&
          validSlugs.has((entry as Record<string, unknown>).suggestedCategorySlug as string),
      )
      .map((entry) => ({ row: entry.row, suggestedCategorySlug: entry.suggestedCategorySlug }));
  }

  private async suggestTranslations(rows: Row[]): Promise<TranslationSuggestion[]> {
    interface Need {
      row: number;
      field: 'name_ur' | 'description_ur';
      sourceField: string;
      sourceText: string;
    }
    const needs: Need[] = [];
    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      if (row.name_en?.trim() && !row.name_ur?.trim()) {
        needs.push({ row: rowNumber, field: 'name_ur', sourceField: 'name_en', sourceText: row.name_en.trim() });
      }
      if (row.description_en?.trim() && !row.description_ur?.trim()) {
        needs.push({ row: rowNumber, field: 'description_ur', sourceField: 'description_en', sourceText: row.description_en.trim() });
      }
    });
    const bounded = needs.slice(0, MAX_SUGGESTIONS_PER_KIND);
    if (bounded.length === 0 || !this.ai.isAvailable('complete')) return [];

    const prompt = bounded
      .map((need) => `Row ${need.row}, field "${need.field}" — translate this ${need.sourceField}: "${need.sourceText}"`)
      .join('\n');

    const result = await this.ai.complete(AiFeature.IMPORT_CLEANUP, {
      system: TRANSLATION_SYSTEM_PROMPT,
      prompt,
      jsonMode: true,
      maxTokens: 2000,
      temperature: 0.2,
    });
    if (!result) return [];

    const parsed = parseJsonArray(result.text);
    if (!Array.isArray(parsed)) return [];

    const validKeys = new Set(bounded.map((need) => `${need.row}:${need.field}`));
    return parsed
      .filter(
        (entry): entry is { row: number; field: string; suggestedText: string } =>
          Boolean(entry) &&
          typeof entry === 'object' &&
          typeof (entry as Record<string, unknown>).row === 'number' &&
          (entry as Record<string, unknown>).field !== undefined &&
          typeof (entry as Record<string, unknown>).suggestedText === 'string' &&
          validKeys.has(`${(entry as Record<string, unknown>).row}:${(entry as Record<string, unknown>).field}`),
      )
      .map((entry) => ({ row: entry.row, field: entry.field as 'name_ur' | 'description_ur', suggestedText: entry.suggestedText.trim() }));
  }

  /** Pure arithmetic — two rows in different name+category groups whose names are near-identical word-for-word are probably the same product typed twice, not two products. */
  private flagDuplicates(rows: Row[]): DuplicateFlag[] {
    const groups = new Map<string, { rows: number[]; nameEn: string; tokens: Set<string> }>();
    rows.forEach((row, index) => {
      const nameEn = row.name_en?.trim();
      if (!nameEn) return;
      const category = row.category_slug?.trim() ?? '';
      const key = `${normalizeForGrouping(nameEn)}|${category}`;
      const existing = groups.get(key);
      if (existing) {
        existing.rows.push(index + 2);
      } else {
        groups.set(key, { rows: [index + 2], nameEn, tokens: tokenize(nameEn) });
      }
    });

    const distinctGroups = [...groups.values()];
    const flags: DuplicateFlag[] = [];
    const flagged = new Set<number>();

    for (let i = 0; i < distinctGroups.length; i += 1) {
      for (let j = i + 1; j < distinctGroups.length; j += 1) {
        if (flagged.has(i) || flagged.has(j)) continue;
        const similarity = jaccard(distinctGroups[i]!.tokens, distinctGroups[j]!.tokens);
        if (similarity >= DUPLICATE_SIMILARITY_THRESHOLD) {
          flagged.add(i);
          flagged.add(j);
          flags.push({
            rows: [...distinctGroups[i]!.rows, ...distinctGroups[j]!.rows].sort((a, b) => a - b),
            nameEn: [distinctGroups[i]!.nameEn, distinctGroups[j]!.nameEn],
            reason: 'These product names are very similar — check they are not the same product typed twice.',
          });
        }
      }
    }

    return flags;
  }
}

function normalizeForGrouping(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenize(value: string): Set<string> {
  return new Set(normalizeForGrouping(value).split(' ').filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

/** Claude has no JSON-only mode (see ai-provider.ts's own note on jsonMode) — the reply may still arrive wrapped in prose. */
function parseJsonArray(text: string): unknown {
  const trimmed = text.trim();
  const candidate = trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed : (/\[[\s\S]*\]/.exec(trimmed)?.[0] ?? null);
  if (!candidate) return null;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}
