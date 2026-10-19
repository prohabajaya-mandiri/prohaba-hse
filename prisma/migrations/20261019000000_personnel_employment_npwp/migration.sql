-- Status kepegawaian (PKWT/PKWTT), akhir kontrak, dan NPWP terenkripsi.
ALTER TABLE "Personnel" ADD COLUMN "employmentType" TEXT,
ADD COLUMN "contractEndDate" TIMESTAMP(3),
ADD COLUMN "npwpEnc" TEXT;
