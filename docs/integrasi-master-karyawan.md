# Integrasi Master Data Karyawan (ERP Center ⇄ E-HSE)

Sejak 2026-10-19 "Master Data Pegawai" (ERP) dan "Database Personel" (E-HSE) disatukan menjadi
**Master Data Karyawan**. Form, aturan validasi, import Excel, export dan detail karyawan sama di kedua aplikasi.

## Prinsip

| Aturan | Penjelasan |
|---|---|
| Satu sumber data | E-HSE (`Personnel`) adalah *system of record*. Satu NIK = satu profil (deteksi lewat HMAC NIK). |
| Tulis lewat sumber | Tambah/ubah/status kerja/import di ERP diteruskan ke API E-HSE. Validasi, enkripsi data pribadi, dan audit log terjadi di E-HSE. ERP tidak pernah menulis data karyawan langsung ke tabelnya sendiri. |
| Salinan lokal minimal | Tabel `Employee` ERP = salinan (*mirror*) tanpa NIK utuh, alamat KTP, rekening, NPWP atau data medis. Dipakai sebagai relasi penugasan, absensi dan payroll (riwayat payroll tetap utuh meski E-HSE tidak terhubung). |
| Sinkronisasi pull + idempoten | ERP menarik `/personnel/changes` dengan kursor `(updatedAt, id)`. Dijalankan segera setelah setiap penulisan, saat halaman SDM/payroll dibuka (maks. 5 menit sekali), sebelum generate payroll (maks. 1 menit), dan lewat tombol **Sinkronkan**. Mengulang sinkronisasi aman. |
| Satu matriks hak akses | Peran ERP dipetakan ke peran E-HSE (`prohaba-hse/src/lib/integration.js`): `HRD → HRD` (ubah data, KTP, rekening, status kepegawaian), `TOP_MANAGEMENT → DIREKSI` (lihat saja), sinkronisasi otomatis → `DIREKSI`. Peran lain ditolak. |
| Jejak audit | Setiap aksi tercatat di audit log E-HSE atas nama pengguna ERP, mis. `Rina (ERP Center)`, termasuk membuka NIK/rekening (`VIEW_SENSITIVE`). |
| Degradasi aman | Bila E-HSE tidak dapat dihubungi, daftar karyawan menampilkan salinan terakhir (baca saja); penugasan, absensi dan payroll tetap berjalan. |

## Keamanan koneksi

Server-ke-server melalui HTTPS, ditandatangani HMAC-SHA256 (`src/lib/integration-signature.js`, identik di kedua repo).
Tanda tangan mencakup metode, path+query, hash isi, waktu (±5 menit) dan identitas pelaku, sehingga permintaan
tidak dapat diubah atau dipakai oleh pihak lain. Secret tidak pernah dikirim ke browser.

| Aplikasi | Variabel |
|---|---|
| E-HSE | `INTEGRATION_CENTER_SECRET` (≥ 32 karakter acak) |
| ERP Center | `HSE_API_URL` (mis. `https://prohaba-hse.vercel.app`), `HSE_INTEGRATION_SECRET` (nilai sama) |

Buat secret: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
Gunakan secret berbeda untuk development dan produksi; ganti (rotasi) bersamaan di kedua aplikasi bila bocor.
Bila Vercel Deployment Protection aktif pada E-HSE produksi, pastikan domain produksi tidak dilindungi untuk `/api/integration/*`.

## Endpoint E-HSE (`/api/integration/v1`)

| Metode & path | Fungsi |
|---|---|
| `GET /sites` | Daftar site untuk pilihan "Site awal" |
| `GET /personnel?q&siteId&category&workStatus&employmentType&former&page` / `?picker=1` | Daftar & pencarian |
| `POST /personnel` (multipart `data`, `ktp`) | Tambah karyawan |
| `GET/PUT /personnel/:id` | Detail / ubah |
| `POST /personnel/:id/status` | Status kerja |
| `GET /personnel/:id/sensitive?kind=KTP\|BANK` | Buka NIK/rekening (diaudit) |
| `GET /personnel/:id/ktp` | File KTP (diaudit) |
| `POST /personnel/import` | Import Excel (`preview`/`commit`) |
| `GET /personnel/export`, `GET /personnel/template` | Export & template |
| `GET /personnel/changes?since&after&limit` / `?ids=` | Umpan perubahan untuk salinan lokal, termasuk site aktif (`siteId`, `siteIsHo`), riwayat penempatan (`placements`), MCU terakhir (`mcu`: hasil & masa berlaku) dan permit (`permits`: jenis, site, tanggal, dicabut; tanpa nomor) |
| `POST /personnel/lookup` | Cocokkan NIK data lama |

## Data pegawai lama ERP

Migrasi `20261019000000_employee_hse_mirror` bersifat aditif. Pegawai yang dibuat sebelum integrasi tampil di
panel **"pegawai lama belum tertaut"** (Master Data → Karyawan, khusus HRD):

1. **Tautkan otomatis berdasarkan NIK** — bila NIK sudah ada di E-HSE, baris lama ditautkan ke profil tersebut.
2. **Daftarkan** — form terisi dari data lama; lengkapi alamat KTP & site. Setelah tersimpan di E-HSE, baris lama ditautkan.

Riwayat penugasan/absensi/payroll ikut tersambung. Setelah tertaut, NIK/NPWP/rekening lama di ERP dikosongkan
(tersimpan terenkripsi di E-HSE). Penugasan baru hanya dapat dibuat untuk karyawan aktif yang sudah tertaut.
Kolom lama (`department`, `employeeType`, `baseSalary`) dibiarkan untuk riwayat dan dapat dihapus pada migrasi
berikutnya setelah semua data tertaut.

## Satu master site & penugasan dari penempatan

Sejak 2026-10-25 site hanya dikelola di E-HSE. Proyek ERP **ditautkan ke satu Site E-HSE** (menu Proyek → *Site E-HSE*,
wajib untuk proyek baru); data kontrak, nilai dan BOQ tetap di ERP. Satu site boleh punya beberapa proyek ERP.

ERP menyalin riwayat penempatan (`Placement`) ke tabel `EmployeePlacement` lewat umpan `/personnel/changes`, lalu
menyesuaikan penugasan (`EmployeeProject`) — aturannya di `src/lib/assignment-plan.js` (prohaba-center):

| Kejadian di E-HSE | Akibat di ERP |
|---|---|
| Personel ditempatkan di site yang punya **tepat satu** proyek ERP aktif | Penugasan otomatis dibuat (sumber *Otomatis*, mulai = tanggal penempatan atau mulai proyek yang lebih akhir). Tarif belum diisi: payroll proyek itu menunggu HRD melengkapi tarif. |
| Site punya **lebih dari satu** proyek aktif | Tampil di Master Data → Penugasan & tarif → *Pilih proyek*; HRD memilih proyeknya. |
| Site **tanpa** proyek ERP aktif | Tampil sebagai *Site tanpa proyek ERP aktif*. |
| Penempatan berakhir (mutasi, demobilisasi, resign) | Penugasan di proyek site itu diakhiri pada tanggal akhir penempatan. ERP hanya memajukan tanggal selesai, tidak pernah memperpanjangnya. |
| Kembali ke site yang sama | Periode penugasan baru (satu karyawan boleh punya beberapa periode di satu proyek, tidak tumpang tindih). |

Penugasan yang diisi HRD diperiksa: proyek harus sudah bertaut site, dan karyawan harus ditempatkan di site proyek
sepanjang periode penugasan. **Personel HO** (penempatan di site HO) boleh dialokasikan ke proyek mana pun.
Penugasan lama yang tidak cocok dengan penempatan ditampilkan sebagai *Tidak sesuai penempatan* untuk diperbaiki.

Penyesuaian berjalan setelah setiap sinkronisasi karyawan dan setelah tautan site/status proyek berubah. Salinan yang
belum pernah menerima riwayat penempatan diisi otomatis pada sinkronisasi pertama setelah rilis. Perubahan otomatis
tidak dicatat di audit log ERP (pelakunya sinkronisasi); jejak perubahan penempatan ada di audit log E-HSE.

## MCU & permit untuk tanda HSE

ERP menyalin hasil & masa berlaku MCU terakhir (tanpa catatan medis) dan permit (tanpa nomor) ke `Employee.mcuResult`,
`mcuValidUntil` dan tabel `EmployeePermit`. Absensi barcode dan pengambilan BBM **tidak diblokir**, tetapi ditandai bila MCU
UNFIT/kedaluwarsa atau (BBM alat berat/kendaraan) SIMPER/KIMPER tidak berlaku di site tersebut — lihat
`docs/absensi-barcode.md` dan `docs/bbm-drum-site.md` di prohaba-center. Perubahan MCU dan permit di E-HSE memperbarui
`updatedAt` personel sehingga ikut umpan sinkronisasi; status kedaluwarsa dihitung ERP pada tanggal kejadian.

## Berkas bersama

`src/lib/integration-signature.js` dan `src/lib/hse/*` adalah salinan dari E-HSE. Jangan ubah di ERP:
ubah di E-HSE lalu jalankan `node scripts/check-hse-shared.mjs --write`. Uji unit gagal bila salinan berbeda
(saat kedua repo berdampingan).

## Urutan rilis

1. E-HSE: deploy kode, set `INTEGRATION_CENTER_SECRET`.
2. ERP: backup, `npm run db:migrate` (development) / migrasi produksi, set `HSE_API_URL` + `HSE_INTEGRATION_SECRET`, deploy.
3. Buka Master Data → Karyawan sebagai HRD → **Sinkronkan**, lalu tautkan data pegawai lama.
4. Proyek aktif: tautkan ke site E-HSE di menu Proyek, lalu HRD melengkapi tarif penugasan otomatis dan memilih proyek
   untuk site yang punya lebih dari satu proyek (Master Data → Penugasan & tarif).
