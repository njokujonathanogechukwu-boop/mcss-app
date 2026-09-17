-- AlterTable
ALTER TABLE "ServiceGroup" ADD COLUMN "reportToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ServiceGroup_reportToken_key" ON "ServiceGroup"("reportToken");
