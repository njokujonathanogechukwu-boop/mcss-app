-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SECRETARY', 'COORDINATOR', 'ELDER', 'SERVANT', 'VIEWER');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "Appointment" AS ENUM ('PUBLISHER', 'MINISTERIAL_SERVANT', 'ELDER');

-- CreateEnum
CREATE TYPE "PioneerStatus" AS ENUM ('NONE', 'AUXILIARY', 'REGULAR', 'SPECIAL');

-- CreateEnum
CREATE TYPE "PublisherStatus" AS ENUM ('ACTIVE', 'IRREGULAR', 'INACTIVE', 'TRANSFERRED_OUT', 'DECEASED');

-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('MIDWEEK', 'WEEKEND');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "ReportSource" AS ENUM ('FORM', 'MANUAL', 'IMPORT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "publisherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceGroup" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "overseerId" TEXT,
    "assistantId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Publisher" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "baptismDate" TIMESTAMP(3),
    "isBaptized" BOOLEAN NOT NULL DEFAULT false,
    "isAnointed" BOOLEAN NOT NULL DEFAULT false,
    "appointment" "Appointment" NOT NULL DEFAULT 'PUBLISHER',
    "pioneerStatus" "PioneerStatus" NOT NULL DEFAULT 'NONE',
    "status" "PublisherStatus" NOT NULL DEFAULT 'ACTIVE',
    "privileges" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "groupId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Publisher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferLog" (
    "id" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "fromGroupId" TEXT,
    "toGroupId" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceReport" (
    "id" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "sharedInMinistry" BOOLEAN NOT NULL DEFAULT true,
    "bibleStudies" INTEGER NOT NULL DEFAULT 0,
    "hours" INTEGER,
    "creditHours" INTEGER,
    "pioneerStatusUsed" "PioneerStatus" NOT NULL DEFAULT 'NONE',
    "remarks" TEXT,
    "source" "ReportSource" NOT NULL DEFAULT 'MANUAL',
    "submittedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAttendance" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "meetingType" "MeetingType" NOT NULL,
    "inPerson" INTEGER NOT NULL DEFAULT 0,
    "zoom" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HallResource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HallResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HallBooking" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "requestingBody" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT,
    "eventType" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "setupRequirements" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "decisionNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HallBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoeDecision" (
    "id" TEXT NOT NULL,
    "meetingDate" DATE NOT NULL,
    "agendaItem" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "assignedToId" TEXT,
    "targetDate" DATE,
    "status" "DecisionStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoeDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_publisherId_key" ON "User"("publisherId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceGroup_number_key" ON "ServiceGroup"("number");

-- CreateIndex
CREATE INDEX "Publisher_lastName_firstName_idx" ON "Publisher"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Publisher_groupId_idx" ON "Publisher"("groupId");

-- CreateIndex
CREATE INDEX "Publisher_status_idx" ON "Publisher"("status");

-- CreateIndex
CREATE INDEX "TransferLog_publisherId_idx" ON "TransferLog"("publisherId");

-- CreateIndex
CREATE INDEX "ServiceReport_year_month_idx" ON "ServiceReport"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceReport_publisherId_year_month_key" ON "ServiceReport"("publisherId", "year", "month");

-- CreateIndex
CREATE INDEX "MeetingAttendance_date_idx" ON "MeetingAttendance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingAttendance_date_meetingType_key" ON "MeetingAttendance"("date", "meetingType");

-- CreateIndex
CREATE UNIQUE INDEX "HallResource_name_key" ON "HallResource"("name");

-- CreateIndex
CREATE INDEX "HallBooking_resourceId_startTime_endTime_idx" ON "HallBooking"("resourceId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "HallBooking_status_idx" ON "HallBooking"("status");

-- CreateIndex
CREATE INDEX "BoeDecision_status_targetDate_idx" ON "BoeDecision"("status", "targetDate");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceGroup" ADD CONSTRAINT "ServiceGroup_overseerId_fkey" FOREIGN KEY ("overseerId") REFERENCES "Publisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceGroup" ADD CONSTRAINT "ServiceGroup_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Publisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publisher" ADD CONSTRAINT "Publisher_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ServiceGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLog" ADD CONSTRAINT "TransferLog_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLog" ADD CONSTRAINT "TransferLog_fromGroupId_fkey" FOREIGN KEY ("fromGroupId") REFERENCES "ServiceGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLog" ADD CONSTRAINT "TransferLog_toGroupId_fkey" FOREIGN KEY ("toGroupId") REFERENCES "ServiceGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLog" ADD CONSTRAINT "TransferLog_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceReport" ADD CONSTRAINT "ServiceReport_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceReport" ADD CONSTRAINT "ServiceReport_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HallBooking" ADD CONSTRAINT "HallBooking_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "HallResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HallBooking" ADD CONSTRAINT "HallBooking_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoeDecision" ADD CONSTRAINT "BoeDecision_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "Publisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

