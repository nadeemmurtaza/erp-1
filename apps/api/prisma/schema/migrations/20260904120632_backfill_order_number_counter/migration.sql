-- Backfill: OrderNumberCounter (added in 20260904101820_order_number_counter)
-- starts every year at 0, but this database may already hold real
-- YSN-YYYY-NNNN order numbers issued by the old MAX(Order.number)-read logic
-- that migration replaced. Without this, the first checkout after deploy
-- would try to reissue an already-used number and fail the unique
-- constraint. Skips anything that doesn't match the YYYY-NNNN shape (e.g.
-- seed data's YSN-DEMO-0001).
INSERT INTO "OrderNumberCounter" ("year", "counter")
SELECT SUBSTRING("number" FROM 'YSN-(\d+)-')::int AS year,
       MAX(SUBSTRING("number" FROM 'YSN-\d+-(\d+)')::int) AS counter
FROM "Order"
WHERE "number" ~ '^YSN-\d+-\d+$'
GROUP BY 1
ON CONFLICT ("year") DO UPDATE SET "counter" = GREATEST("OrderNumberCounter"."counter", EXCLUDED."counter");
