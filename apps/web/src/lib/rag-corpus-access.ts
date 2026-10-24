import type { PermissionKey } from '@/constants/permissions';
import type { DocumentCorpus } from '@/types/api';

/**
 * Mirrors the API's own `apps/api/src/modules/system/rag/rag-corpus-access.ts`
 * (H1, security review). The server is still what enforces this — this is
 * only so the corpus dropdowns here never OFFER, and so never tempt someone
 * into picking, a corpus their own session cannot actually reach (a STAFF
 * account with no `payroll.view` should not see `EMPLOYEE_DOCUMENTS` as an
 * option in the first place, even though the real 403 would come from the
 * API either way).
 */
const CORPUS_PERMISSION: Record<DocumentCorpus, PermissionKey | null> = {
  EMPLOYEE_DOCUMENTS: 'payroll.view',
  BUSINESS_DOCUMENTS: 'accounting.view',
  SUPPLIER_CATALOG: 'suppliers.manage',
  KNOWLEDGE_BASE: null,
};

/** Filters a list of corpus options down to the ones `can` may reach — the same convention `reports/page.tsx` already uses for filtering an options list by permission. */
export function visibleCorpora(corpora: readonly DocumentCorpus[], can: (key: PermissionKey) => boolean): DocumentCorpus[] {
  return corpora.filter((corpus) => {
    const required = CORPUS_PERMISSION[corpus];
    return !required || can(required);
  });
}
