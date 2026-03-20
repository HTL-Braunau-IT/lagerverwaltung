/*
  Warnings:

  - You are about to drop the column `room` on the `StorageLocation` table. All the data in the column will be lost.
  - Added the required column `storageRoomId` to the `StorageLocation` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "StorageLocation" DROP COLUMN "room",
ADD COLUMN     "storageRoomId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "StorageRoom" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageRoom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StorageRoom_name_key" ON "StorageRoom"("name");

-- CreateIndex
CREATE INDEX "StorageLocation_storageRoomId_idx" ON "StorageLocation"("storageRoomId");

-- AddForeignKey
ALTER TABLE "StorageLocation" ADD CONSTRAINT "StorageLocation_storageRoomId_fkey" FOREIGN KEY ("storageRoomId") REFERENCES "StorageRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
