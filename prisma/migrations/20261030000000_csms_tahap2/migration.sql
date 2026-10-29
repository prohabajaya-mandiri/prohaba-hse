-- CSMS Tahap 2: zona waktu site, data PJO/Safety Officer (008B), profil perusahaan & site, register temuan,
-- dan snapshot bukti dari data modul. Hanya menambah tabel/kolom nullable; data lama tidak berubah.
-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "timezone" TEXT;

-- AlterTable
ALTER TABLE "SiteResponsible" ADD COLUMN     "approvalDate" TIMESTAMP(3),
ADD COLUMN     "approvalNo" TEXT,
ADD COLUMN     "competency" TEXT,
ADD COLUMN     "email" TEXT;

-- AlterTable
ALTER TABLE "CsmsEvidence" ADD COLUMN     "snapshot" JSONB;

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL DEFAULT 'PJM',
    "name" TEXT NOT NULL,
    "hoAddress" TEXT,
    "businessCategory" TEXT,
    "businessScale" TEXT,
    "iujpNumber" TEXT,
    "iujpExpiry" TIMESTAMP(3),
    "notes" TEXT,
    "updatedByName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteCsmsProfile" (
    "siteId" TEXT NOT NULL,
    "userDepartment" TEXT,
    "siteAddress" TEXT,
    "province" TEXT,
    "regency" TEXT,
    "riskLevel" TEXT,
    "workScope" TEXT,
    "updatedByName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteCsmsProfile_pkey" PRIMARY KEY ("siteId")
);

-- CreateTable
CREATE TABLE "CsmsFinding" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "requirementId" TEXT,
    "description" TEXT NOT NULL,
    "picRole" TEXT,
    "picName" TEXT,
    "dueDate" TIMESTAMP(3),
    "correctiveAction" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TERBUKA',
    "incidentId" TEXT,
    "incidentActionId" TEXT,
    "verifierName" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CsmsFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsmsFindingHistory" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "note" TEXT,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CsmsFindingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CsmsFinding_number_key" ON "CsmsFinding"("number");

-- CreateIndex
CREATE UNIQUE INDEX "CsmsFinding_incidentActionId_key" ON "CsmsFinding"("incidentActionId");

-- CreateIndex
CREATE INDEX "CsmsFinding_siteId_status_idx" ON "CsmsFinding"("siteId", "status");

-- CreateIndex
CREATE INDEX "CsmsFinding_status_dueDate_idx" ON "CsmsFinding"("status", "dueDate");

-- CreateIndex
CREATE INDEX "CsmsFinding_incidentId_idx" ON "CsmsFinding"("incidentId");

-- CreateIndex
CREATE INDEX "CsmsFindingHistory_findingId_createdAt_idx" ON "CsmsFindingHistory"("findingId", "createdAt");

-- AddForeignKey
ALTER TABLE "SiteCsmsProfile" ADD CONSTRAINT "SiteCsmsProfile_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsmsFinding" ADD CONSTRAINT "CsmsFinding_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsmsFinding" ADD CONSTRAINT "CsmsFinding_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "CsmsRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsmsFindingHistory" ADD CONSTRAINT "CsmsFindingHistory_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "CsmsFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

