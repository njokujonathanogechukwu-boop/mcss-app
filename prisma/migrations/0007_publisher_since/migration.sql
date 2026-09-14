-- CreateEnum
CREATE TYPE "SinceKind" AS ENUM ('MOVED_IN', 'STARTED_PUBLISHING');

-- AlterTable: records when a publisher came onto the congregation's roll, so
-- reminders and the report sheet expect nothing of them before that date.
ALTER TABLE "Publisher" ADD COLUMN     "sinceDate" DATE;
ALTER TABLE "Publisher" ADD COLUMN     "sinceKind" "SinceKind";
