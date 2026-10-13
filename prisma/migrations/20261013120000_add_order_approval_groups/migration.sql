-- CreateEnum
CREATE TYPE "OrderApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "approvalDecidedAt" TIMESTAMP(3),
ADD COLUMN     "approvalDecidedById" TEXT,
ADD COLUMN     "approvalGroupId" TEXT,
ADD COLUMN     "approvalNote" TEXT,
ADD COLUMN     "approvalReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "approvalSnapshot" JSONB,
ADD COLUMN     "approvalStatus" "OrderApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "approvalGroupId" TEXT;

-- CreateTable
CREATE TABLE "ApprovalGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "approverId" TEXT NOT NULL,
    "deputyId" TEXT,
    "amountLimit" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalGroup_name_key" ON "ApprovalGroup"("name");

-- CreateIndex
CREATE INDEX "ApprovalGroup_approverId_idx" ON "ApprovalGroup"("approverId");

-- CreateIndex
CREATE INDEX "ApprovalGroup_deputyId_idx" ON "ApprovalGroup"("deputyId");

-- CreateIndex
CREATE INDEX "Order_approvalStatus_idx" ON "Order"("approvalStatus");

-- CreateIndex
CREATE INDEX "Order_approvalGroupId_idx" ON "Order"("approvalGroupId");

-- CreateIndex
CREATE INDEX "User_approvalGroupId_idx" ON "User"("approvalGroupId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_approvalGroupId_fkey" FOREIGN KEY ("approvalGroupId") REFERENCES "ApprovalGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_approvalDecidedById_fkey" FOREIGN KEY ("approvalDecidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalGroup" ADD CONSTRAINT "ApprovalGroup_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalGroup" ADD CONSTRAINT "ApprovalGroup_deputyId_fkey" FOREIGN KEY ("deputyId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_approvalGroupId_fkey" FOREIGN KEY ("approvalGroupId") REFERENCES "ApprovalGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

