-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "azureAdObjectId" TEXT;

-- CreateTable
CREATE TABLE "OrderRequest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherUserId" TEXT,
    "teacherExternalId" TEXT NOT NULL,
    "teacherDisplayName" TEXT NOT NULL,
    "teacherEmail" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "approvedOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderRequestItem" (
    "id" TEXT NOT NULL,
    "orderRequestId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_azureAdObjectId_key" ON "User"("azureAdObjectId");
CREATE UNIQUE INDEX "OrderRequest_approvedOrderId_key" ON "OrderRequest"("approvedOrderId");
CREATE INDEX "OrderRequest_studentId_idx" ON "OrderRequest"("studentId");
CREATE INDEX "OrderRequest_teacherUserId_idx" ON "OrderRequest"("teacherUserId");
CREATE INDEX "OrderRequest_teacherExternalId_idx" ON "OrderRequest"("teacherExternalId");
CREATE INDEX "OrderRequest_status_idx" ON "OrderRequest"("status");
CREATE INDEX "OrderRequest_createdAt_idx" ON "OrderRequest"("createdAt");
CREATE INDEX "OrderRequestItem_orderRequestId_idx" ON "OrderRequestItem"("orderRequestId");
CREATE INDEX "OrderRequestItem_productId_idx" ON "OrderRequestItem"("productId");
CREATE UNIQUE INDEX "OrderRequestItem_orderRequestId_productId_key" ON "OrderRequestItem"("orderRequestId", "productId");

-- AddForeignKey
ALTER TABLE "OrderRequest" ADD CONSTRAINT "OrderRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderRequest" ADD CONSTRAINT "OrderRequest_teacherUserId_fkey" FOREIGN KEY ("teacherUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderRequest" ADD CONSTRAINT "OrderRequest_approvedOrderId_fkey" FOREIGN KEY ("approvedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderRequestItem" ADD CONSTRAINT "OrderRequestItem_orderRequestId_fkey" FOREIGN KEY ("orderRequestId") REFERENCES "OrderRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderRequestItem" ADD CONSTRAINT "OrderRequestItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
