import { PrismaClient } from '../src/generated/prisma';
import { syncOptionModel } from '../src/modules/merchandising/catalog/sync-option-model';

/**
 * WO-3.1 (03-variants-sku-seo.md, Blocker B2) — one-shot CLI entry point
 * (`pnpm db:backfill-options`) for `syncOptionModel`, whose real
 * implementation now lives in src/modules/merchandising/catalog/sync-option-model.ts so
 * product-admin.service.ts can call the identical function inside a live
 * request's transaction (WO-3.2's dual-write) without importing across the
 * src/prisma build boundary (apps/api/tsconfig.json's rootDir is `./src`).
 */
export { syncOptionModel as backfillProductOptions };

if (require.main === module) {
  const prisma = new PrismaClient();
  syncOptionModel(prisma)
    .then((result) => {
      console.warn(`Backfilled ${result.productsTouched} products, ${result.variantsTouched} variants.`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
