-- CreateTable
CREATE TABLE "OutboundMail" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'GENERAL',
    "provider" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundMail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutboundMail_createdAt_idx" ON "OutboundMail"("createdAt");

-- CreateIndex
CREATE INDEX "OutboundMail_kind_idx" ON "OutboundMail"("kind");

-- AddForeignKey
ALTER TABLE "OutboundMail" ADD CONSTRAINT "OutboundMail_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
