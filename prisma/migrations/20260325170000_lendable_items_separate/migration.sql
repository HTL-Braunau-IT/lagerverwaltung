-- CreateTable
CREATE TABLE "LendableItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "storageRoomId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LendableItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LendableItemImage" (
    "id" TEXT NOT NULL,
    "lendableItemId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "altText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LendableItemImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LendableItem_name_idx" ON "LendableItem"("name");
CREATE INDEX "LendableItem_storageRoomId_idx" ON "LendableItem"("storageRoomId");
CREATE INDEX "LendableItem_isVisible_idx" ON "LendableItem"("isVisible");

-- CreateIndex
CREATE INDEX "LendableItemImage_lendableItemId_sortOrder_idx" ON "LendableItemImage"("lendableItemId", "sortOrder");

-- AlterTable
ALTER TABLE "LoanItem" ADD COLUMN "lendableItemId" TEXT;

-- Existing product-based lending data is intentionally discarded.
DELETE FROM "LoanReminderLog";
DELETE FROM "LoanItem";
DELETE FROM "Loan";

ALTER TABLE "LoanItem" DROP CONSTRAINT "LoanItem_productId_fkey";
DROP INDEX "LoanItem_productId_idx";
ALTER TABLE "LoanItem" DROP COLUMN "productId";

ALTER TABLE "LoanItem" ALTER COLUMN "lendableItemId" SET NOT NULL;
CREATE INDEX "LoanItem_lendableItemId_idx" ON "LoanItem"("lendableItemId");

-- AddForeignKey
ALTER TABLE "LendableItem" ADD CONSTRAINT "LendableItem_storageRoomId_fkey" FOREIGN KEY ("storageRoomId") REFERENCES "StorageRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LendableItemImage" ADD CONSTRAINT "LendableItemImage_lendableItemId_fkey" FOREIGN KEY ("lendableItemId") REFERENCES "LendableItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoanItem" ADD CONSTRAINT "LoanItem_lendableItemId_fkey" FOREIGN KEY ("lendableItemId") REFERENCES "LendableItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
