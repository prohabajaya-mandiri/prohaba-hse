-- CSMS Tahap 3: assessment internal 0/1/2 (final dikunci, revisi berjejak, skor & bukti disalin saat final),
-- register izin kerja khusus dari owner, dan tautan temuan ke assessment. Hanya menambah tabel/kolom.
-- AlterTable
ALTER TABLE "CsmsFinding" ADD COLUMN     "assessmentId" TEXT;

-- CreateTable
CREATE TABLE "CsmsAssessment" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "assessmentDate" TIMESTAMP(3) NOT NULL,
    "assessors" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revisionNo" INTEGER NOT NULL DEFAULT 0,
    "revisionOfId" TEXT,
    "revisionReason" TEXT,
    "supersededAt" TIMESTAMP(3),
    "totalScore" INTEGER,
    "maxScore" INTEGER,
    "percent" DECIMAL(6,2),
    "riskLevel" TEXT,
    "notes" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "finalizedByName" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CsmsAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsmsAssessmentScore" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemText" TEXT NOT NULL,
    "elementNo" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "applicable" BOOLEAN NOT NULL DEFAULT true,
    "score" INTEGER,
    "note" TEXT,
    "evidence" JSONB,

    CONSTRAINT "CsmsAssessmentScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkPermit" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "projectId" TEXT,
    "number" TEXT NOT NULL,
    "permitType" TEXT NOT NULL,
    "workType" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "responsibleName" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "hiradcDocumentId" TEXT,
    "jsaNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TERCATAT',
    "closedAt" TIMESTAMP(3),
    "closureNote" TEXT,
    "cancelReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkPermit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CsmsAssessment_number_key" ON "CsmsAssessment"("number");

-- CreateIndex
CREATE INDEX "CsmsAssessment_siteId_assessmentDate_idx" ON "CsmsAssessment"("siteId", "assessmentDate");

-- CreateIndex
CREATE INDEX "CsmsAssessment_applicationId_status_idx" ON "CsmsAssessment"("applicationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CsmsAssessmentScore_assessmentId_itemId_key" ON "CsmsAssessmentScore"("assessmentId", "itemId");

-- CreateIndex
CREATE INDEX "WorkPermit_siteId_startAt_idx" ON "WorkPermit"("siteId", "startAt");

-- CreateIndex
CREATE INDEX "WorkPermit_status_endAt_idx" ON "WorkPermit"("status", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkPermit_siteId_number_key" ON "WorkPermit"("siteId", "number");

-- CreateIndex
CREATE INDEX "CsmsFinding_assessmentId_idx" ON "CsmsFinding"("assessmentId");

-- AddForeignKey
ALTER TABLE "CsmsAssessment" ADD CONSTRAINT "CsmsAssessment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsmsAssessment" ADD CONSTRAINT "CsmsAssessment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CsmsSiteApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsmsAssessment" ADD CONSTRAINT "CsmsAssessment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CsmsTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsmsAssessment" ADD CONSTRAINT "CsmsAssessment_revisionOfId_fkey" FOREIGN KEY ("revisionOfId") REFERENCES "CsmsAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsmsAssessmentScore" ADD CONSTRAINT "CsmsAssessmentScore_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "CsmsAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsmsAssessmentScore" ADD CONSTRAINT "CsmsAssessmentScore_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CsmsItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPermit" ADD CONSTRAINT "WorkPermit_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

