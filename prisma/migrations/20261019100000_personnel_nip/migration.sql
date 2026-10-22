-- NIP (Nomor Induk Pegawai) diisi HRD. Nullable: data lama dilengkapi bertahap; unik bila terisi.
ALTER TABLE "Personnel" ADD COLUMN "nip" TEXT;

CREATE UNIQUE INDEX "Personnel_nip_key" ON "Personnel"("nip");
