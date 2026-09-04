-- CreateTable
CREATE TABLE "StitchingOrderNumberCounter" (
    "year" INTEGER NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StitchingOrderNumberCounter_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "StitchingJobNumberCounter" (
    "year" INTEGER NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StitchingJobNumberCounter_pkey" PRIMARY KEY ("year")
);

-- Backfill: the counter starts at 0, but real STO-YYYY-NNNN / JOB-YYYY-NNNN
-- numbers may already exist (issued by the old MAX(number)-read logic this
-- migration replaces). Without this, the first allocation after deploy would
-- collide with the highest number already in use and fail the unique
-- constraint on the very next booking. Skips anything that doesn't match the
-- YYYY-NNNN shape (e.g. seed data's STO-DEMO-0001 / JOB-DEMO-0001).
INSERT INTO "StitchingOrderNumberCounter" ("year", "counter")
SELECT SUBSTRING("number" FROM 'STO-(\d+)-')::int AS year,
       MAX(SUBSTRING("number" FROM 'STO-\d+-(\d+)')::int) AS counter
FROM "StitchingOrder"
WHERE "number" ~ '^STO-\d+-\d+$'
GROUP BY 1
ON CONFLICT ("year") DO UPDATE SET "counter" = GREATEST("StitchingOrderNumberCounter"."counter", EXCLUDED."counter");

INSERT INTO "StitchingJobNumberCounter" ("year", "counter")
SELECT SUBSTRING("number" FROM 'JOB-(\d+)-')::int AS year,
       MAX(SUBSTRING("number" FROM 'JOB-\d+-(\d+)')::int) AS counter
FROM "StitchingJob"
WHERE "number" ~ '^JOB-\d+-\d+$'
GROUP BY 1
ON CONFLICT ("year") DO UPDATE SET "counter" = GREATEST("StitchingJobNumberCounter"."counter", EXCLUDED."counter");
