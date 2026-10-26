# E-HSE PT. Prohaba Jaya Mandiri

Aplikasi HSE terintegrasi Head Office dan seluruh site, dibangun dari *Master Requirement E-HSE PJM (16 modul)*.
Stack mengikuti ERP prohaba-center: Next.js 16 (App Router, JS), Auth.js v5, Prisma 7 + `@prisma/adapter-pg`, Supabase PostgreSQL, design system yang sama (navy + orange). Node.js 22.

## Modul

| # | Modul | Halaman |
|---|---|---|
| 01 | User & hak akses, akun bersama (operator + PIN), audit log | `/users`, `/audit-log`, `/account` |
| 02 | Dashboard HO / site (angka dari modul sumber, filter site/periode/kategori/status) | `/dashboard` |
| 03 | Master site & proyek, riwayat penanggung jawab | `/sites` |
| 04 | Database personel, OCR KTP (di browser), import Excel dengan preview, export | `/personnel` |
| 05 | Penempatan & mutasi (disahkan HO, riwayat tidak ditimpa) | `/placements` |
| 06 | MCU (alur screening → mobilisasi, FIT/FU/UNFIT, annual) | `/mcu` |
| 07 | Permit kerja & SKS (acuan FIT 12 bln / FU 3 bln, tanpa penerbitan otomatis) | `/permits` |
| 08 | Mobilisasi & demobilisasi (kloter, cek MCU/permit, konfirmasi tiba) | `/mobilization` |
| 09 | Roster, cuti & kehadiran (pola per site/kategori/status nikah) | `/roster` |
| 10 | HSE performance (manhours, safe manhours, aktivitas + foto, tren, export) | `/performance` |
| 11 | Laporan HSE site (Draft → HSE Site → PJO/PM → HO, batas tgl 10, arsip versi) | `/reports` |
| 12 | Insiden & kecelakaan kerja (investigasi, tindakan korektif/pencegahan) | `/incidents` |
| 13 | Training & kompetensi (sertifikat, jadwal, hasil, kebutuhan per jabatan) | `/training` |
| 14 | Monitoring HRD & simulasi efisiensi (hanya simulasi) | `/hrd` |
| 15 | Dokumen HSE & compliance (versi, masa berlaku, arsip) | `/documents` |
| 16 | Notifikasi & approval | `/notifications`, `/approvals` |
| 17 | Pendaftaran mandiri pegawai baru (form publik + QR, diverifikasi HO HSE/HRD → personel, penempatan & rencana MCU H+1) | `/daftar` (publik), `/registrations` |

Form `/daftar` tidak memerlukan login: isian ditampung di tabel `Registration` (NIK & alamat KTP terenkripsi, foto KTP terenkripsi, dibatasi laju per IP) dan baru menjadi personel setelah disetujui. Tanggal tiba memakai kalender **WITA** (Balikpapan).

Master data karyawan **satu sumber**: modul 04 juga melayani ERP Center melalui `/api/integration/v1/*` (server-ke-server, HMAC, peran ERP dipetakan ke matriks akses E-HSE, audit atas nama pengguna ERP). Perlu `INTEGRATION_CENTER_SECRET`. Lihat `docs/integrasi-master-karyawan.md`.

Parameter Bab 7 (formula manhours, ambang pengingat, matriks akses gaji, kategori & tenggat insiden, dll.) ada di `/settings`, berstatus **Draft** sampai disetujui HO PJM.

## Keamanan data

- Cakupan site: HO HSE, HRD, Direksi lintas site; HSE Site & PJO per site; PM per site/wilayah. Filter site dari URL selalu dipotong dengan cakupan pengguna (`siteFilter`).
- NIK, alamat KTP, rekening, riwayat penyakit, catatan MCU dan gaji dienkripsi AES-256-GCM di aplikasi (`DATA_ENCRYPTION_KEY`). NIK juga disimpan sebagai HMAC untuk deteksi duplikasi. File KTP/MCU dienkripsi sebelum disimpan.
- Membuka NIK/rekening utuh atau file sensitif dicatat di audit log (`VIEW_SENSITIVE`). Audit log tidak pernah menyimpan nilai terenkripsi.
- Database: role runtime `hse_runtime(_dev)` NOBYPASSRLS tanpa DDL, RLS aktif di semua tabel; `AuditLog`, `ApprovalLog`, `HseReportHistory` append-only (UPDATE/DELETE dicabut).

## Menjalankan development

Database development: Supabase project **prohaba-hse** (`crysaxbpngmscobrukzb`), schema `hse_dev`.

    npm ci
    npm run dev

`.env` hanya berisi runtime development. Kredensial migrasi ada di `.env.migrations.development.local` (tidak dimuat Next.js).
Akun HO HSE pertama dibuat seeder; kredensial di `.env.admin.local`. Akun demo (semua peran + akun bersama) di `.env.demo-users.local`.

## Migrasi & setup database

Token Management API dipakai dari `../prohaba-center/.env.management.local` (`SUPABASE_TOKEN`).

    node --env-file=../prohaba-center/.env.management.local scripts/setup-db.mjs development roles
    npm run db:migrate
    node --env-file=../prohaba-center/.env.management.local scripts/setup-db.mjs development grants
    npm run seed          # data referensi: 10 site, indikator, pola roster, kompetensi, skenario
    npm run seed:demo     # hanya schema hse_dev

`npm run db:migrate` hanya memigrasi **development** (schema `hse_dev`). Untuk produksi: `git pull`, lalu `npm run db:status:production` dan `npm run db:migrate:production` **sebelum** deploy kode yang memakai kolom baru.

Produksi memakai schema `public` dan role `hse_migrate` / `hse_runtime` (`... production roles|grants`, dengan `.env.migrations.production.local`). Jalankan `grants` setiap kali migrasi menambah tabel. Jangan memakai `db push`.

## Storage file

`STORAGE_DRIVER=local` (folder `.storage/`, hanya development). Produksi: `STORAGE_DRIVER=s3` ke bucket privat Supabase Storage dengan **S3 access key khusus storage** (Dashboard → Storage → S3 Connection), bukan service role key. Isi `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.

## Pengingat

`/api/cron/reminders` (Vercel Cron harian 05:00 WIB, header `Authorization: Bearer CRON_SECRET`) membuat notifikasi MCU annual, Follow Up H-7, permit, roster, sertifikat, laporan bulanan tanggal 10 dan dokumen. Pemindaian juga berjalan malas maksimal sekali per jam saat dashboard dibuka. WhatsApp/email: fase berikutnya.

## Pengujian

    npm run verify                                   # lint + unit test + build
    node scripts/smoke.mjs http://localhost:3000     # semua halaman × semua peran + isolasi site
    node scripts/workflow.mjs http://localhost:3000  # alur personel, import, MCU, permit, mutasi, laporan

## Belum final / perlu keputusan PJM

- Parameter Bab 7 di `/settings` dan target indikator di `/performance?tab=indicators`.
- Format cetak laporan resmi (saat ini cetak/PDF dari browser dengan struktur Bab 6.2).
- Wilayah Timur/Barat dan status aktif 10 site referensi.
- Kompetensi contoh di seeder (Induksi, First Aid, AK3U, POP) dan kebutuhan per jabatan.
- OCR KTP memakai tesseract.js di browser (unduh model bahasa dari CDN saat pertama dipakai); hasil wajib diverifikasi manual.
