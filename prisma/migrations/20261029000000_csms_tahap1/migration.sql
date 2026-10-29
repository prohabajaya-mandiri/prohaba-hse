-- Pemenuhan CSMS Tahap 1: template owner (berversi), penerapan per site, persyaratan, pemenuhan per periode,
-- pengajuan berversi, bukti (banyak-ke-banyak) dan metadata dokumen induk pada Dokumen HSE.
-- Hanya menambah tabel/kolom; kolom baru HseDocument bernilai default sehingga dokumen lama tidak berubah perilaku.
-- AlterTable
ALTER TABLE "HseDocument" ADD COLUMN     "accessScope" TEXT NOT NULL DEFAULT 'DEFAULT',
ADD COLUMN     "approverName" TEXT,
ADD COLUMN     "effectiveDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "HseDocumentSite" (
    "documentId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,

    CONSTRAINT "HseDocumentSite_pkey" PRIMARY KEY ("documentId","siteId")
);

-- CreateTable
CREATE TABLE "HseDocumentCsmsItem" (
    "documentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "HseDocumentCsmsItem_pkey" PRIMARY KEY ("documentId","itemId")
);

-- CreateTable
CREATE TABLE "CsmsTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "sourceDocCode" TEXT NOT NULL,
    "sourceDocName" TEXT NOT NULL,
    "sourceRevision" TEXT,
    "sourceEffective" TIMESTAMP(3),
    "sourceMaxScore" INTEGER,
    "scoringGuide" TEXT,
    "naPolicy" TEXT NOT NULL DEFAULT 'EXCLUDE_FROM_MAX',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "copiedFromId" TEXT,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "activatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CsmsTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsmsElement" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "hoScope" TEXT,
    "siteScope" TEXT,

    CONSTRAINT "CsmsElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsmsItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "internalCode" TEXT NOT NULL,
    "sourceCode" TEXT,
    "refCode" TEXT,
    "subHeader" TEXT,
    "sourceText" TEXT NOT NULL,
    "displayText" TEXT,
    "maxScore" INTEGER NOT NULL DEFAULT 2,
    "responsibility" TEXT NOT NULL DEFAULT 'BERSAMA',
    "defaultFrequency" TEXT NOT NULL DEFAULT 'ONCE',
    "evidenceGuide" TEXT,
    "sourceRow" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CsmsItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsmsSiteApplication" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "projectId" TEXT,
    "ownerRegisterNo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "requireReview" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CsmsSiteApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsmsRequirement" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "itemId" TEXT,
    "elementId" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'TEMPLATE',
    "code" TEXT,
    "text" TEXT,
    "sourceRef" TEXT,
    "applicability" TEXT NOT NULL DEFAULT 'APPLICABLE',
    "naReason" TEXT,
    "naRequestedByName" TEXT,
    "naDecidedByName" TEXT,
    "naDecidedAt" TIMESTAMP(3),
    "responsibility" TEXT NOT NULL DEFAULT 'BERSAMA',
    "frequency" TEXT NOT NULL DEFAULT 'ONCE',
    "dueDays" INTEGER,
    "dueDate" TIMESTAMP(3),
    "schedule" JSONB,
    "picRole" TEXT,
    "picUserId" TEXT,
    "picName" TEXT,
    "supportRoles" TEXT,
    "evidenceGuide" TEXT,
    "ownerReference" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CsmsRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsmsFulfillment" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "reviewNote" TEXT,
    "lastActorName" TEXT,
    "submittedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CsmsFulfillment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsmsSubmission" (
    "id" TEXT NOT NULL,
    "fulfillmentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "note" TEXT,
    "evidence" JSONB NOT NULL,
    "submittedById" TEXT NOT NULL,
    "submittedByName" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,

    CONSTRAINT "CsmsSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsmsEvidence" (
    "id" TEXT NOT NULL,
    "siteId" TEXT,
    "kind" TEXT NOT NULL,
    "fileId" TEXT,
    "documentId" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "evidenceDate" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CsmsEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsmsEvidenceLink" (
    "evidenceId" TEXT NOT NULL,
    "fulfillmentId" TEXT NOT NULL,
    "linkedByName" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CsmsEvidenceLink_pkey" PRIMARY KEY ("evidenceId","fulfillmentId")
);

-- CreateIndex
CREATE INDEX "HseDocumentSite_siteId_idx" ON "HseDocumentSite"("siteId");

-- CreateIndex
CREATE INDEX "HseDocumentCsmsItem_itemId_idx" ON "HseDocumentCsmsItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "CsmsTemplate_code_version_key" ON "CsmsTemplate"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CsmsElement_templateId_number_key" ON "CsmsElement"("templateId", "number");

-- CreateIndex
CREATE INDEX "CsmsItem_elementId_sortOrder_idx" ON "CsmsItem"("elementId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CsmsItem_templateId_internalCode_key" ON "CsmsItem"("templateId", "internalCode");

-- CreateIndex
CREATE INDEX "CsmsSiteApplication_siteId_status_idx" ON "CsmsSiteApplication"("siteId", "status");

-- CreateIndex
CREATE INDEX "CsmsSiteApplication_templateId_idx" ON "CsmsSiteApplication"("templateId");

-- CreateIndex
CREATE INDEX "CsmsRequirement_applicationId_elementId_idx" ON "CsmsRequirement"("applicationId", "elementId");

-- CreateIndex
CREATE UNIQUE INDEX "CsmsRequirement_applicationId_itemId_key" ON "CsmsRequirement"("applicationId", "itemId");

-- CreateIndex
CREATE INDEX "CsmsFulfillment_siteId_status_idx" ON "CsmsFulfillment"("siteId", "status");

-- CreateIndex
CREATE INDEX "CsmsFulfillment_status_dueDate_idx" ON "CsmsFulfillment"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "CsmsFulfillment_requirementId_periodKey_key" ON "CsmsFulfillment"("requirementId", "periodKey");

-- CreateIndex
CREATE INDEX "CsmsSubmission_outcome_submittedAt_idx" ON "CsmsSubmission"("outcome", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CsmsSubmission_fulfillmentId_version_key" ON "CsmsSubmission"("fulfillmentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CsmsEvidence_fileId_key" ON "CsmsEvidence"("fileId");

-- CreateIndex
CREATE INDEX "CsmsEvidence_siteId_createdAt_idx" ON "CsmsEvidence"("siteId", "createdAt");

-- CreateIndex
CREATE INDEX "CsmsEvidence_documentId_idx" ON "CsmsEvidence"("documentId");

-- CreateIndex
CREATE INDEX "CsmsEvidence_sourceType_sourceId_idx" ON "CsmsEvidence"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "CsmsEvidenceLink_fulfillmentId_idx" ON "CsmsEvidenceLink"("fulfillmentId");

-- AddForeignKey
ALTER TABLE "HseDocumentSite" ADD CONSTRAINT "HseDocumentSite_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "HseDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HseDocumentSite" ADD CONSTRAINT "HseDocumentSite_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HseDocumentCsmsItem" ADD CONSTRAINT "HseDocumentCsmsItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "HseDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HseDocumentCsmsItem" ADD CONSTRAINT "HseDocumentCsmsItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CsmsItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsmsTemplate" ADD CONSTRAINT "CsmsTemplate_copiedFromId_fkey" FOREIGN KEY ("copiedFromId") REFERENCES "CsmsTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsmsElement" ADD CONSTRAINT "CsmsElement_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CsmsTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsmsItem" ADD CONSTRAINT "CsmsItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CsmsTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsmsItem" ADD CONSTRAINT "CsmsItem_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "CsmsElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsmsSiteApplication" ADD CONSTRAINT "CsmsSiteApplication_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsmsSiteApplication" ADD CONSTRAINT "CsmsSiteApplication_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CsmsTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsmsRequirement" ADD CONSTRAINT "CsmsRequirement_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CsmsSiteApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsmsRequirement" ADD CONSTRAINT "CsmsRequirement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CsmsItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsmsRequirement" ADD CONSTRAINT "CsmsRequirement_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "CsmsElement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsmsFulfillment" ADD CONSTRAINT "CsmsFulfillment_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "CsmsRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsmsSubmission" ADD CONSTRAINT "CsmsSubmission_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "CsmsFulfillment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsmsEvidenceLink" ADD CONSTRAINT "CsmsEvidenceLink_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "CsmsEvidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsmsEvidenceLink" ADD CONSTRAINT "CsmsEvidenceLink_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "CsmsFulfillment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

