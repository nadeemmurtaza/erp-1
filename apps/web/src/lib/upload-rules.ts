import { IMPORT_ROW_CAP, formatNumber } from '@newax/shared';
import type { UploadRules } from '@/lib/upload';

/**
 * The limits each upload route really enforces, copied from the API with the
 * line each came from, never guessed (UPL-3: the same limits the server uses, so
 * a file it would refuse never starts). The server checks again; these are a
 * convenience for the person dropping the file, not authorization.
 *
 * Kept in one place so the number a screen prints and the number its checks use
 * are the same value, and so a change on the API side is a one-file change here.
 * They would belong in `@newax/shared`, beside `IMPORT_ROW_CAP`, so the API and
 * the web read one constant; until then each carries its source.
 */

/**
 * `StorageService.MAX_IMAGE_BYTES`, 8 MB (apps/api/src/core/storage/storage.service.ts:10). It caps
 * both `putImage` (:58) and `putDocument` (:114), and a receipt or a PDF gets no larger allowance.
 */
const MAX_STORED_BYTES = 8 * 1024 * 1024;

/**
 * An image the API converts and stores: product photographs
 * (`ProductAdminService.addImage`, product-admin.service.ts:415), a stitching
 * stage photo (`StitchingJobsService.changeStage`, jobs.service.ts:347) and a
 * visual-search photo (`SearchService.searchByImage`, search.service.ts:270) all
 * go through `StorageService.putImage`: JPEG, PNG, WebP or AVIF
 * (`ALLOWED_IMAGE_TYPES`, storage.service.ts:11-16, checked at :53), up to 8 MB (:58).
 */
export const IMAGE_UPLOAD_RULES: UploadRules = {
  accept: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  maxBytes: MAX_STORED_BYTES,
};

/**
 * A receipt (`FinanceService.attachReceipt`, finance.service.ts:307) goes through
 * `StorageService.putDocument`: the four image types or a PDF
 * (`ALLOWED_DOCUMENT_TYPES`, storage.service.ts:18, checked at :109), up to 8 MB (:114).
 */
export const RECEIPT_UPLOAD_RULES: UploadRules = {
  accept: [...IMAGE_UPLOAD_RULES.accept, 'application/pdf'],
  maxBytes: MAX_STORED_BYTES,
  maxFiles: 1,
};

/**
 * A document for the knowledge base (`RagCorpusService.createSource` and
 * `replaceFile`, rag-corpus.service.ts:59 and :216): `application/pdf` only
 * (`ALLOWED_TYPE`, :13), stored by `putDocument`, so up to 8 MB (storage.service.ts:114).
 */
export const PDF_UPLOAD_RULES: UploadRules = {
  accept: ['application/pdf'],
  maxBytes: MAX_STORED_BYTES,
  maxFiles: 1,
};

/**
 * A CSV import. The API sets no byte limit on these routes: `FileInterceptor('file')`
 * is given no `limits` (catalog-admin.controller.ts:328 and :345, crm.controller.ts:225,
 * finance.controller.ts:176), so multer's default is none, and nothing in `ProductImportService`
 * or the contact and expense importers reads a size. What is enforced is rows, not bytes
 * (`IMPORT_ROW_CAP`, 5 000: product-import.service.ts:219, contact-import.service.ts:131, expense-import.service.ts:125), and only after the file is parsed,
 * so it is told to the reader (`CSV_IMPORT_HINT`) and not checked at drop time. No size is invented here.
 */
export const CSV_IMPORT_RULES: UploadRules = {
  accept: ['.csv', 'text/csv'],
  maxBytes: Number.POSITIVE_INFINITY,
  maxFiles: 1,
};

/** The one limit a CSV import has, printed with the zone's own limits: "Up to 5,000 rows". */
export const CSV_IMPORT_HINT = `Up to ${formatNumber(IMPORT_ROW_CAP)} rows`;
