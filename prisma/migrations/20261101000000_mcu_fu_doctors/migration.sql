-- Dokter rujukan Follow Up MCU (maks. 6, dari daftar baku di aplikasi).
ALTER TABLE "McuRecord" ADD COLUMN "fuDoctors" TEXT[] DEFAULT ARRAY[]::TEXT[];
