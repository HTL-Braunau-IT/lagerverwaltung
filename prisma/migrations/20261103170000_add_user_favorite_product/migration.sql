-- Per-user favourite ("star") products (#87).
CREATE TABLE "UserFavoriteProduct" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserFavoriteProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserFavoriteProduct_userId_productId_key" ON "UserFavoriteProduct"("userId", "productId");
CREATE INDEX "UserFavoriteProduct_userId_createdAt_idx" ON "UserFavoriteProduct"("userId", "createdAt");
CREATE INDEX "UserFavoriteProduct_productId_idx" ON "UserFavoriteProduct"("productId");

ALTER TABLE "UserFavoriteProduct" ADD CONSTRAINT "UserFavoriteProduct_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserFavoriteProduct" ADD CONSTRAINT "UserFavoriteProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
