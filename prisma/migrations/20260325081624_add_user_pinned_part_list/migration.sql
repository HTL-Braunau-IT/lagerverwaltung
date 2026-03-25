-- CreateTable
CREATE TABLE "UserPinnedPartList" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partListId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPinnedPartList_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserPinnedPartList_userId_createdAt_idx" ON "UserPinnedPartList"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserPinnedPartList_partListId_idx" ON "UserPinnedPartList"("partListId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPinnedPartList_userId_partListId_key" ON "UserPinnedPartList"("userId", "partListId");

-- AddForeignKey
ALTER TABLE "UserPinnedPartList" ADD CONSTRAINT "UserPinnedPartList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPinnedPartList" ADD CONSTRAINT "UserPinnedPartList_partListId_fkey" FOREIGN KEY ("partListId") REFERENCES "PartList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
