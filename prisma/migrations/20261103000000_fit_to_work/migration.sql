-- Fit to Work (P5M / Safety Talk) dan tes alkohol.

-- CreateTable
CREATE TABLE "FitSession" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "heldOn" TIMESTAMP(3) NOT NULL,
    "shift" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "department" TEXT,
    "location" TEXT,
    "presenter" TEXT NOT NULL,
    "notes" TEXT,
    "total" INTEGER NOT NULL DEFAULT 0,
    "okCount" INTEGER NOT NULL DEFAULT 0,
    "watchCount" INTEGER NOT NULL DEFAULT 0,
    "stopCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "creatorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FitSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitCheck" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "personnelId" TEXT,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "healthy" BOOLEAN NOT NULL DEFAULT true,
    "medication" BOOLEAN NOT NULL DEFAULT false,
    "restToday" INTEGER NOT NULL,
    "restYesterday" INTEGER,
    "mentalReady" BOOLEAN NOT NULL DEFAULT true,
    "allowedByGl" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL,
    "reasons" TEXT,
    "note" TEXT,

    CONSTRAINT "FitCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlcoholTest" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "personnelId" TEXT,
    "name" TEXT NOT NULL,
    "testedOn" TIMESTAMP(3) NOT NULL,
    "result" TEXT NOT NULL,
    "method" TEXT,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "creatorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlcoholTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FitSession_number_key" ON "FitSession"("number");

-- CreateIndex
CREATE INDEX "FitSession_siteId_heldOn_idx" ON "FitSession"("siteId", "heldOn");

-- CreateIndex
CREATE INDEX "FitCheck_sessionId_idx" ON "FitCheck"("sessionId");

-- CreateIndex
CREATE INDEX "FitCheck_personnelId_idx" ON "FitCheck"("personnelId");

-- CreateIndex
CREATE INDEX "FitCheck_status_idx" ON "FitCheck"("status");

-- CreateIndex
CREATE INDEX "AlcoholTest_siteId_testedOn_idx" ON "AlcoholTest"("siteId", "testedOn");

-- CreateIndex
CREATE INDEX "AlcoholTest_personnelId_testedOn_idx" ON "AlcoholTest"("personnelId", "testedOn");

-- AddForeignKey
ALTER TABLE "FitSession" ADD CONSTRAINT "FitSession_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitCheck" ADD CONSTRAINT "FitCheck_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "FitSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlcoholTest" ADD CONSTRAINT "AlcoholTest_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hak runtime & RLS untuk tabel baru (setara "setup-db.mjs grants"); dilewati bila role tidak ada (lokal).
DO $$
DECLARE
  rt text := CASE current_schema() WHEN 'public' THEN 'hse_runtime' ELSE 'hse_runtime_dev' END;
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rt) THEN
    FOREACH t IN ARRAY ARRAY['FitSession', 'FitCheck', 'AlcoholTest'] LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO %I', t, rt);
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('CREATE POLICY %I ON %I TO %I USING (true) WITH CHECK (true)', rt || '_access', t, rt);
    END LOOP;
  END IF;
END $$;
