-- CreateTable
CREATE TABLE "OrderNumberCounter" (
    "year" INTEGER NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderNumberCounter_pkey" PRIMARY KEY ("year")
);
