import { exportFilename } from '@/constants/downloads';
import { CsvImportCard } from '@/components/admin/csv-import-card';

/**
 * Bulk customer onboarding (admin-platform/72-fragmented-tool-consolidation-import.md
 * WO-72.4) — a spreadsheet or WhatsApp contact list, brought in without
 * hand-typing every row. Re-uploading the same file updates the same
 * customer instead of duplicating it, matched on phone or email exactly as
 * `CrmService.upsertContact` already matches any other new Contact write.
 */
export default function AdminContactsImportPage() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Import customers</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        Load an existing customer list. An existing phone or email updates that customer
        instead of creating a duplicate, so this is safe to run again on an updated file.
      </p>

      <CsvImportCard
        entityLabel="customers"
        templateUrl="/admin/crm/contacts/import/template"
        templateFilename={exportFilename('contacts-template')}
        importUrl="/admin/crm/contacts/import"
        keyLabel="Phone / email"
        notes={[
          { term: 'Phone or email required', detail: 'At least one of the two identifies the customer.' },
          { term: 'Phone or email is the key', detail: 'A match updates that customer instead of duplicating them.' },
          { term: 'Tags', detail: 'Separate several with a comma — vip,wholesale.' },
        ]}
      />
    </>
  );
}
