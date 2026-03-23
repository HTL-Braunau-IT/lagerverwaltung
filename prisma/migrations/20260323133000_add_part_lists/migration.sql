-- AlterTable
ALTER TABLE "Order" ADD COLUMN "sourcePartListId" TEXT;

-- CreateTable
CREATE TABLE "PartList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartListItem" (
    "id" TEXT NOT NULL,
    "partListId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartList_name_key" ON "PartList"("name");
CREATE INDEX "PartList_createdAt_idx" ON "PartList"("createdAt");
CREATE UNIQUE INDEX "PartListItem_partListId_productId_key" ON "PartListItem"("partListId", "productId");
CREATE INDEX "PartListItem_productId_idx" ON "PartListItem"("productId");
CREATE INDEX "Order_sourcePartListId_idx" ON "Order"("sourcePartListId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_sourcePartListId_fkey" FOREIGN KEY ("sourcePartListId") REFERENCES "PartList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartListItem" ADD CONSTRAINT "PartListItem_partListId_fkey" FOREIGN KEY ("partListId") REFERENCES "PartList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartListItem" ADD CONSTRAINT "PartListItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
