import type { AccountType } from '../../core/prisma/client';

/**
 * The minimal chart of accounts the posting rules (WO-19.2) resolve an
 * `accountId` from by a stable `code` — seeded once (`prisma/seed.ts`) and
 * never hand-typed anywhere else. Only the accounts a sale, a receipt or a
 * refund actually touches today; a fuller chart (AP, a second bank account,
 * cost centres) is additive and belongs to whichever later work order needs
 * it (purchasing, payroll, multi-currency).
 */
export const CHART_OF_ACCOUNTS: ReadonlyArray<{
  code: string;
  name: string;
  type: AccountType;
  isBank?: boolean;
  isControl?: boolean;
}> = [
  { code: '1000', name: 'Cash & Bank', type: 'ASSET', isBank: true },
  { code: '1100', name: 'Accounts Receivable', type: 'ASSET', isControl: true },
  { code: '1200', name: 'Inventory', type: 'ASSET' },
  { code: '2100', name: 'Tax Payable', type: 'LIABILITY' },
  { code: '2200', name: 'Accounts Payable', type: 'LIABILITY', isControl: true },
  { code: '4000', name: 'Sales Revenue', type: 'INCOME' },
  { code: '4900', name: 'Realised FX Gain', type: 'INCOME' },
  { code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE' },
  { code: '5900', name: 'Realised FX Loss', type: 'EXPENSE' },
];

/** The codes above, named — so a posting rule never hand-types a magic string. */
export const ACCOUNT_CODE = {
  CASH_AND_BANK: '1000',
  ACCOUNTS_RECEIVABLE: '1100',
  INVENTORY: '1200',
  TAX_PAYABLE: '2100',
  ACCOUNTS_PAYABLE: '2200',
  SALES_REVENUE: '4000',
  FX_GAIN: '4900',
  COGS: '5000',
  FX_LOSS: '5900',
} as const;
