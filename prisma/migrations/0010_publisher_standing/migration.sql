-- AlterEnum
ALTER TYPE "PublisherStatus" ADD VALUE 'DISFELLOWSHIPPED';
ALTER TYPE "PublisherStatus" ADD VALUE 'DISASSOCIATED';

-- CreateEnum
CREATE TYPE "StandingKind" AS ENUM ('REPROVED', 'DISFELLOWSHIPPED', 'DISASSOCIATED', 'REINSTATED', 'RESTRICTION');

-- CreateTable
CREATE TABLE "StandingRecord" (
    "id" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "kind" "StandingKind" NOT NULL,
    "eventDate" DATE NOT NULL,
    "announcedDate" DATE,
    "liftedDate" DATE,
    "notes" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StandingRecord_publisherId_eventDate_idx" ON "StandingRecord"("publisherId", "eventDate");

-- CreateIndex
CREATE INDEX "StandingRecord_kind_idx" ON "StandingRecord"("kind");

-- AddForeignKey
ALTER TABLE "StandingRecord" ADD CONSTRAINT "StandingRecord_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingRecord" ADD CONSTRAINT "StandingRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
