ALTER TABLE "CostCenter" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "CostCenter_isActive_idx" ON "CostCenter"("isActive");
