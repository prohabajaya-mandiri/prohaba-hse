-- Pendidikan terakhir pada pendaftaran pegawai baru.
-- (Tanggal mulai kerja memakai kolom "arrivalDate" yang sudah ada, dipetakan di Prisma.)
ALTER TABLE "Registration" ADD COLUMN "education" TEXT;
