import { ForbiddenException } from '@nestjs/common';
import type { DocumentCorpus } from '../../../core/prisma/client';

/**
 * Security review (WO-35 H1): `rag.query`/`rag.ingest.manage` alone say
 * nothing about WHICH corpus a caller may reach — STAFF holds both
 * (`packages/shared/src/permissions.ts`'s own `ROLE_PERMISSION_SEED`) but
 * has neither `payroll.view` nor `accounting.view`, so without this map
 * STAFF could read/upload/delete `EMPLOYEE_DOCUMENTS`/`BUSINESS_DOCUMENTS`
 * sources verbatim. This is the actual restriction; the base `rag.*` grants
 * stay unchanged (STAFF keeps both) because the map, not the base
 * permission, is what narrows a real STAFF user's reach.
 *
 * `EMPLOYEE_DOCUMENTS` reuses `payroll.view` rather than a dedicated
 * `hr.documents.view` permission: doc 28's own HR-document vault
 * (`docs/implementation/hr-people-org/28-recruitment-onboarding-document-vault.md`,
 * this corpus's naming source) is unbuilt in this codebase — no
 * `EmployeeDocument` model exists — and inventing a permission key for a
 * source that does not exist yet would be speculative
 * (CLAUDE.md's own "No speculative functionality"). `payroll.view` is the
 * closest already-real permission gating employee-confidential content
 * today; when doc 28 ships its own vault, its own work order is what
 * introduces (and migrates this map to) a dedicated key, not this one.
 */
const CORPUS_PERMISSION: Record<DocumentCorpus, string | null> = {
  EMPLOYEE_DOCUMENTS: 'payroll.view',
  BUSINESS_DOCUMENTS: 'accounting.view',
  SUPPLIER_CATALOG: 'suppliers.manage',
  // Curated for customer-facing answers (WO-9.7) — open to any rag.query/rag.ingest.manage holder.
  KNOWLEDGE_BASE: null,
};

/**
 * Throws when `permissions` may not reach `corpus` — the single-item check
 * (a specific `DocumentSource` already loaded, or a corpus named directly in
 * a query/upload). Never use this to filter a list; see `visibleCorpora()`.
 */
export function assertCorpusAccess(permissions: readonly string[], corpus: DocumentCorpus): void {
  const required = CORPUS_PERMISSION[corpus];
  if (required && !permissions.includes(required)) {
    throw new ForbiddenException(`You don't have access to the ${corpus} corpus.`);
  }
}

/** Corpora `permissions` may see at all — for filtering a list, never for a single-item check (use `assertCorpusAccess` there). */
export function visibleCorpora(permissions: readonly string[]): DocumentCorpus[] {
  return (Object.keys(CORPUS_PERMISSION) as DocumentCorpus[]).filter((corpus) => {
    const required = CORPUS_PERMISSION[corpus];
    return !required || permissions.includes(required);
  });
}
