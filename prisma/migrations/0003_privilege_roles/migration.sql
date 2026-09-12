-- CreateEnum
CREATE TYPE "PrivilegeRole" AS ENUM ('OVERSEER', 'ASSISTANT', 'SERVANT', 'ASSIGNEE');

-- AlterTable
ALTER TABLE "PublisherPrivilege" ADD COLUMN     "role" "PrivilegeRole" NOT NULL DEFAULT 'ASSIGNEE';

