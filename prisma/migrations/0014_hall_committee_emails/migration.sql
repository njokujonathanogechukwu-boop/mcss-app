-- CreateTable
CREATE TABLE "CongregationSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CongregationSetting_pkey" PRIMARY KEY ("key")
);

-- AlterTable
ALTER TABLE "HallBooking" ADD COLUMN "weekReminderSentAt" TIMESTAMP(3);
