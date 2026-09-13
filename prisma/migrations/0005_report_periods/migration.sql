-- CreateTable
CREATE TABLE "ReportPeriod" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedById" TEXT,
    "onTimeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lateKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportPeriod_year_month_idx" ON "ReportPeriod"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "ReportPeriod_year_month_key" ON "ReportPeriod"("year", "month");
