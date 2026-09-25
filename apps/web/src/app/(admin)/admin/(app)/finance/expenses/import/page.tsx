import { exportFilename } from '@/constants/downloads';
import { CsvImportCard } from '@/components/admin/csv-import-card';

/**
 * Bulk expense onboarding (admin-platform/72-fragmented-tool-consolidation-import.md
 * WO-72.4) — a paper expense log's transcription target. Every row is
 * created fresh through `FinanceService.createExpense()`'s own existing
 * category/GL rules: an expense has no natural business key to upsert
 * against, so a re-imported file always creates a second batch of rows,
 * never silently merges into the first.
 */
export default function AdminExpensesImportPage() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Import expenses</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        Load a spreadsheet or paper expense log. Every row always creates a new expense —
        an expense has no natural key to match against, so re-running the same file adds
        it again rather than updating anything.
      </p>

      <CsvImportCard
        entityLabel="expenses"
        templateUrl="/admin/finance/expenses/import/template"
        templateFilename={exportFilename('expenses-template')}
        importUrl="/admin/finance/expenses/import"
        keyLabel="Description"
        notes={[
          { term: 'Amounts in rupees', detail: 'Write 500, not 50000. Commas are fine.' },
          { term: 'Category must already exist', detail: 'Create it first under Expenses → Categories.' },
          { term: 'No upsert key', detail: 'Re-importing the same file records the same expenses again.' },
        ]}
      />
    </>
  );
}
