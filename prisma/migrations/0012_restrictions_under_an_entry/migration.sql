-- AlterTable
ALTER TABLE "StandingRecord" ADD COLUMN "parentId" TEXT;

-- CreateIndex
CREATE INDEX "StandingRecord_parentId_idx" ON "StandingRecord"("parentId");

-- AddForeignKey
ALTER TABLE "StandingRecord" ADD CONSTRAINT "StandingRecord_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StandingRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
