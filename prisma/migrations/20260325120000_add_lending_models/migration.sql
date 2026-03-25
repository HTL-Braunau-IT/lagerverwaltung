-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "LoanReminderTrigger" AS ENUM ('DUE', 'OVERDUE', 'MANUAL');

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "teacherUserId" TEXT,
    "teacherExternalId" TEXT,
    "teacherDisplayName" TEXT,
    "teacherEmail" TEXT,
    "storageRoomId" TEXT NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanItem" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityRequested" DECIMAL(14,3) NOT NULL,
    "quantityApproved" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "quantityHandedOver" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "quantityReturned" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "borrowedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanReminderLog" (
    "id" TEXT NOT NULL,
    "loanItemId" TEXT NOT NULL,
    "trigger" "LoanReminderTrigger" NOT NULL,
    "sentForDate" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Loan_borrowerId_idx" ON "Loan"("borrowerId");
CREATE INDEX "Loan_storageRoomId_idx" ON "Loan"("storageRoomId");
CREATE INDEX "Loan_status_idx" ON "Loan"("status");
CREATE INDEX "Loan_createdAt_idx" ON "Loan"("createdAt");

-- CreateIndex
CREATE INDEX "LoanItem_loanId_idx" ON "LoanItem"("loanId");
CREATE INDEX "LoanItem_productId_idx" ON "LoanItem"("productId");
CREATE INDEX "LoanItem_dueAt_idx" ON "LoanItem"("dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoanReminderLog_loanItemId_trigger_sentForDate_key" ON "LoanReminderLog"("loanItemId", "trigger", "sentForDate");
CREATE INDEX "LoanReminderLog_loanItemId_sentAt_idx" ON "LoanReminderLog"("loanItemId", "sentAt");

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_teacherUserId_fkey" FOREIGN KEY ("teacherUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_storageRoomId_fkey" FOREIGN KEY ("storageRoomId") REFERENCES "StorageRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanItem" ADD CONSTRAINT "LoanItem_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanItem" ADD CONSTRAINT "LoanItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanReminderLog" ADD CONSTRAINT "LoanReminderLog_loanItemId_fkey" FOREIGN KEY ("loanItemId") REFERENCES "LoanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

