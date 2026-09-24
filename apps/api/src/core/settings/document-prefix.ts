import { BRAND } from '@newax/shared';
import { SettingKey, type DocumentPrefixes, type DocumentSettings } from './settings.defaults';
import type { SettingsService } from './settings.service';

/**
 * What this shop's documents are numbered with.
 *
 * Six services each held their own literal — `YSN-`, `PO-`, `GRN-`, `STO-`,
 * `JOB-`, `SC-` — and one of them was the client's initials, which is a brand
 * value sitting in a number generator where no search for the client's name
 * would ever find it. They read the Setting now, so a shop that already
 * numbers its paperwork a particular way can match it without a deploy.
 *
 * Falls back to the shipped default for any prefix the stored row is missing,
 * so a half-written Setting cannot produce `undefined-2026-0001`.
 */
export async function documentPrefix(
  settings: SettingsService,
  kind: keyof DocumentPrefixes,
): Promise<string> {
  const stored = await settings.get<DocumentSettings>(SettingKey.Documents);
  const prefix = stored?.prefixes?.[kind];
  return typeof prefix === 'string' && prefix.trim() ? prefix.trim() : FALLBACK[kind];
}

/**
 * The shipped values, repeated here rather than imported from DEFAULT_SETTINGS
 * to keep this usable when the Setting row has never been written — the seed
 * writes it, but a fresh database mid-migration has not.
 */
const FALLBACK: DocumentPrefixes = {
  order: BRAND.commerce.orderNumberPrefix,
  purchaseOrder: 'PO',
  goodsReceipt: 'GRN',
  stitchingOrder: 'STO',
  stitchingJob: 'JOB',
  stockCount: 'SC',
  journalEntry: 'JE',
  invoice: 'INV',
  quote: 'QTE',
  stockTransfer: 'TRF',
  interBranchInvoice: 'IBI',
  productionRun: 'PR',
  payRun: 'PAY',
  returnRequest: 'RMA',
  manifest: 'MFT',
};
