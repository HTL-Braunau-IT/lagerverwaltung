-- CreateTable
CREATE TABLE "ProductStockBooking" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quantityDelta" DECIMAL(14,3) NOT NULL,
    "supplier" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductStockBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductStockBooking_productId_idx" ON "ProductStockBooking"("productId");

-- CreateIndex
CREATE INDEX "ProductStockBooking_userId_idx" ON "ProductStockBooking"("userId");

-- CreateIndex
CREATE INDEX "ProductStockBooking_createdAt_idx" ON "ProductStockBooking"("createdAt");

-- AddForeignKey
ALTER TABLE "ProductStockBooking" ADD CONSTRAINT "ProductStockBooking_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStockBooking" ADD CONSTRAINT "ProductStockBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
