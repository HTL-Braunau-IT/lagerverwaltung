-- CreateTable
CREATE TABLE "OrderCounter" (
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL,

    CONSTRAINT "OrderCounter_pkey" PRIMARY KEY ("year")
);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "orderNumber" TEXT;
ALTER TABLE "Order" ADD COLUMN "userId" TEXT;

-- Backfill orderNumber for existing rows (if any)
WITH numbered_orders AS (
    SELECT
        o."id",
        EXTRACT(YEAR FROM o."createdAt")::int AS "orderYear",
        ROW_NUMBER() OVER (
            PARTITION BY EXTRACT(YEAR FROM o."createdAt")::int
            ORDER BY o."createdAt", o."id"
        ) AS "runningNumber"
    FROM "Order" o
)
UPDATE "Order" o
SET "orderNumber" = (no."orderYear"::text || LPAD(no."runningNumber"::text, 6, '0'))
FROM numbered_orders no
WHERE o."id" = no."id";

-- If there are existing orders, userId must be filled manually before applying NOT NULL.
ALTER TABLE "Order" ALTER COLUMN "orderNumber" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "userId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- DropIndex
DROP INDEX "Order_sessionId_idx";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "sessionId";

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
