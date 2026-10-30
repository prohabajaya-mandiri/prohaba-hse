-- ID template bawaan dibuat dengan gen_random_uuid() (bertanda minus); validasi aplikasi hanya menerima
-- huruf/angka. Buang tanda minus (belum ada inspeksi yang merujuk saat migrasi ini dibuat; FK ikut ON UPDATE CASCADE).
UPDATE "InspectionTemplate" SET "id" = replace("id", '-', '') WHERE "id" LIKE '%-%';
