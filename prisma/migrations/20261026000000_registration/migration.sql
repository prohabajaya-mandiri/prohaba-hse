-- Pendaftaran mandiri pegawai baru (form publik), diverifikasi HO HSE / HRD.
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'MENUNGGU',
    "name" TEXT NOT NULL,
    "nikHash" TEXT NOT NULL,
    "nikEnc" TEXT NOT NULL,
    "nikLast4" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "gender" TEXT,
    "category" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "phoneWa" TEXT NOT NULL,
    "ktpAddressEnc" TEXT NOT NULL,
    "emergencyName" TEXT NOT NULL,
    "emergencyPhone" TEXT NOT NULL,
    "emergencyRelation" TEXT,
    "ktpFileId" TEXT,
    "arrivalDate" TIMESTAMP(3) NOT NULL,
    "mcuDate" TIMESTAMP(3) NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "personnelId" TEXT,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Registration_number_key" ON "Registration"("number");
CREATE INDEX "Registration_status_createdAt_idx" ON "Registration"("status", "createdAt");
CREATE INDEX "Registration_nikHash_idx" ON "Registration"("nikHash");

ALTER TABLE "Registration" ADD CONSTRAINT "Registration_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
