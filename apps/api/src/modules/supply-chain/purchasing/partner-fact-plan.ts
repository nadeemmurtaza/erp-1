import { formatMoneyIn } from '@newax/shared';

/**
 * WO-213.2 (213-partner-fact-exchange.md, ADR-083). The decision of what to do
 * with a connected partner's `sale.dispatched` fact, as ONE pure function.
 *
 * Nothing here reads a database, writes one, or publishes an event. The same
 * function therefore serves the real apply, a dry run (`preview()`), and a
 * replay over last month's stored facts — the "dry run before live" rule.
 *
 * The rule it enforces: a fact is applied only when EVERY check passes.
 * Otherwise the whole fact waits for a person. Nothing is partially applied
 * and nothing is guessed.
 */

/** A purchase order line, a bill and a stock column are all Postgres `Int` (int4). */
const MAX_INT = 2_147_483_647;

/** The stored fact's shape, as far as the plan needs it. */
export interface SaleFactLine {
  gtin?: string;
  sellerSku?: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  taxMinor: number;
}

export interface SaleFact {
  factId: string;
  documentRef: string | null;
  currency: string;
  lines: SaleFactLine[];
}

export interface LinkedSupplier {
  id: string;
  name: string;
  /** ISO 4217 — the currency this supplier's bills are raised in. */
  currency: string;
}

export interface KnownVariant {
  id: string;
  /** The variant's current cost (minor units per unit). 0 means "no cost yet". */
  costPrice: number;
  isActive: boolean;
}

export interface PlanInput {
  fact: SaleFact;
  /** Active suppliers whose `tradingPartnerId` is the sender. */
  suppliers: readonly LinkedSupplier[];
  /** Variants found by the fact's barcodes, keyed by barcode. */
  variantsByBarcode: ReadonlyMap<string, KnownVariant>;
  baseCurrency: string;
  /** Percent. A line further than this from our current cost is held for review. 0 switches the check off. */
  thresholdPercent: number;
}

export type LineStatus = 'MATCHED' | 'NO_BARCODE' | 'UNKNOWN_BARCODE' | 'INACTIVE_PRODUCT';

export interface LineOutcome {
  lineIndex: number;
  status: LineStatus;
  variantId?: string;
  /** Percent away from our current cost, when both are known. */
  priceDeltaPercent?: number;
}

export interface PlannedLine {
  lineIndex: number;
  variantId: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  taxMinor: number;
}

export type SaleFactPlan =
  | {
      outcome: 'APPLY';
      reasons: [];
      supplier: LinkedSupplier;
      lines: PlannedLine[];
      lineOutcomes: LineOutcome[];
      subtotalMinor: number;
      taxMinor: number;
      totalMinor: number;
    }
  | { outcome: 'REVIEW'; reasons: string[]; lineOutcomes: LineOutcome[] };

const isInt = (value: unknown, min: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min;

/**
 * Reads a stored payload back into a `SaleFact`, or null when it is not one.
 * The inbox validated this on the way in; this is the defence for a row that
 * was edited, purged or written by a later schema version.
 */
export function parseSaleFact(payload: unknown): SaleFact | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (
    typeof p.factId !== 'string' ||
    typeof p.currency !== 'string' ||
    !Array.isArray(p.lines) ||
    p.lines.length === 0
  ) {
    return null;
  }

  const lines: SaleFactLine[] = [];
  for (const raw of p.lines) {
    if (!raw || typeof raw !== 'object') return null;
    const l = raw as Record<string, unknown>;
    if (typeof l.name !== 'string' || !isInt(l.quantity, 1) || !isInt(l.unitPriceMinor, 0)) return null;
    if (l.taxMinor !== undefined && !isInt(l.taxMinor, 0)) return null;
    lines.push({
      gtin: typeof l.gtin === 'string' ? l.gtin : undefined,
      sellerSku: typeof l.sellerSku === 'string' ? l.sellerSku : undefined,
      name: l.name,
      quantity: l.quantity,
      unitPriceMinor: l.unitPriceMinor,
      taxMinor: (l.taxMinor as number | undefined) ?? 0,
    });
  }

  return {
    factId: p.factId,
    documentRef: typeof p.documentRef === 'string' ? p.documentRef : null,
    currency: p.currency,
    lines,
  };
}

const label = (index: number, name: string) =>
  `Line ${index + 1} ("${name.length > 60 ? `${name.slice(0, 57)}...` : name}")`;

export function planSaleFact(input: PlanInput): SaleFactPlan {
  const { fact, suppliers, variantsByBarcode, baseCurrency, thresholdPercent } = input;
  const reasons: string[] = [];

  // 1. Exactly one supplier is linked to this partner. Several would mean
  // guessing whose order it is; none means nobody to owe the money to.
  if (suppliers.length === 0) {
    reasons.push('No active supplier is linked to this trading partner. Link one to it, then retry.');
  } else if (suppliers.length > 1) {
    reasons.push(
      `More than one active supplier is linked to this trading partner (${suppliers.map((s) => s.name).join(', ')}). Keep one linked, then retry.`,
    );
  }
  const supplier = suppliers.length === 1 ? suppliers[0] : null;

  // 2. Currency. A foreign-currency bill needs an exchange rate a fact does
  // not carry, so version 1 applies base-currency facts only.
  if (fact.currency !== baseCurrency) {
    reasons.push(
      `The prices are in ${fact.currency}, and automatic receiving handles ${baseCurrency} only for now: a foreign-currency bill needs an exchange rate that a fact does not carry.`,
    );
  } else if (supplier && supplier.currency !== fact.currency) {
    reasons.push(
      `The fact is in ${fact.currency}, but supplier "${supplier.name}" is set up to bill in ${supplier.currency}.`,
    );
  }

  // 3 and 4. Every line must be a known, active product, priced sanely.
  // Matching is by barcode only, NEVER by SKU: two businesses can use one SKU
  // for two different products.
  const lineOutcomes: LineOutcome[] = [];
  const planned: PlannedLine[] = [];
  fact.lines.forEach((line, index) => {
    const where = label(index, line.name);
    if (!line.gtin) {
      lineOutcomes.push({ lineIndex: index, status: 'NO_BARCODE' });
      reasons.push(`${where}: no barcode, so the product cannot be identified.`);
      return;
    }
    const variant = variantsByBarcode.get(line.gtin);
    if (!variant) {
      lineOutcomes.push({ lineIndex: index, status: 'UNKNOWN_BARCODE' });
      reasons.push(`${where}: no product has barcode ${line.gtin}. Create it from the shared listing, then retry.`);
      return;
    }
    if (!variant.isActive) {
      lineOutcomes.push({ lineIndex: index, status: 'INACTIVE_PRODUCT', variantId: variant.id });
      reasons.push(`${where}: the product with barcode ${line.gtin} is inactive.`);
      return;
    }

    const outcome: LineOutcome = { lineIndex: index, status: 'MATCHED', variantId: variant.id };
    if (variant.costPrice > 0) {
      outcome.priceDeltaPercent = Math.round(
        (Math.abs(line.unitPriceMinor - variant.costPrice) * 100) / variant.costPrice,
      );
      if (thresholdPercent > 0 && outcome.priceDeltaPercent > thresholdPercent) {
        const direction = line.unitPriceMinor > variant.costPrice ? 'above' : 'below';
        reasons.push(
          `${where}: price ${formatMoneyIn(line.unitPriceMinor, fact.currency)} is ${outcome.priceDeltaPercent}% ${direction} our current cost ${formatMoneyIn(variant.costPrice, fact.currency)} (review limit ${thresholdPercent}%).`,
        );
      }
    }
    lineOutcomes.push(outcome);
    planned.push({
      lineIndex: index,
      variantId: variant.id,
      name: line.name,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      taxMinor: line.taxMinor,
    });
  });

  // 5. The figures must fit the columns they will be written to.
  let subtotalMinor = 0;
  let taxMinor = 0;
  fact.lines.forEach((line, index) => {
    const lineTotal = line.quantity * line.unitPriceMinor;
    if (lineTotal > MAX_INT) reasons.push(`${label(index, line.name)}: the line total is too large to record.`);
    subtotalMinor += lineTotal;
    taxMinor += line.taxMinor;
  });
  const totalMinor = subtotalMinor + taxMinor;
  if (subtotalMinor > MAX_INT || totalMinor > MAX_INT) reasons.push('The fact total is too large to record.');

  if (reasons.length > 0 || !supplier) return { outcome: 'REVIEW', reasons, lineOutcomes };

  return { outcome: 'APPLY', reasons: [], supplier, lines: planned, lineOutcomes, subtotalMinor, taxMinor, totalMinor };
}
