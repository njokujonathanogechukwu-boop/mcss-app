-- CreateTable
CREATE TABLE "AuxiliaryPioneer" (
    "id" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "startMonth" INTEGER NOT NULL,
    "months" INTEGER,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "announcedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuxiliaryPioneer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuxiliaryPioneer_publisherId_idx" ON "AuxiliaryPioneer"("publisherId");

-- CreateIndex
CREATE INDEX "AuxiliaryPioneer_startYear_startMonth_idx" ON "AuxiliaryPioneer"("startYear", "startMonth");

-- AddForeignKey
ALTER TABLE "AuxiliaryPioneer" ADD CONSTRAINT "AuxiliaryPioneer_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
