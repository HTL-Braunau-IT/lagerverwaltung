-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN "sourcePartListId" TEXT;

-- DropIndex
DROP INDEX "CartItem_cartId_productId_key";

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_productId_sourcePartListId_key" ON "CartItem"("cartId", "productId", "sourcePartListId");
CREATE INDEX "CartItem_sourcePartListId_idx" ON "CartItem"("sourcePartListId");

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_sourcePartListId_fkey" FOREIGN KEY ("sourcePartListId") REFERENCES "PartList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
