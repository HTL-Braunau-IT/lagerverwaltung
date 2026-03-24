-- AlterTable
ALTER TABLE "PartList" ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isVisible" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "PartListDocument" (
    "id" TEXT NOT NULL,
    "partListId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartListDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartListDocument_partListId_createdAt_idx" ON "PartListDocument"("partListId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartListDocument_partListId_fileName_key" ON "PartListDocument"("partListId", "fileName");

-- AddForeignKey
ALTER TABLE "PartListDocument" ADD CONSTRAINT "PartListDocument_partListId_fkey" FOREIGN KEY ("partListId") REFERENCES "PartList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
