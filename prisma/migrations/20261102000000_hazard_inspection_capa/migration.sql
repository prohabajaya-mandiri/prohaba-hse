-- Hazard Report, Inspeksi & P2H, Register Tindakan Korektif (CAPA).

-- CreateTable
CREATE TABLE "HazardReport" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "immediateAction" TEXT,
    "likelihood" INTEGER NOT NULL,
    "severity" INTEGER NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BARU',
    "closedNote" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "reporterName" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HazardReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "unitType" TEXT,
    "items" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "inspectedOn" TIMESTAMP(3) NOT NULL,
    "shift" TEXT,
    "location" TEXT,
    "unitCode" TEXT,
    "unitType" TEXT,
    "hourMeter" INTEGER,
    "inspectorName" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "okCount" INTEGER NOT NULL DEFAULT 0,
    "notOkCount" INTEGER NOT NULL DEFAULT 0,
    "result" TEXT NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrectiveAction" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceRef" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "riskLevel" TEXT NOT NULL,
    "picName" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "correctiveAction" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TERBUKA',
    "verifierName" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorrectiveAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrectiveActionHistory" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "note" TEXT,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorrectiveActionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HazardReport_number_key" ON "HazardReport"("number");

-- CreateIndex
CREATE INDEX "HazardReport_siteId_status_idx" ON "HazardReport"("siteId", "status");

-- CreateIndex
CREATE INDEX "HazardReport_observedAt_idx" ON "HazardReport"("observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionTemplate_code_key" ON "InspectionTemplate"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_number_key" ON "Inspection"("number");

-- CreateIndex
CREATE INDEX "Inspection_siteId_inspectedOn_idx" ON "Inspection"("siteId", "inspectedOn");

-- CreateIndex
CREATE INDEX "Inspection_unitCode_inspectedOn_idx" ON "Inspection"("unitCode", "inspectedOn");

-- CreateIndex
CREATE UNIQUE INDEX "CorrectiveAction_number_key" ON "CorrectiveAction"("number");

-- CreateIndex
CREATE INDEX "CorrectiveAction_siteId_status_idx" ON "CorrectiveAction"("siteId", "status");

-- CreateIndex
CREATE INDEX "CorrectiveAction_status_dueDate_idx" ON "CorrectiveAction"("status", "dueDate");

-- CreateIndex
CREATE INDEX "CorrectiveAction_sourceType_sourceId_idx" ON "CorrectiveAction"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "CorrectiveActionHistory_actionId_createdAt_idx" ON "CorrectiveActionHistory"("actionId", "createdAt");

-- AddForeignKey
ALTER TABLE "HazardReport" ADD CONSTRAINT "HazardReport_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "InspectionTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectiveAction" ADD CONSTRAINT "CorrectiveAction_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectiveActionHistory" ADD CONSTRAINT "CorrectiveActionHistory_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "CorrectiveAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Template checklist bawaan (dapat diubah HO HSE di aplikasi). Butir kritis gagal = unit/area TIDAK LAYAK.
INSERT INTO "InspectionTemplate" ("id", "code", "name", "kind", "unitType", "items", "updatedAt") VALUES
  (gen_random_uuid()::text, 'P2H-DT', 'P2H Dump Truck', 'P2H', 'Dump Truck', '[
    {"text":"Rem utama & rem parkir berfungsi","critical":true},
    {"text":"Kemudi / steering normal","critical":true},
    {"text":"Ban & mur roda (tekanan, sobek, baut lengkap)","critical":true},
    {"text":"Lampu utama, sein & lampu rem","critical":true},
    {"text":"Klakson & alarm mundur","critical":true},
    {"text":"Sabuk pengaman","critical":true},
    {"text":"Tidak ada kebocoran oli / solar / hidrolik","critical":true},
    {"text":"Kaca & wiper","critical":false},
    {"text":"Spion lengkap & bersih","critical":false},
    {"text":"Level oli mesin","critical":false},
    {"text":"Level air radiator","critical":false},
    {"text":"Bak / dump body & hoist","critical":false},
    {"text":"APAR di unit & segel","critical":false},
    {"text":"Radio komunikasi","critical":false},
    {"text":"Kebersihan kabin","critical":false}]'::jsonb, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'P2H-EX', 'P2H Excavator', 'P2H', 'Excavator', '[
    {"text":"Rem swing & travel berfungsi","critical":true},
    {"text":"Tidak ada kebocoran silinder & selang hidrolik","critical":true},
    {"text":"Alarm travel & klakson","critical":true},
    {"text":"Sabuk pengaman","critical":true},
    {"text":"Track / undercarriage","critical":false},
    {"text":"Bucket, kuku & pin","critical":false},
    {"text":"Level oli mesin & hidrolik","critical":false},
    {"text":"Level air radiator","critical":false},
    {"text":"Lampu kerja","critical":false},
    {"text":"Kaca & wiper","critical":false},
    {"text":"Tangga & pegangan tangan","critical":false},
    {"text":"APAR di unit & segel","critical":false},
    {"text":"Radio komunikasi","critical":false}]'::jsonb, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'P2H-LV', 'P2H Light Vehicle', 'P2H', 'Light Vehicle', '[
    {"text":"Rem berfungsi","critical":true},
    {"text":"Kemudi normal","critical":true},
    {"text":"Ban & ban serep","critical":true},
    {"text":"Lampu utama & sein","critical":true},
    {"text":"Klakson","critical":true},
    {"text":"Sabuk pengaman semua kursi","critical":true},
    {"text":"Buggy whip / bendera & lampu rotary","critical":true},
    {"text":"Spion","critical":false},
    {"text":"Wiper","critical":false},
    {"text":"Level oli & air radiator","critical":false},
    {"text":"APAR & kotak P3K","critical":false},
    {"text":"Radio komunikasi","critical":false},
    {"text":"Ganjal ban (wheel chock)","critical":false}]'::jsonb, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'INSP-AREA', 'Inspeksi Area Kerja', 'AREA', NULL, '[
    {"text":"Tanggul / safety berm memadai","critical":true},
    {"text":"Pekerja memakai APD sesuai","critical":true},
    {"text":"Izin kerja tersedia untuk pekerjaan berisiko","critical":true},
    {"text":"Housekeeping area kerja","critical":false},
    {"text":"Kondisi jalan tambang & drainase","critical":false},
    {"text":"Penerangan area kerja","critical":false},
    {"text":"Rambu K3 terpasang & terbaca","critical":false},
    {"text":"Bahan kimia / B3 berlabel & tersimpan","critical":false},
    {"text":"Tempat sampah & pemilahan limbah","critical":false},
    {"text":"Barikade / pagar pengaman","critical":false},
    {"text":"Titik kumpul & jalur evakuasi","critical":false}]'::jsonb, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'INSP-APAR', 'Inspeksi APAR', 'APAR', NULL, '[
    {"text":"Tekanan pada zona hijau","critical":true},
    {"text":"Segel & pin pengaman utuh","critical":true},
    {"text":"Selang & nozzle baik","critical":false},
    {"text":"Label & tanggal pemeriksaan","critical":false},
    {"text":"Mudah dijangkau & tidak terhalang","critical":false},
    {"text":"Tanda lokasi APAR terpasang","critical":false}]'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Hak runtime & RLS untuk tabel baru (setara "setup-db.mjs grants"), agar migrasi ini mandiri.
-- Role runtime: hse_runtime (schema public) atau hse_runtime_dev (hse_dev); dilewati bila role tidak ada (lokal).
DO $$
DECLARE
  rt text := CASE current_schema() WHEN 'public' THEN 'hse_runtime' ELSE 'hse_runtime_dev' END;
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rt) THEN
    FOREACH t IN ARRAY ARRAY['HazardReport', 'InspectionTemplate', 'Inspection', 'CorrectiveAction', 'CorrectiveActionHistory'] LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO %I', t, rt);
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('CREATE POLICY %I ON %I TO %I USING (true) WITH CHECK (true)', rt || '_access', t, rt);
    END LOOP;
    -- Riwayat tindakan korektif append-only.
    EXECUTE format('REVOKE UPDATE, DELETE ON TABLE %I FROM %I', 'CorrectiveActionHistory', rt);
  END IF;
END $$;
