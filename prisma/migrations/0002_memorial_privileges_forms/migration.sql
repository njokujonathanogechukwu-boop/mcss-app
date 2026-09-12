-- CreateEnum
CREATE TYPE "PrivilegeCategory" AS ENUM ('CONGREGATION', 'MEETING', 'OTHER');

-- CreateEnum
CREATE TYPE "FormKind" AS ENUM ('S21', 'S1', 'S88');

-- CreateTable
CREATE TABLE "MemorialRecord" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "inPerson" INTEGER NOT NULL DEFAULT 0,
    "video" INTEGER NOT NULL DEFAULT 0,
    "partakers" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemorialRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Privilege" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "PrivilegeCategory" NOT NULL DEFAULT 'CONGREGATION',
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Privilege_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublisherPrivilege" (
    "id" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "privilegeId" TEXT NOT NULL,
    "startDate" DATE,
    "endDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublisherPrivilege_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormTemplate" (
    "id" TEXT NOT NULL,
    "kind" "FormKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "fieldCount" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemorialRecord_year_key" ON "MemorialRecord"("year");

-- CreateIndex
CREATE UNIQUE INDEX "Privilege_name_key" ON "Privilege"("name");

-- CreateIndex
CREATE INDEX "PublisherPrivilege_publisherId_idx" ON "PublisherPrivilege"("publisherId");

-- CreateIndex
CREATE INDEX "PublisherPrivilege_privilegeId_idx" ON "PublisherPrivilege"("privilegeId");

-- CreateIndex
CREATE UNIQUE INDEX "FormTemplate_kind_key" ON "FormTemplate"("kind");

-- AddForeignKey
ALTER TABLE "PublisherPrivilege" ADD CONSTRAINT "PublisherPrivilege_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublisherPrivilege" ADD CONSTRAINT "PublisherPrivilege_privilegeId_fkey" FOREIGN KEY ("privilegeId") REFERENCES "Privilege"("id") ON DELETE CASCADE ON UPDATE CASCADE;

