-- CreateEnum
CREATE TYPE "ReportOutcome" AS ENUM ('SHARED', 'DID_NOT_PREACH', 'NO_REPORT');

-- AlterTable: the old boolean could only say whether a publisher shared, so
-- "reported but did not preach" and "no report at all" looked the same.
ALTER TABLE "ServiceReport" ADD COLUMN     "outcome" "ReportOutcome" NOT NULL DEFAULT 'SHARED';
UPDATE "ServiceReport" SET "outcome" = 'DID_NOT_PREACH' WHERE "sharedInMinistry" = false;
ALTER TABLE "ServiceReport" DROP COLUMN "sharedInMinistry";
