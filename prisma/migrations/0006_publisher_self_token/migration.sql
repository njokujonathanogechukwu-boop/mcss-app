-- AlterTable
ALTER TABLE "Publisher" ADD COLUMN     "selfToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Publisher_selfToken_key" ON "Publisher"("selfToken");
