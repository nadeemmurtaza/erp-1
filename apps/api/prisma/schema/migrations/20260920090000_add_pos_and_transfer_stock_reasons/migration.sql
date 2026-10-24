-- Four StockMovementReason values the schema has carried since WO-21.x/WO-22.1
-- without a migration. Prisma generates its client from the schema rather than
-- the database, so every one of them typechecked, linted and reached the client
-- — and then failed at runtime on the INSERT, because Postgres had never been
-- told the value exists.
--
-- They live in their own migration on purpose: `ALTER TYPE ... ADD VALUE` may
-- not be USED in the transaction that adds it, so keeping these apart from the
-- tables and columns that reference them removes the question entirely.
--
-- POS_SALE is deliberately distinct from SALE (RETAIL-ERP.md R11): a ledger
-- read can then tell a till sale from a web sale without joining Order.

-- AlterEnum
ALTER TYPE "StockMovementReason" ADD VALUE 'POS_SALE';
ALTER TYPE "StockMovementReason" ADD VALUE 'POS_OFFLINE_VARIANCE';
ALTER TYPE "StockMovementReason" ADD VALUE 'TRANSFER_OUT';
ALTER TYPE "StockMovementReason" ADD VALUE 'TRANSFER_IN';
