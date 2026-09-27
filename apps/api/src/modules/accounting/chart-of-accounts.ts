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
  /** R17 — this account's balance participates in intercompany elimination (ConsolidationService, WO-20.6/22.3). Never set on an ordinary account. */
  isIntercompany?: boolean;
}> = [
  { code: '1000', name: 'Cash & Bank', type: 'ASSET', isBank: true },
  { code: '1100', name: 'Accounts Receivable', type: 'ASSET', isControl: true },
  { code: '1200', name: 'Inventory', type: 'ASSET' },
  { code: '2100', name: 'Tax Payable', type: 'LIABILITY' },
  { code: '2200', name: 'Accounts Payable', type: 'LIABILITY', isControl: true },
  { code: '3000', name: 'Retained Earnings', type: 'EQUITY', isControl: true },
  { code: '4000', name: 'Sales Revenue', type: 'INCOME' },
  { code: '4100', name: 'Intercompany Revenue', type: 'INCOME', isIntercompany: true },
  { code: '4900', name: 'Realised FX Gain', type: 'INCOME' },
  { code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE' },
  { code: '5050', name: 'Intercompany Cost of Goods', type: 'EXPENSE', isIntercompany: true },
  { code: '5100', name: 'Inventory Shrinkage', type: 'EXPENSE' },
  // WO-23.1: the two accounts finance's posting rule (onExpenseRecorded)
  // resolves by ExpenseCategory.isDirect — packaging/courier/gateway fees
  // scale with orders and sit above the gross-profit line with COGS;
  // everything else (rent, salaries, marketing, ...) sits below it.
  { code: '5150', name: 'Direct Expenses', type: 'EXPENSE' },
  { code: '5200', name: 'Operating Expenses', type: 'EXPENSE' },
  { code: '5900', name: 'Realised FX Loss', type: 'EXPENSE' },
  // Payroll (docs/implementation/payroll/19-payroll.md WO-19.4) — the payroll
  // additions this file's own comment above already named as coming.
  { code: '1300', name: 'Employee Advances', type: 'ASSET' },
  { code: '2300', name: 'Salaries Payable', type: 'LIABILITY' },
  { code: '5300', name: 'Salaries & Wages Expense', type: 'EXPENSE' },
  // Wallet (doc 155, WO-155.2 — module ships off by default, see
  // DECISIONS.md) — what Newax owes a customer for store credit not yet
  // redeemed, the identical treatment any gift-card issuer uses. Never
  // recognised as income at PURCHASE; converts to SALES_REVENUE only as
  // credit is actually REDEEMed (posting-rules.subscriber.ts, once written).
  { code: '2400', name: 'Deferred Revenue — Wallet Credit', type: 'LIABILITY' },
  // Receivables (145-receivables-credit-limits-dunning.md, WO-145.2) — the
  // two accounts a CreditNote/DebitNote need that this chart lacked, named
  // by that doc's own "Every column or none" lens.
  { code: '4200', name: 'Sales Returns & Allowances', type: 'INCOME' },
  { code: '5400', name: 'Purchase Returns & Allowances', type: 'EXPENSE' },
  // Fixed-asset depreciation (finance-accounting/147-fixed-asset-depreciation.md
  // WO-147.1). This chart carries no gross "Fixed Assets" account — doc 79's
  // Asset never posts at acquisition — so AccumulatedDepreciation is the only
  // asset-side account this document needs, netting to a credit balance
  // within its own ASSET type exactly as this flat five-type chart already
  // handles every other contra case.
  { code: '1400', name: 'Accumulated Depreciation', type: 'ASSET' },
  { code: '5500', name: 'Depreciation Expense', type: 'EXPENSE' },
  // Disposal (WO-147.4). This chart has no gross "Fixed Assets" debit
  // account (acquisition cost is never itself posted, per the comment
  // above), so a disposal cannot "remove cost, remove accumulated
  // depreciation" the textbook way. Instead it writes off whatever book
  // value remains as a final loss (bringing AccumulatedDepreciation up to
  // the full acquisition cost, exactly as a monthly posting would have,
  // eventually) and recognises any sale proceeds as a separate gain — two
  // accounts, never one signed account, the same INCOME/EXPENSE split this
  // chart already uses for Realised FX Gain (4900) / Realised FX Loss (5900).
  { code: '4300', name: 'Gain on Asset Disposal', type: 'INCOME' },
  { code: '5600', name: 'Loss on Asset Disposal', type: 'EXPENSE' },
  // Settlement reconciliation (finance-accounting/
  // 49-financial-institution-settlement-partnerships.md WO-49.4). The
  // Payment side already debited Cash & Bank in full when the payment
  // succeeded (onPaymentSucceeded); a bank's SHORT settlement means less of
  // that actually arrived, so the write-off credits Cash & Bank back down
  // by the shortfall and recognises the loss — no new asset account needed.
  { code: '5700', name: 'Settlement Shortfall Expense', type: 'EXPENSE' },
  // Bank facility management (finance-accounting/167-bank-facility-
  // management.md WO-167.2). A drawdown is the business's own borrowing,
  // not revenue or a customer balance — a new liability distinct from
  // Accounts Payable (2200, a trade payable) and Salaries Payable (2300,
  // an employee obligation). Markup accrues into its own payable rather
  // than posting straight to expense at drawdown time, so a repayment can
  // clear accrued markup separately from principal — the same accrual
  // shape AccumulatedDepreciation/DepreciationExpense already establishes
  // for a different periodic liability.
  { code: '2500', name: 'Bank Loan Payable', type: 'LIABILITY' },
  { code: '2600', name: 'Accrued Markup Payable', type: 'LIABILITY' },
  { code: '5800', name: 'Markup Expense', type: 'EXPENSE' },
];

/** The codes above, named — so a posting rule never hand-types a magic string. */
export const ACCOUNT_CODE = {
  CASH_AND_BANK: '1000',
  ACCOUNTS_RECEIVABLE: '1100',
  INVENTORY: '1200',
  TAX_PAYABLE: '2100',
  ACCOUNTS_PAYABLE: '2200',
  RETAINED_EARNINGS: '3000',
  SALES_REVENUE: '4000',
  INTERCOMPANY_REVENUE: '4100',
  FX_GAIN: '4900',
  COGS: '5000',
  INTERCOMPANY_COGS: '5050',
  INVENTORY_SHRINKAGE: '5100',
  DIRECT_EXPENSES: '5150',
  OPERATING_EXPENSES: '5200',
  FX_LOSS: '5900',
  EMPLOYEE_ADVANCES: '1300',
  SALARIES_PAYABLE: '2300',
  SALARIES_WAGES_EXPENSE: '5300',
  DEFERRED_REVENUE_WALLET: '2400',
  SALES_RETURNS: '4200',
  PURCHASE_RETURNS: '5400',
  ACCUMULATED_DEPRECIATION: '1400',
  DEPRECIATION_EXPENSE: '5500',
  GAIN_ON_DISPOSAL: '4300',
  LOSS_ON_DISPOSAL: '5600',
  SETTLEMENT_SHORTFALL_EXPENSE: '5700',
  BANK_LOAN_PAYABLE: '2500',
  ACCRUED_MARKUP_PAYABLE: '2600',
  MARKUP_EXPENSE: '5800',
} as const;
