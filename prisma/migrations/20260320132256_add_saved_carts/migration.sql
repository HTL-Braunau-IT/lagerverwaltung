-- CreateTable
CREATE TABLE "SavedCart" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedCart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedCartItem" (
    "id" TEXT NOT NULL,
    "savedCartId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedCartItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedCart_userId_idx" ON "SavedCart"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedCart_userId_name_key" ON "SavedCart"("userId", "name");

-- CreateIndex
CREATE INDEX "SavedCartItem_productId_idx" ON "SavedCartItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedCartItem_savedCartId_productId_key" ON "SavedCartItem"("savedCartId", "productId");

-- AddForeignKey
ALTER TABLE "SavedCart" ADD CONSTRAINT "SavedCart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedCartItem" ADD CONSTRAINT "SavedCartItem_savedCartId_fkey" FOREIGN KEY ("savedCartId") REFERENCES "SavedCart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedCartItem" ADD CONSTRAINT "SavedCartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
