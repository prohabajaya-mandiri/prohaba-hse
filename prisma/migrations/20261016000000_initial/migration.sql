-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "region" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSite" (
    "userId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,

    CONSTRAINT "UserSite_pkey" PRIMARY KEY ("userId","siteId")
);

-- CreateTable
CREATE TABLE "Operator" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "actorName" TEXT NOT NULL,
    "operatorId" TEXT,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "recordId" TEXT,
    "siteId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "note" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "updatedBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Sequence" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "region" TEXT NOT NULL,
    "isHo" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "contractNo" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteResponsible" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "userId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteResponsible_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Personnel" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nikHash" TEXT NOT NULL,
    "nikEnc" TEXT NOT NULL,
    "nikLast4" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "birthPlace" TEXT,
    "birthDate" TIMESTAMP(3),
    "gender" TEXT,
    "maritalStatus" TEXT,
    "education" TEXT,
    "major" TEXT,
    "phoneWa" TEXT,
    "emergencyName" TEXT,
    "emergencyPhone" TEXT,
    "emergencyRelation" TEXT,
    "ktpAddressEnc" TEXT NOT NULL,
    "domicileAddress" TEXT,
    "originRegion" TEXT,
    "category" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "initialSiteId" TEXT,
    "currentSiteId" TEXT,
    "startDate" TIMESTAMP(3),
    "workStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "bpjsKesehatan" TEXT,
    "bpjsKetenagakerjaan" TEXT,
    "bloodType" TEXT,
    "medicalHistoryEnc" TEXT,
    "shirtSize" TEXT,
    "shoeSize" TEXT,
    "bankName" TEXT,
    "bankAccountEnc" TEXT,
    "bankAccountName" TEXT,
    "foremanId" TEXT,
    "ktpFileId" TEXT,
    "ocrVerified" BOOLEAN NOT NULL DEFAULT false,
    "isFormer" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Personnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileObject" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "sensitivity" TEXT NOT NULL,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "entityType" TEXT,
    "entityId" TEXT,
    "siteId" TEXT,
    "label" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Placement" (
    "id" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "endReason" TEXT,
    "notes" TEXT,
    "mutationId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mutation" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "fromSiteId" TEXT,
    "toSiteId" TEXT NOT NULL,
    "toPosition" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "requestedName" TEXT NOT NULL,
    "decidedBy" TEXT,
    "decidedName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mutation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McuRecord" (
    "id" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "siteId" TEXT,
    "type" TEXT NOT NULL,
    "parentId" TEXT,
    "clinic" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'SCREENING',
    "screeningDate" TIMESTAMP(3),
    "mcuDate" TIMESTAMP(3),
    "resultDate" TIMESTAMP(3),
    "submitDate" TIMESTAMP(3),
    "feedbackDate" TIMESTAMP(3),
    "result" TEXT NOT NULL DEFAULT 'PENDING',
    "fuDueDate" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "cost" DECIMAL(14,2),
    "notesEnc" TEXT,
    "feedback" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McuRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permit" (
    "id" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "permitType" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issuer" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "basisResult" TEXT,
    "mcuId" TEXT,
    "isTemporary" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "previousId" TEXT,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mobilization" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "departDate" TIMESTAMP(3) NOT NULL,
    "arriveDate" TIMESTAMP(3),
    "transport" TEXT,
    "cost" DECIMAL(14,2),
    "status" TEXT NOT NULL DEFAULT 'DIRENCANAKAN',
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mobilization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobilizationMember" (
    "id" TEXT NOT NULL,
    "mobilizationId" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "arrived" BOOLEAN NOT NULL DEFAULT false,
    "arrivedAt" TIMESTAMP(3),
    "cost" DECIMAL(14,2),
    "demobReason" TEXT,
    "nextStatus" TEXT,
    "notes" TEXT,

    CONSTRAINT "MobilizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterPolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "siteId" TEXT,
    "category" TEXT NOT NULL,
    "maritalStatus" TEXT,
    "onsiteDays" INTEGER NOT NULL,
    "offDays" INTEGER NOT NULL,
    "countWorkdays" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RosterPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRecord" (
    "id" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "returnDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RENCANA',
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Indicator" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'kali',
    "hasParticipants" BOOLEAN NOT NULL DEFAULT false,
    "monthlyTarget" DECIMAL(14,2),
    "definition" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "Indicator_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "DailyPerformance" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "manpower" INTEGER NOT NULL,
    "workHours" DECIMAL(6,2) NOT NULL,
    "overtimeHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "excludedHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "manhours" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "reportedBy" TEXT NOT NULL,
    "reporterName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HseActivity" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "indicatorCode" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "participants" INTEGER,
    "title" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "reportedBy" TEXT NOT NULL,
    "reporterName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HseActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HseReport" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "summary" JSONB,
    "narrative" TEXT,
    "constraints" TEXT,
    "nextPlan" TEXT,
    "incidentNote" TEXT,
    "createdBy" TEXT NOT NULL,
    "creatorName" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewerName" TEXT,
    "reviewNote" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approverName" TEXT,
    "approveNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HseReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HseReportHistory" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "note" TEXT,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HseReportHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "chronology" TEXT NOT NULL,
    "impact" TEXT,
    "initialAction" TEXT,
    "lostDays" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "investigator" TEXT,
    "investigatedAt" TIMESTAMP(3),
    "immediateCause" TEXT,
    "rootCause" TEXT,
    "reportedToOwner" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "createdBy" TEXT NOT NULL,
    "creatorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentVictim" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "personnelId" TEXT,
    "name" TEXT NOT NULL,
    "injury" TEXT,
    "bodyPart" TEXT,

    CONSTRAINT "IncidentVictim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentAction" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "pic" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "IncidentAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competency" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "validityMonths" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Competency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionRequirement" (
    "id" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,

    CONSTRAINT "PositionRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonnelCertificate" (
    "id" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "certNumber" TEXT,
    "issuer" TEXT,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonnelCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "competencyId" TEXT,
    "siteId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "trainer" TEXT,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RENCANA',
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingParticipant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "attended" BOOLEAN,
    "result" TEXT,
    "score" DECIMAL(6,2),

    CONSTRAINT "TrainingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Salary" (
    "id" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "baseEnc" TEXT NOT NULL,
    "allowanceEnc" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Salary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrRecommendation" (
    "id" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "creatorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EfficiencyScenario" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "steps" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EfficiencyScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HseDocument" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "siteId" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "ownerName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BERLAKU',
    "revision" TEXT NOT NULL DEFAULT '0',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HseDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HseDocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "notes" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HseDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "dedupeKey" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "note" TEXT,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "UserSite_siteId_idx" ON "UserSite"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "Operator_userId_name_key" ON "Operator"("userId", "name");

-- CreateIndex
CREATE INDEX "LoginAttempt_resetAt_idx" ON "LoginAttempt"("resetAt");

-- CreateIndex
CREATE INDEX "AuditLog_module_createdAt_idx" ON "AuditLog"("module", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_recordId_idx" ON "AuditLog"("recordId");

-- CreateIndex
CREATE INDEX "AuditLog_siteId_createdAt_idx" ON "AuditLog"("siteId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Site_code_key" ON "Site"("code");

-- CreateIndex
CREATE INDEX "Project_siteId_status_idx" ON "Project"("siteId", "status");

-- CreateIndex
CREATE INDEX "SiteResponsible_siteId_role_endDate_idx" ON "SiteResponsible"("siteId", "role", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "Personnel_code_key" ON "Personnel"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Personnel_nikHash_key" ON "Personnel"("nikHash");

-- CreateIndex
CREATE UNIQUE INDEX "Personnel_ktpFileId_key" ON "Personnel"("ktpFileId");

-- CreateIndex
CREATE INDEX "Personnel_currentSiteId_category_workStatus_idx" ON "Personnel"("currentSiteId", "category", "workStatus");

-- CreateIndex
CREATE INDEX "Personnel_name_idx" ON "Personnel"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FileObject_storageKey_key" ON "FileObject"("storageKey");

-- CreateIndex
CREATE INDEX "FileObject_entityType_entityId_idx" ON "FileObject"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Placement_personnelId_status_idx" ON "Placement"("personnelId", "status");

-- CreateIndex
CREATE INDEX "Placement_siteId_status_idx" ON "Placement"("siteId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Mutation_number_key" ON "Mutation"("number");

-- CreateIndex
CREATE INDEX "Mutation_status_createdAt_idx" ON "Mutation"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Mutation_personnelId_idx" ON "Mutation"("personnelId");

-- CreateIndex
CREATE INDEX "McuRecord_personnelId_createdAt_idx" ON "McuRecord"("personnelId", "createdAt");

-- CreateIndex
CREATE INDEX "McuRecord_siteId_result_idx" ON "McuRecord"("siteId", "result");

-- CreateIndex
CREATE INDEX "McuRecord_validUntil_idx" ON "McuRecord"("validUntil");

-- CreateIndex
CREATE INDEX "McuRecord_personnelId_isLatest_idx" ON "McuRecord"("personnelId", "isLatest");

-- CreateIndex
CREATE INDEX "Permit_personnelId_endDate_idx" ON "Permit"("personnelId", "endDate");

-- CreateIndex
CREATE INDEX "Permit_siteId_endDate_idx" ON "Permit"("siteId", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "Mobilization_code_key" ON "Mobilization"("code");

-- CreateIndex
CREATE INDEX "Mobilization_siteId_departDate_idx" ON "Mobilization"("siteId", "departDate");

-- CreateIndex
CREATE UNIQUE INDEX "MobilizationMember_mobilizationId_personnelId_key" ON "MobilizationMember"("mobilizationId", "personnelId");

-- CreateIndex
CREATE INDEX "LeaveRecord_personnelId_startDate_idx" ON "LeaveRecord"("personnelId", "startDate");

-- CreateIndex
CREATE INDEX "LeaveRecord_siteId_startDate_idx" ON "LeaveRecord"("siteId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPerformance_siteId_date_key" ON "DailyPerformance"("siteId", "date");

-- CreateIndex
CREATE INDEX "HseActivity_siteId_date_idx" ON "HseActivity"("siteId", "date");

-- CreateIndex
CREATE INDEX "HseActivity_indicatorCode_date_idx" ON "HseActivity"("indicatorCode", "date");

-- CreateIndex
CREATE INDEX "HseReport_status_type_idx" ON "HseReport"("status", "type");

-- CreateIndex
CREATE UNIQUE INDEX "HseReport_siteId_type_periodKey_key" ON "HseReport"("siteId", "type", "periodKey");

-- CreateIndex
CREATE INDEX "HseReportHistory_reportId_createdAt_idx" ON "HseReportHistory"("reportId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_number_key" ON "Incident"("number");

-- CreateIndex
CREATE INDEX "Incident_siteId_occurredAt_idx" ON "Incident"("siteId", "occurredAt");

-- CreateIndex
CREATE INDEX "Incident_category_occurredAt_idx" ON "Incident"("category", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Competency_code_key" ON "Competency"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PositionRequirement_position_competencyId_key" ON "PositionRequirement"("position", "competencyId");

-- CreateIndex
CREATE INDEX "PersonnelCertificate_personnelId_idx" ON "PersonnelCertificate"("personnelId");

-- CreateIndex
CREATE INDEX "PersonnelCertificate_expiryDate_idx" ON "PersonnelCertificate"("expiryDate");

-- CreateIndex
CREATE INDEX "TrainingSession_siteId_startDate_idx" ON "TrainingSession"("siteId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingParticipant_sessionId_personnelId_key" ON "TrainingParticipant"("sessionId", "personnelId");

-- CreateIndex
CREATE INDEX "Salary_personnelId_effectiveFrom_idx" ON "Salary"("personnelId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "HrRecommendation_personnelId_createdAt_idx" ON "HrRecommendation"("personnelId", "createdAt");

-- CreateIndex
CREATE INDEX "HseDocument_category_status_idx" ON "HseDocument"("category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HseDocument_number_siteId_key" ON "HseDocument"("number", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "HseDocumentVersion_fileId_key" ON "HseDocumentVersion"("fileId");

-- CreateIndex
CREATE INDEX "HseDocumentVersion_documentId_createdAt_idx" ON "HseDocumentVersion"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "ApprovalLog_entityType_entityId_createdAt_idx" ON "ApprovalLog"("entityType", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserSite" ADD CONSTRAINT "UserSite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSite" ADD CONSTRAINT "UserSite_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operator" ADD CONSTRAINT "Operator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteResponsible" ADD CONSTRAINT "SiteResponsible_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Personnel" ADD CONSTRAINT "Personnel_initialSiteId_fkey" FOREIGN KEY ("initialSiteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Personnel" ADD CONSTRAINT "Personnel_currentSiteId_fkey" FOREIGN KEY ("currentSiteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Personnel" ADD CONSTRAINT "Personnel_foremanId_fkey" FOREIGN KEY ("foremanId") REFERENCES "Personnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Personnel" ADD CONSTRAINT "Personnel_ktpFileId_fkey" FOREIGN KEY ("ktpFileId") REFERENCES "FileObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mutation" ADD CONSTRAINT "Mutation_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mutation" ADD CONSTRAINT "Mutation_toSiteId_fkey" FOREIGN KEY ("toSiteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McuRecord" ADD CONSTRAINT "McuRecord_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McuRecord" ADD CONSTRAINT "McuRecord_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McuRecord" ADD CONSTRAINT "McuRecord_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "McuRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permit" ADD CONSTRAINT "Permit_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permit" ADD CONSTRAINT "Permit_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mobilization" ADD CONSTRAINT "Mobilization_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobilizationMember" ADD CONSTRAINT "MobilizationMember_mobilizationId_fkey" FOREIGN KEY ("mobilizationId") REFERENCES "Mobilization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobilizationMember" ADD CONSTRAINT "MobilizationMember_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterPolicy" ADD CONSTRAINT "RosterPolicy_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRecord" ADD CONSTRAINT "LeaveRecord_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRecord" ADD CONSTRAINT "LeaveRecord_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPerformance" ADD CONSTRAINT "DailyPerformance_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HseActivity" ADD CONSTRAINT "HseActivity_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HseReport" ADD CONSTRAINT "HseReport_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HseReportHistory" ADD CONSTRAINT "HseReportHistory_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "HseReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentVictim" ADD CONSTRAINT "IncidentVictim_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentVictim" ADD CONSTRAINT "IncidentVictim_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentAction" ADD CONSTRAINT "IncidentAction_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionRequirement" ADD CONSTRAINT "PositionRequirement_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonnelCertificate" ADD CONSTRAINT "PersonnelCertificate_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonnelCertificate" ADD CONSTRAINT "PersonnelCertificate_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingParticipant" ADD CONSTRAINT "TrainingParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingParticipant" ADD CONSTRAINT "TrainingParticipant_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Salary" ADD CONSTRAINT "Salary_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrRecommendation" ADD CONSTRAINT "HrRecommendation_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HseDocument" ADD CONSTRAINT "HseDocument_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HseDocumentVersion" ADD CONSTRAINT "HseDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "HseDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Satu personel hanya boleh memiliki satu penempatan ACTIVE.
CREATE UNIQUE INDEX "Placement_one_active_per_personnel" ON "Placement"("personnelId") WHERE "status" = 'ACTIVE';
-- Satu pengajuan mutasi PENDING per personel.
CREATE UNIQUE INDEX "Mutation_one_pending_per_personnel" ON "Mutation"("personnelId") WHERE "status" = 'PENDING';
-- Dokumen HO (siteId NULL) tetap unik per nomor.
CREATE UNIQUE INDEX "HseDocument_number_ho" ON "HseDocument"("number") WHERE "siteId" IS NULL;
