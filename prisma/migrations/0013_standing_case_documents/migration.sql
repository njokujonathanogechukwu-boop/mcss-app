-- CreateTable
CREATE TABLE "StandingDocument" (
    "id" TEXT NOT NULL,
    "standingRecordId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StandingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StandingDocument_standingRecordId_idx" ON "StandingDocument"("standingRecordId");

-- AddForeignKey
ALTER TABLE "StandingDocument" ADD CONSTRAINT "StandingDocument_standingRecordId_fkey" FOREIGN KEY ("standingRecordId") REFERENCES "StandingRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingDocument" ADD CONSTRAINT "StandingDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
