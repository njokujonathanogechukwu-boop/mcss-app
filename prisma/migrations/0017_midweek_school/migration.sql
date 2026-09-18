-- CreateEnum
CREATE TYPE "MidweekSection" AS ENUM ('TREASURES', 'MINISTRY', 'LIVING');

-- CreateEnum
CREATE TYPE "MidweekHall" AS ENUM ('MAIN', 'AUXILIARY');

-- CreateEnum
CREATE TYPE "MidweekSlot" AS ENUM ('SPEAKER', 'STUDENT', 'ASSISTANT', 'CONDUCTOR', 'READER');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SCHOOL_OVERSEER';

-- CreateTable
CREATE TABLE "SchoolStudent" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "dateOfBirth" DATE,
    "phone" TEXT,
    "guardianName" TEXT,
    "guardianPhone" TEXT,
    "conductorId" TEXT,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "publisherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolStudent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MidweekPeriod" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "startMonth" INTEGER NOT NULL,
    "meetingWeekday" INTEGER NOT NULL DEFAULT 2,
    "startHour" INTEGER NOT NULL DEFAULT 18,
    "startMinute" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MidweekPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MidweekWeek" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "weekOf" DATE NOT NULL,
    "bibleReading" TEXT,
    "chairmanId" TEXT,
    "counselorId" TEXT,
    "openingPrayerId" TEXT,
    "closingPrayerId" TEXT,
    "openingSong" INTEGER,
    "livingSong" INTEGER,
    "closingSong" INTEGER,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancelledReason" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MidweekWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MidweekPart" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "section" "MidweekSection" NOT NULL,
    "title" TEXT NOT NULL,
    "minutes" INTEGER,
    "detail" TEXT,
    "slots" "MidweekSlot"[] DEFAULT ARRAY[]::"MidweekSlot"[],
    "dualHall" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MidweekPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MidweekAssignment" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "hall" "MidweekHall" NOT NULL DEFAULT 'MAIN',
    "slot" "MidweekSlot" NOT NULL,
    "publisherId" TEXT,
    "studentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MidweekAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MidweekDocument" (
    "id" TEXT NOT NULL,
    "periodId" TEXT,
    "weekId" TEXT,
    "label" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MidweekDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolStudent_publisherId_key" ON "SchoolStudent"("publisherId");

-- CreateIndex
CREATE INDEX "SchoolStudent_lastName_firstName_idx" ON "SchoolStudent"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "SchoolStudent_active_idx" ON "SchoolStudent"("active");

-- CreateIndex
CREATE UNIQUE INDEX "MidweekPeriod_startYear_startMonth_key" ON "MidweekPeriod"("startYear", "startMonth");

-- CreateIndex
CREATE INDEX "MidweekWeek_weekOf_idx" ON "MidweekWeek"("weekOf");

-- CreateIndex
CREATE UNIQUE INDEX "MidweekWeek_periodId_weekOf_key" ON "MidweekWeek"("periodId", "weekOf");

-- CreateIndex
CREATE INDEX "MidweekPart_weekId_position_idx" ON "MidweekPart"("weekId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "MidweekPart_weekId_position_key" ON "MidweekPart"("weekId", "position");

-- CreateIndex
CREATE INDEX "MidweekAssignment_publisherId_idx" ON "MidweekAssignment"("publisherId");

-- CreateIndex
CREATE INDEX "MidweekAssignment_studentId_idx" ON "MidweekAssignment"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "MidweekAssignment_partId_hall_slot_key" ON "MidweekAssignment"("partId", "hall", "slot");

-- CreateIndex
CREATE INDEX "MidweekDocument_periodId_idx" ON "MidweekDocument"("periodId");

-- CreateIndex
CREATE INDEX "MidweekDocument_weekId_idx" ON "MidweekDocument"("weekId");

-- AddForeignKey
ALTER TABLE "SchoolStudent" ADD CONSTRAINT "SchoolStudent_conductorId_fkey" FOREIGN KEY ("conductorId") REFERENCES "Publisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolStudent" ADD CONSTRAINT "SchoolStudent_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MidweekPeriod" ADD CONSTRAINT "MidweekPeriod_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MidweekWeek" ADD CONSTRAINT "MidweekWeek_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "MidweekPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MidweekWeek" ADD CONSTRAINT "MidweekWeek_chairmanId_fkey" FOREIGN KEY ("chairmanId") REFERENCES "Publisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MidweekWeek" ADD CONSTRAINT "MidweekWeek_counselorId_fkey" FOREIGN KEY ("counselorId") REFERENCES "Publisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MidweekWeek" ADD CONSTRAINT "MidweekWeek_openingPrayerId_fkey" FOREIGN KEY ("openingPrayerId") REFERENCES "Publisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MidweekWeek" ADD CONSTRAINT "MidweekWeek_closingPrayerId_fkey" FOREIGN KEY ("closingPrayerId") REFERENCES "Publisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MidweekPart" ADD CONSTRAINT "MidweekPart_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "MidweekWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MidweekAssignment" ADD CONSTRAINT "MidweekAssignment_partId_fkey" FOREIGN KEY ("partId") REFERENCES "MidweekPart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MidweekAssignment" ADD CONSTRAINT "MidweekAssignment_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MidweekAssignment" ADD CONSTRAINT "MidweekAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MidweekDocument" ADD CONSTRAINT "MidweekDocument_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "MidweekPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MidweekDocument" ADD CONSTRAINT "MidweekDocument_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "MidweekWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MidweekDocument" ADD CONSTRAINT "MidweekDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
