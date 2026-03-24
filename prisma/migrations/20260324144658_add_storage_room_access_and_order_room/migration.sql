-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "storageRoomId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hasAllStorageRoomAccess" BOOLEAN NOT NULL DEFAULT false;

-- Existing admins keep full backend visibility by default
UPDATE "User"
SET "hasAllStorageRoomAccess" = true
WHERE "role" = 'ADMIN';

-- CreateTable
CREATE TABLE "UserStorageRoomAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storageRoomId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserStorageRoomAccess_pkey" PRIMARY KEY ("id")
);

-- Create fallback room for legacy orders without a room mapping
INSERT INTO "StorageRoom" ("id", "name", "createdAt", "updatedAt")
VALUES ('legacy-storage-room', 'Legacy ohne Lagerraum', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Backfill room from order items/products where possible
WITH "OrderRoomCandidates" AS (
    SELECT
        oi."orderId" AS "orderId",
        MIN(sr."id") AS "storageRoomId"
    FROM "OrderItem" oi
    INNER JOIN "Product" p ON p."id" = oi."productId"
    INNER JOIN "StorageLocation" sl ON sl."id" = p."storageLocationId"
    INNER JOIN "StorageRoom" sr ON sr."id" = sl."storageRoomId"
    GROUP BY oi."orderId"
)
UPDATE "Order" o
SET "storageRoomId" = c."storageRoomId"
FROM "OrderRoomCandidates" c
WHERE o."id" = c."orderId"
  AND o."storageRoomId" IS NULL;

-- Any remaining legacy rows use fallback room
UPDATE "Order"
SET "storageRoomId" = (
    SELECT "id"
    FROM "StorageRoom"
    WHERE "name" = 'Legacy ohne Lagerraum'
    LIMIT 1
)
WHERE "storageRoomId" IS NULL;

ALTER TABLE "Order" ALTER COLUMN "storageRoomId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "UserStorageRoomAccess_storageRoomId_idx" ON "UserStorageRoomAccess"("storageRoomId");

-- CreateIndex
CREATE UNIQUE INDEX "UserStorageRoomAccess_userId_storageRoomId_key" ON "UserStorageRoomAccess"("userId", "storageRoomId");

-- CreateIndex
CREATE INDEX "Order_storageRoomId_idx" ON "Order"("storageRoomId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_storageRoomId_fkey" FOREIGN KEY ("storageRoomId") REFERENCES "StorageRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStorageRoomAccess" ADD CONSTRAINT "UserStorageRoomAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStorageRoomAccess" ADD CONSTRAINT "UserStorageRoomAccess_storageRoomId_fkey" FOREIGN KEY ("storageRoomId") REFERENCES "StorageRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
